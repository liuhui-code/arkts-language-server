import fs from "node:fs"
import path from "node:path"

import JSON5 from "json5"
import { HarmonyProjectModel } from "../../project/harmony-project-model.js"

/*! @license JSON5 2.2.3
MIT License

Copyright (c) 2012-2018 Aseem Kishore, and [others].

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[others]: https://github.com/json5/json5/contributors
*/

const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_CACHED_MANIFESTS = 128
const MAX_CACHED_DIRECTORY_OWNERS = 256
const MAX_CACHED_INSTALLATIONS = 256
// The type-engine registry admits four workspaces and each may select one SDK.
const MAX_CACHED_ROOTS = 8
const MAX_ANCESTORS = 64

interface PackageManifest {
  name?: string
  entry?: string
  dependencies: Map<string, string>
}

// undefined: no supported dependency declaration; null: declared but unresolved.
export type LocalPackageResolution = { path: string | null } | undefined

export class LocalPackageResolver {
  private readonly manifests = new Map<string, PackageManifest | null | undefined>()
  // Filesystem snapshots: manifest/directory watcher changes must call invalidate().
  private readonly directoryOwners = new Map<string, string | undefined>()
  private readonly installations = new Map<string, string>()
  private readonly canonicalRoots = new Map<string, string>()
  private readonly projectModels = new Map<string, HarmonyProjectModel>()
  private projectSelection: unknown

  configureProject(selection: unknown): void {
    this.projectSelection = selection
    this.projectModels.clear()
    this.invalidate()
  }

  projectFor(rootPath: string): HarmonyProjectModel {
    const root = path.resolve(rootPath)
    let model = this.projectModels.get(root)
    if (!model) model = new HarmonyProjectModel(root, this.projectSelection)
    this.projectModels.delete(root)
    this.projectModels.set(root, model)
    while (this.projectModels.size > 4) this.projectModels.delete(this.projectModels.keys().next().value!)
    return model
  }

  resolve(
    rootPath: string,
    containingFile: string,
    name: string,
    { checkpoint = () => {}, hasOverlay = () => false, overlayPath }: {
      checkpoint?: () => void
      hasOverlay?: (filePath: string) => boolean
      overlayPath?: (physicalPath: string) => string | undefined
    } = {},
  ): LocalPackageResolution {
    if (name.startsWith(".") || path.isAbsolute(name)) return undefined
    const root = path.resolve(rootPath)
    const directory = this.ownerDirectory(root, path.dirname(path.resolve(containingFile)), checkpoint)
    if (directory !== undefined) {
      const manifest = this.readManifest(path.join(directory, "oh-package.json5"))
      if (manifest !== undefined) {
        if (manifest?.name && name.startsWith(`${manifest.name}/`)) {
          return { path: this.resolveSelfSource(root, directory, containingFile,
            name.slice(manifest.name.length + 1), hasOverlay, checkpoint, overlayPath) }
        }
        const dependency = manifest?.dependencies.get(name)
        if (dependency === undefined) return undefined
        let packageRoot: string
        if (dependency.startsWith("file:")) {
          const relative = dependency.slice(5)
          if (!relative || path.isAbsolute(relative)) return { path: null }
          packageRoot = path.resolve(directory, relative)
        } else {
          if (!dependency || !/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name)) return { path: null }
          const installed = this.installedPackage(root, path.dirname(path.resolve(containingFile)), name, checkpoint)
          if (installed === undefined) return { path: null }
          packageRoot = installed
        }
        let physicalPackageRoot: string
        try {
          const physicalRoot = this.canonicalRoot(root)
          if (physicalRoot === undefined) return { path: null }
          physicalPackageRoot = fs.realpathSync.native(packageRoot)
          if (!inside(physicalRoot, physicalPackageRoot)) return { path: null }
        } catch { return { path: null } }
        checkpoint()
        const target = this.readManifest(path.join(packageRoot, "oh-package.json5"))
        if (!target?.entry || path.isAbsolute(target.entry)) return { path: null }
        const entry = path.resolve(packageRoot, target.entry)
        if (!/\.(?:ets|ts)$/.test(entry) || !inside(packageRoot, entry)) return { path: null }
        let physicalEntry: string
        let entryExists = true
        try {
          physicalEntry = fs.realpathSync.native(entry)
        } catch {
          entryExists = false
          try {
            // A dangling link is an existing entry with no stable physical identity.
            fs.lstatSync(entry)
            return { path: null }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { path: null }
          }
          try {
            physicalEntry = path.join(
              fs.realpathSync.native(path.dirname(entry)),
              path.basename(entry),
            )
          } catch { return { path: null } }
        }
        if (!inside(physicalPackageRoot, physicalEntry)) return { path: null }
        const openPath = overlayPath?.(physicalEntry)
        const overlay = openPath !== undefined || hasOverlay(entry)
        if (overlay) return { path: openPath ?? entry }
        if (!entryExists) return { path: null }
        try {
          const stat = fs.statSync(physicalEntry)
          return {
            path: stat.isFile() && stat.size <= 4 * 1024 * 1024 ? entry : null,
          }
        } catch {
          return { path: null }
        }
      }
    }
    return undefined
  }

  invalidate(rootPath?: string): void {
    // Clear the bounded ownership snapshot across lexical/canonical root aliases.
    this.directoryOwners.clear()
    this.installations.clear()
    this.canonicalRoots.clear()
    for (const model of this.projectModels.values()) model.invalidate()
    for (const manifestPath of this.manifests.keys()) {
      if (rootPath === undefined || inside(rootPath, manifestPath)) this.manifests.delete(manifestPath)
    }
  }

  private resolveSelfSource(
    rootPath: string,
    directory: string,
    containingFile: string,
    subpath: string,
    hasOverlay: (filePath: string) => boolean,
    checkpoint: () => void,
    overlayPath?: (physicalPath: string) => string | undefined,
  ): string | null {
    if (!subpath || subpath.split(/[\\/]/).some((part) => !part || part === "." || part === "..")) return null
    const scope = this.projectFor(rootPath).scopeFor(containingFile)
    if (scope.status !== "ready" || !scope.moduleRoot) return null
    try {
      if (fs.realpathSync.native(directory) !== fs.realpathSync.native(scope.moduleRoot)) return null
    } catch { return null }
    for (const sourceRoot of scope.sourceRoots) {
      const base = path.resolve(sourceRoot, subpath)
      const candidates = path.extname(base) ? [base] : [base + ".ets", base + ".ts", base + ".d.ets", base + ".d.ts"]
      for (const candidate of candidates) {
        checkpoint()
        if (!/\.(ets|ts)$/.test(candidate) || !inside(sourceRoot, candidate)) continue
        try {
          let openPath: string | undefined
          if (overlayPath) {
            try { openPath = overlayPath(fs.realpathSync.native(candidate)) }
            catch {
              try { fs.lstatSync(candidate) }
              catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                  openPath = overlayPath(path.join(fs.realpathSync.native(path.dirname(candidate)), path.basename(candidate)))
                }
              }
            }
          }
          const overlay = openPath !== undefined || hasOverlay(candidate)
          if (!physicallyInside(sourceRoot, candidate)) {
            if (!overlay) continue
            try { fs.lstatSync(candidate); continue }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") continue }
            if (!physicallyInside(sourceRoot, path.dirname(candidate))) continue
          }
          if (overlay) return openPath ?? candidate
          const stat = fs.statSync(candidate)
          if (stat.isFile() && stat.size <= 4 * 1024 * 1024) return candidate
        } catch { /* Missing candidates fall through to the common source space. */ }
      }
    }
    return null
  }

  installedSourcePath(
    rootPath: string,
    containingFile: string,
    candidate: string,
    overlayPath: (physicalPath: string) => string | undefined,
    checkpoint: () => void = () => {},
  ): string | undefined {
    const physicalRoot = this.canonicalRoot(rootPath)
    if (physicalRoot === undefined) return undefined
    let physicalSource: string
    let sourceExists = true
    try {
      physicalSource = fs.realpathSync.native(candidate)
    } catch {
      sourceExists = false
      try {
        // An existing lexical entry without a physical identity is dangling or
        // unreadable; it must never inherit an unrelated overlay identity.
        fs.lstatSync(candidate)
        return undefined
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined
      }
      try {
        physicalSource = path.join(
          fs.realpathSync.native(path.dirname(candidate)),
          path.basename(candidate),
        )
      } catch { return undefined }
    }
    if (!inside(physicalRoot, physicalSource)) return undefined
    const openPath = overlayPath(physicalSource)
    if (!sourceExists && openPath === undefined) return undefined
    checkpoint()
    if (openPath !== undefined) return openPath
    if (!containingFile.split(path.sep).includes("oh_modules")) {
      return candidate
    }
    const clientRoot = clientWorkspaceRoot(physicalRoot, path.dirname(containingFile), checkpoint)
    return clientRoot === undefined ? undefined : path.join(clientRoot, path.relative(physicalRoot, physicalSource))
  }

  private canonicalRoot(rootPath: string): string | undefined {
    const root = path.resolve(rootPath)
    const cached = this.canonicalRoots.get(root)
    if (cached !== undefined) {
      this.canonicalRoots.delete(root)
      this.canonicalRoots.set(root, cached)
      return cached
    }
    let physicalRoot: string
    try { physicalRoot = fs.realpathSync.native(root) }
    catch { return undefined }
    this.canonicalRoots.set(root, physicalRoot)
    while (this.canonicalRoots.size > MAX_CACHED_ROOTS) {
      this.canonicalRoots.delete(this.canonicalRoots.keys().next().value!)
    }
    return physicalRoot
  }

  private installedPackage(root: string, start: string, name: string, checkpoint: () => void): string | undefined {
    checkpoint()
    const key = `${root}\0${start}\0${name}`
    const cached = this.installations.get(key)
    if (cached !== undefined) {
      this.installations.delete(key)
      this.installations.set(key, cached)
      return cached
    }
    const installed = this.findInstalledPackage(root, start, name, checkpoint)
    // Do not retain misses: a newly created installation must remain observable.
    if (installed !== undefined) {
      this.installations.set(key, installed)
      while (this.installations.size > MAX_CACHED_INSTALLATIONS) {
        this.installations.delete(this.installations.keys().next().value!)
      }
    }
    return installed
  }

  private findInstalledPackage(root: string, start: string, name: string, checkpoint: () => void): string | undefined {
    const physicalRoot = this.canonicalRoot(root)
    if (physicalRoot === undefined) return undefined
    let directory: string
    try {
      directory = fs.realpathSync.native(start)
    } catch { return undefined }
    const clientRoot = clientWorkspaceRoot(physicalRoot, start, checkpoint)
    if (clientRoot === undefined) return undefined
    for (let depth = 0; depth < MAX_ANCESTORS && physicallyInside(physicalRoot, directory); depth += 1) {
      checkpoint()
      const candidate = path.join(directory, "oh_modules", name)
      try {
        // Let the installation's link select its store entry; never enumerate .ohpm.
        fs.lstatSync(candidate)
        try {
          // Different installation links must not create different TypeScript types.
          return path.join(clientRoot, path.relative(physicalRoot, fs.realpathSync.native(candidate)))
        } catch { return undefined }
      } catch (error) {
        // A broken or unreadable nearer installation must not select another version.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          return path.join(clientRoot, path.relative(physicalRoot, candidate))
        }
      }
      const parent = path.dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    return undefined
  }

  private ownerDirectory(root: string, start: string, checkpoint: () => void): string | undefined {
    checkpoint()
    const key = `${root}\0${start}`
    if (this.directoryOwners.has(key)) {
      const cached = this.directoryOwners.get(key)
      this.directoryOwners.delete(key)
      this.directoryOwners.set(key, cached)
      return cached
    }
    let owner: string | undefined
    let directory = start
    for (let depth = 0; depth < MAX_ANCESTORS && physicallyInside(root, directory); depth += 1) {
      checkpoint()
      if (this.readManifest(path.join(directory, "oh-package.json5")) !== undefined) {
        owner = directory
        break
      }
      if (directory === root) break
      directory = path.dirname(directory)
    }
    this.directoryOwners.set(key, owner)
    while (this.directoryOwners.size > MAX_CACHED_DIRECTORY_OWNERS) {
      this.directoryOwners.delete(this.directoryOwners.keys().next().value!)
    }
    return owner
  }

  private readManifest(filePath: string): PackageManifest | null | undefined {
    if (this.manifests.has(filePath)) {
      const cached = this.manifests.get(filePath)
      this.manifests.delete(filePath)
      this.manifests.set(filePath, cached)
      return cached
    }
    const result = readManifest(filePath)
    this.manifests.set(filePath, result)
    while (this.manifests.size > MAX_CACHED_MANIFESTS) {
      this.manifests.delete(this.manifests.keys().next().value!)
    }
    return result
  }
}

function clientWorkspaceRoot(physicalRoot: string, start: string, checkpoint: () => void): string | undefined {
  let directory = start
  for (let depth = 0; depth < MAX_ANCESTORS; depth += 1) {
    checkpoint()
    try {
      if (fs.realpathSync.native(directory) === physicalRoot) return directory
    } catch { return undefined }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

function readManifest(filePath: string): PackageManifest | null | undefined {
  let descriptor: number | undefined
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) return null
    const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length, null)
      if (count === 0) break
      length += count
    }
    if (length > MAX_MANIFEST_BYTES) return null
    const value: unknown = JSON5.parse(buffer.toString("utf8", 0, length))
    if (!object(value)) return null
    const dependencies = new Map<string, string>()
    if (object(value.dependencies)) {
      for (const [name, dependency] of Object.entries(value.dependencies)) {
        if (typeof dependency === "string") dependencies.set(name, dependency)
      }
    }
    const entry = [value.typings, value.types, value.main]
      .find((field) => typeof field === "string" && field.length > 0)
    return {
      name: typeof value.name === "string" && value.name.length > 0 ? value.name : undefined,
      entry: typeof entry === "string" ? entry : undefined,
      dependencies,
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? undefined : null
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function physicallyInside(root: string, candidate: string): boolean {
  try {
    return inside(fs.realpathSync.native(root), fs.realpathSync.native(candidate))
  } catch {
    return false
  }
}
