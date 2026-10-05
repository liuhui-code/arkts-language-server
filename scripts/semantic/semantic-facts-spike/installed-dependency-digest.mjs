import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import JSON5 from "json5"

const MAX_WORKSPACE_ENTRIES = 100_000
const MAX_INSTALLED_ENTRIES = 100_000
const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_INSTALLED_BYTES = 512 * 1024 * 1024

/** An explicit, bounded snapshot of installed ohpm bytes and link topology. */
export async function digestInstalledDependencies(workspaceRoot) {
  return (await snapshotInstalledDependencies(workspaceRoot)).digest
}

/** Return the exact pinned package sources, distinct from project membership. */
export async function snapshotInstalledDependencies(workspaceRoot) {
  const root = await fs.realpath(workspaceRoot)
  const { installs, locks, manifests } = await discoverInputs(root)
  if (!installs.length) throw new Error("installed pin requires at least one oh_modules directory")
  const records = []
  const packages = []
  const budget = { entries: 0, bytes: 0 }
  for (const install of installs) {
    records.push([relativeWithin(root, install), "directory"])
    const pending = [install]
    while (pending.length) {
      const directory = pending.pop()
      const children = await fs.readdir(directory, { withFileTypes: true })
      children.sort((a, b) => ordinal(a.name, b.name))
      for (const child of children) {
        countEntry(budget)
        const absolute = path.join(directory, child.name)
        const relative = relativeWithin(root, absolute)
        if (child.name === "node_modules") throw new Error(`node_modules is not pinned: ${relative}`)
        const stat = await fs.lstat(absolute)
        if (stat.isSymbolicLink()) {
          const target = await packageLinkTarget(root, absolute)
          records.push([relative, "link", await fs.readlink(absolute), relativeWithin(root, target)])
          packages.push({ absolute, target, link: true })
        } else if (stat.isDirectory()) {
          records.push([relative, "directory"])
          pending.push(absolute)
        } else if (stat.isFile()) {
          if (stat.size > MAX_FILE_BYTES) throw new Error(`installed file exceeds byte budget: ${relative}`)
          countBytes(budget, stat.size)
          const contents = await fs.readFile(absolute)
          records.push([relative, "file", sha256(contents)])
          if (child.name === "oh-package.json5" && packagePath(path.dirname(absolute))) {
            packages.push({ absolute: path.dirname(absolute), target: path.dirname(absolute), link: false })
          }
        } else {
          throw new Error(`installed pin found unsupported filesystem entry: ${relative}`)
        }
      }
    }
  }
  const localTargets = new Set()
  const packageRoots = new Set()
  for (const item of packages) {
    if (await verifyPackage(root, item, locks) === "local") localTargets.add(item.target)
    packageRoots.add(item.target)
  }
  for (const [owner, manifest] of manifests) {
    await addDeclaredLocalTargets(root, owner, manifest, localTargets)
  }
  for (const item of packages) {
    await addDeclaredLocalTargets(root, item.target,
      await readJson5(path.join(item.target, "oh-package.json5")), localTargets)
  }
  for (const target of [...localTargets].sort(ordinal)) {
    if (!installs.some((install) => within(install, target))) {
      await recordLocalTarget(root, target, records, budget)
    }
  }
  records.sort((a, b) => ordinal(a[0], b[0]))
  const semanticSourceSha256 = Object.fromEntries(records.filter(([file, kind]) =>
    (kind === "file" || kind === "local-file") && /\.(?:ets|ts)$/u.test(file)
    && [...packageRoots].some((packageRoot) => {
      const nested = path.relative(packageRoot, path.join(root, file))
      return nested && within(packageRoot, path.join(root, file))
        && !nested.split(path.sep).includes("oh_modules")
    })).map(([file, , hash]) => [file, hash]))
  return { digest: sha256(JSON.stringify([root, records])), semanticSourceSha256 }
}

async function discoverInputs(root) {
  const pending = [root]
  const installs = []
  const locks = new Map()
  const manifests = new Map()
  let entries = 0
  while (pending.length) {
    const directory = pending.pop()
    const children = await fs.readdir(directory, { withFileTypes: true })
    children.sort((a, b) => ordinal(a.name, b.name))
    for (const child of children) {
      if (++entries > MAX_WORKSPACE_ENTRIES) throw new Error("installed workspace scan exceeds entry budget")
      if (child.name === ".git") continue
      const absolute = path.join(directory, child.name)
      if (child.name === "node_modules") throw new Error(`node_modules is not pinned: ${absolute}`)
      if (child.name === "oh_modules") {
        if (!child.isDirectory()) throw new Error(`installed root must be a directory: ${absolute}`)
        installs.push(absolute)
        continue
      }
      if (child.isSymbolicLink()) throw new Error(`unrelated symbolic link is not pinned: ${absolute}`)
      if (child.isDirectory()) pending.push(absolute)
      else if (child.isFile() && child.name === "oh-package-lock.json5") {
        locks.set(directory, await readJson5(absolute))
      } else if (child.isFile() && child.name === "oh-package.json5") {
        manifests.set(directory, await readJson5(absolute))
      } else if (!child.isFile()) throw new Error(`unsupported workspace entry: ${absolute}`)
    }
  }
  installs.sort(ordinal)
  return { installs, locks, manifests }
}

async function addDeclaredLocalTargets(root, owner, manifest, targets) {
  for (const specifier of Object.values({ ...manifest.dependencies,
    ...manifest.devDependencies, ...manifest.dynamicDependencies })) {
    if (typeof specifier !== "string" || !specifier.startsWith("file:")) continue
    const target = await fs.realpath(path.resolve(owner, specifier.slice(5)))
    relativeWithin(root, target)
    if (!(await fs.stat(target)).isDirectory()
      || !(await fs.lstat(path.join(target, "oh-package.json5"))).isFile()) {
      throw new Error(`declared local dependency has no regular package manifest: ${owner}`)
    }
    targets.add(target)
  }
}

async function packageLinkTarget(root, link) {
  if (!packagePath(link)) throw new Error(`unrelated symbolic link is not pinned: ${link}`)
  let target
  try {
    target = await fs.realpath(link)
  } catch {
    throw new Error(`installed package link is dangling or cyclic: ${link}`)
  }
  relativeWithin(root, target)
  if (!(await fs.stat(target)).isDirectory()) throw new Error(`installed package link is not a directory: ${link}`)
  const manifest = path.join(target, "oh-package.json5")
  if (!(await fs.lstat(manifest)).isFile()) throw new Error(`installed package has no regular manifest: ${link}`)
  return target
}

async function verifyPackage(root, item, locks) {
  const manifest = await readJson5(path.join(item.target, "oh-package.json5"))
  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(`installed package has invalid name or version: ${item.absolute}`)
  }
  const owner = packageOwner(item.absolute)
  const ownerManifest = owner ? await optionalJson5(path.join(owner, "oh-package.json5")) : null
  if (item.link && !ownerManifest && owner !== path.join(root, "oh_modules", ".ohpm")) {
    throw new Error(`installed package owner has no manifest: ${item.absolute}`)
  }
  const alias = item.link ? packageNameFromPath(item.absolute) : null
  const specifier = alias && ownerManifest
    ? { ...ownerManifest.dependencies, ...ownerManifest.devDependencies }[alias] : undefined
  if (item.link && ownerManifest && typeof specifier !== "string") {
    throw new Error(`installed package link is not a declared dependency: ${item.absolute}`)
  }
  if (typeof specifier === "string" && specifier.startsWith("file:")) {
    const relative = specifier.slice(5)
    const expected = await fs.realpath(path.resolve(owner, relative))
    if (expected !== item.target) throw new Error(`installed local package link disagrees with manifest: ${item.absolute}`)
    const lock = locks.get(owner)
    const matches = []
    for (const [specifierKey, packageKey] of Object.entries(lock?.specifiers ?? {})) {
      if (!specifierKey.startsWith(`${alias}@`)) continue
      const row = lock.packages?.[packageKey]
      if (await samePhysicalTarget(owner, specifierKey.slice(alias.length + 1), item.target)
        && typeof row?.resolved === "string"
        && await samePhysicalTarget(owner, row.resolved, item.target)) matches.push(row)
    }
    if (lock && (matches.length !== 1 || matches[0].registryType !== "local"
      || matches[0].name !== manifest.name
      || matches[0].version !== (manifest.version || "0.0.0"))) {
      throw new Error(`installed local package disagrees with exact lock row: ${item.absolute}`)
    }
    return "local"
  }
  if (item.link && ownerManifest && !locks.has(owner)) {
    throw new Error(`installed registry package owner has no lock: ${item.absolute}`)
  }
  if (!item.link && item.absolute !== registryStorePath(root, manifest)) {
    throw new Error(`installed registry package is not matched by exact lock row: ${relativeWithin(root, item.absolute)}`)
  }
  const matching = [...locks.values()].some(lock => Object.entries(lock.packages ?? {}).some(
    ([key, row]) => row?.registryType === "ohpm" && row.name === manifest.name
      && row.version === manifest.version && validIntegrity(row.integrity)
      && (specifier === undefined || (lock === locks.get(owner)
        && lock.specifiers?.[`${alias}@${specifier}`] === key)),
  ))
  if (!matching) throw new Error(`installed registry package is not matched by exact lock row: ${relativeWithin(root, item.absolute)}`)
  if (item.link && !within(path.join(root, "oh_modules", ".ohpm"), item.target)) {
    throw new Error(`registry package target is outside the pinned store: ${item.absolute}`)
  }
  return "registry"
}

function registryStorePath(root, manifest) {
  const parts = manifest.name.split("/")
  if (!((parts.length === 1 && /^[A-Za-z0-9._-]+$/u.test(parts[0]))
    || (parts.length === 2 && /^@[A-Za-z0-9._-]+$/u.test(parts[0])
      && /^[A-Za-z0-9._-]+$/u.test(parts[1])))
    || !/^[A-Za-z0-9._+-]+$/u.test(manifest.version)) {
    throw new Error("installed registry package has invalid store identity")
  }
  return path.join(root, "oh_modules", ".ohpm", `${parts.join("+")}@${manifest.version}`,
    "oh_modules", ...parts)
}

async function recordLocalTarget(root, target, records, budget) {
  const pending = [target]
  while (pending.length) {
    const directory = pending.pop()
    records.push([relativeWithin(root, directory), "local-directory"])
    const children = await fs.readdir(directory, { withFileTypes: true })
    children.sort((a, b) => ordinal(a.name, b.name))
    for (const child of children) {
      countEntry(budget)
      if (child.name === ".git") throw new Error(`local package target contains unpinned .git: ${directory}`)
      if (child.name === "oh_modules") continue
      const absolute = path.join(directory, child.name)
      const relative = relativeWithin(root, absolute)
      if (child.name === "node_modules") throw new Error(`node_modules is not pinned: ${relative}`)
      const stat = await fs.lstat(absolute)
      if (stat.isSymbolicLink()) throw new Error(`unrelated symbolic link is not pinned: ${absolute}`)
      if (stat.isDirectory()) pending.push(absolute)
      else if (stat.isFile()) {
        if (stat.size > MAX_FILE_BYTES) throw new Error(`installed file exceeds byte budget: ${relative}`)
        countBytes(budget, stat.size)
        records.push([relative, "local-file", sha256(await fs.readFile(absolute))])
      } else throw new Error(`installed pin found unsupported filesystem entry: ${relative}`)
    }
  }
}

function countEntry(budget) {
  if (++budget.entries > MAX_INSTALLED_ENTRIES) throw new Error("installed pin exceeds entry budget")
}

function countBytes(budget, size) {
  budget.bytes += size
  if (budget.bytes > MAX_INSTALLED_BYTES) throw new Error("installed pin exceeds total byte budget")
}

function within(root, absolute) {
  const relative = path.relative(root, absolute)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function samePhysicalTarget(owner, relative, target) {
  try { return await fs.realpath(path.resolve(owner, relative)) === target } catch { return false }
}

function packagePath(absolute) {
  const parts = absolute.split(path.sep)
  const last = parts.lastIndexOf("oh_modules")
  if (last < 0) return false
  const packageParts = parts.slice(last + 1)
  if (packageParts.length === 1) return packageParts[0] !== ".ohpm" && !packageParts[0].startsWith("@")
  return packageParts.length === 2 && packageParts[0].startsWith("@") && Boolean(packageParts[1])
}

function packageOwner(absolute) {
  const parts = absolute.split(path.sep)
  const last = parts.lastIndexOf("oh_modules")
  return last < 0 ? null : parts.slice(0, last).join(path.sep) || path.sep
}

function packageNameFromPath(absolute) {
  const parts = absolute.split(path.sep)
  return parts.slice(parts.lastIndexOf("oh_modules") + 1).join("/")
}

async function optionalJson5(file) {
  try { return await readJson5(file) } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

async function readJson5(file) {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error(`invalid package config: ${file}`)
  return JSON5.parse(await fs.readFile(file, "utf8"))
}

function validIntegrity(value) {
  if (typeof value !== "string") return false
  const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/u.exec(value)
  if (!match) return false
  const bytes = Buffer.from(match[2], "base64")
  return bytes.length === { sha256: 32, sha384: 48, sha512: 64 }[match[1]]
    && bytes.toString("base64") === match[2]
}

function relativeWithin(root, absolute) {
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`installed path escapes workspace: ${absolute}`)
  }
  return relative.split(path.sep).join("/")
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function ordinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}
