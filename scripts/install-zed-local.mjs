#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const EXTENSION_ID = "arkts"
const REPOSITORY = "https://github.com/liuhui-code/arkts-language-server"
const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d])
const LAUNCHER_MARKER = "# arkts-language-server-zed-launcher-v1:"
const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptRoot, "..")
const extensionSource = path.join(projectRoot, "editors", "zed")

function usage() {
  return "usage: node scripts/install-zed-local.mjs [--zed-user-data-dir DIRECTORY] [--bin-dir DIRECTORY]"
}

function parseArguments(argv) {
  if (argv[0] === "--") argv = argv.slice(1)
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== "--zed-user-data-dir" && argument !== "--bin-dir") {
      throw new Error(`${usage()}\nUnknown argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) {
      throw new Error(`${usage()}\n${argument} requires a directory`)
    }
    const key = argument === "--zed-user-data-dir" ? "zedUserDataDir" : "binDir"
    if (options[key] !== undefined) throw new Error(`${argument} may appear only once`)
    options[key] = path.resolve(value)
    index += 1
  }
  return options
}

function defaultZedUserDataDir() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Zed")
  }
  if (process.platform === "linux") {
    return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "zed")
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "Zed")
  }
  throw new Error(`Cannot locate Zed's user data directory on ${process.platform}`)
}

function readManifestField(manifest, field) {
  const match = new RegExp(`^${field}\\s*=\\s*"([^"]+)"\\s*$`, "m").exec(manifest)
  if (!match) throw new Error(`Missing ${field} in ${path.join(extensionSource, "extension.toml")}`)
  return match[1]
}

function readGrammarSource(manifest) {
  const header = /^\[grammars\.arkts\]\s*$/m.exec(manifest)
  if (!header) throw new Error("Missing [grammars.arkts] in Zed extension manifest")
  const remainder = manifest.slice(header.index + header[0].length)
  const nextSection = /^\[/m.exec(remainder)
  const section = nextSection ? remainder.slice(0, nextSection.index) : remainder
  const repository = /^repository\s*=\s*"([^"]+)"\s*$/m.exec(section)?.[1]
  const revision = /^rev\s*=\s*"([0-9a-f]{40})"\s*$/m.exec(section)?.[1]
  if (!repository || !revision) throw new Error("Invalid [grammars.arkts] source in Zed extension manifest")
  return { repository, revision }
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function assertWasm(file, label) {
  let header
  try {
    const descriptor = fs.openSync(file, "r")
    try {
      header = Buffer.alloc(WASM_MAGIC.length)
      const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0)
      if (bytesRead !== header.length) throw new Error("file is truncated")
    } finally {
      fs.closeSync(descriptor)
    }
  } catch (error) {
    throw new Error(`${label} is missing or unreadable at ${file}: ${error.message}`)
  }
  if (!header.equals(WASM_MAGIC)) throw new Error(`${label} at ${file} is not a WebAssembly binary`)
}

function validateBuild() {
  const manifestPath = path.join(extensionSource, "extension.toml")
  const manifest = fs.readFileSync(manifestPath, "utf8")
  if (readManifestField(manifest, "id") !== EXTENSION_ID) {
    throw new Error(`Zed extension id must remain ${EXTENSION_ID}`)
  }
  if (readManifestField(manifest, "repository") !== REPOSITORY) {
    throw new Error(`Refusing to install an extension owned by a different repository`)
  }

  const grammarSource = readGrammarSource(manifest)
  const grammarLockPath = path.join(extensionSource, "zed-grammar-lock.json")
  const grammarLock = JSON.parse(fs.readFileSync(grammarLockPath, "utf8"))
  if (grammarLock.grammar !== EXTENSION_ID
    || grammarLock.repository !== grammarSource.repository
    || grammarLock.revision !== grammarSource.revision
    || !/^[0-9a-f]{64}$/.test(grammarLock.sha256)) {
    throw new Error("Zed grammar lock does not match the pinned extension manifest")
  }

  const extensionWasm = path.join(extensionSource, "extension.wasm")
  const grammarWasm = path.join(extensionSource, "grammars", "arkts.wasm")
  assertWasm(extensionWasm, "Zed extension")
  assertWasm(grammarWasm, "ArkTS grammar")
  if (sha256(grammarWasm) !== grammarLock.sha256) {
    throw new Error("ArkTS grammar checksum does not match editors/zed/zed-grammar-lock.json")
  }
  return { extensionWasm, grammarLockPath, grammarWasm, manifestPath }
}

function existingLinkState(target) {
  let metadata
  try {
    metadata = fs.lstatSync(target)
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "absent" }
    throw error
  }
  if (!metadata.isSymbolicLink()) {
    throw new Error(`Refusing to replace non-development Zed extension path: ${target}`)
  }
  const link = fs.readlinkSync(target)
  const resolved = path.resolve(path.dirname(target), link)
  try {
    const manifest = fs.readFileSync(path.join(resolved, "extension.toml"), "utf8")
    if (readManifestField(manifest, "id") !== EXTENSION_ID
      || readManifestField(manifest, "repository") !== REPOSITORY) {
      throw new Error(`Refusing to replace a Zed dev extension from another repository: ${target}`)
    }
    return { kind: "link", link }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Refusing to replace dangling Zed dev extension link: ${target}`)
    }
    throw error
  }
}

function sameLinkState(target, expected) {
  const actual = existingLinkState(target)
  return actual.kind === expected.kind
    && (actual.kind === "absent" || actual.link === expected.link)
}

function filesUnder(root) {
  const files = []
  const visit = (directory, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const relative = path.join(prefix, entry.name)
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute, relative)
      else if (entry.isFile()) files.push(relative)
      else throw new Error(`Refusing to package non-regular extension input: ${absolute}`)
    }
  }
  visit(root)
  return files
}

function extensionFingerprint(root) {
  const digest = createHash("sha256")
  for (const relative of filesUnder(root)) {
    digest.update(relative)
    digest.update("\0")
    digest.update(fs.readFileSync(path.join(root, relative)))
    digest.update("\0")
  }
  return digest.digest("hex")
}

function stageRelease(releasesRoot, validated) {
  const staging = path.join(releasesRoot, `.staging-${process.pid}-${randomBytes(6).toString("hex")}`)
  fs.mkdirSync(path.join(staging, "grammars"), { recursive: true })
  fs.copyFileSync(validated.manifestPath, path.join(staging, "extension.toml"))
  fs.copyFileSync(validated.extensionWasm, path.join(staging, "extension.wasm"))
  fs.copyFileSync(validated.grammarLockPath, path.join(staging, "zed-grammar-lock.json"))
  fs.copyFileSync(validated.grammarWasm, path.join(staging, "grammars", "arkts.wasm"))
  fs.cpSync(path.join(extensionSource, "languages"), path.join(staging, "languages"), {
    recursive: true,
    dereference: true,
  })
  fs.cpSync(path.join(extensionSource, "licenses"), path.join(staging, "licenses"), {
    recursive: true,
    dereference: true,
  })
  fs.copyFileSync(path.join(projectRoot, "LICENSE"), path.join(staging, "LICENSE"))
  fs.copyFileSync(
    path.join(extensionSource, "THIRD_PARTY_NOTICES.md"),
    path.join(staging, "THIRD_PARTY_NOTICES.md"),
  )

  const fingerprint = extensionFingerprint(staging)
  const release = path.join(releasesRoot, fingerprint)
  try {
    if (fs.existsSync(release)) {
      if (extensionFingerprint(release) !== fingerprint) {
        throw new Error(`Existing Zed extension release is corrupt: ${release}`)
      }
    } else {
      fs.renameSync(staging, release)
    }
    return release
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function launcherContents(command) {
  const encodedCommand = Buffer.from(command).toString("base64url")
  return `#!/bin/sh\n${LAUNCHER_MARKER}${encodedCommand}\nexec ${shellQuote(command)} "$@"\n`
}

function isRecognizedManagedRelease(command) {
  if (!path.isAbsolute(command) || path.basename(command) !== "arkts-language-server") return false
  const binDirectory = path.dirname(command)
  const releaseDirectory = path.dirname(binDirectory)
  const serverRoot = path.dirname(releaseDirectory)
  const libexecDirectory = path.dirname(serverRoot)
  return path.basename(binDirectory) === "bin"
    && /^[A-Za-z0-9._-]+-[0-9a-f]{64}$/.test(path.basename(releaseDirectory))
    && path.basename(serverRoot) === "arkts-language-server"
    && path.basename(libexecDirectory) === "libexec"
}

function isReleaseWithinRoot(command, libexecRoot) {
  let canonicalRoot = libexecRoot
  try {
    canonicalRoot = fs.realpathSync(libexecRoot)
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  const relative = path.relative(canonicalRoot, command)
  if (!relative || path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`)) return false
  const components = relative.split(path.sep)
  return isRecognizedManagedRelease(command)
    && components.length === 3
    && components[0] !== ""
    && !components[0].startsWith(".")
    && components[1] === "bin"
    && components[2] === "arkts-language-server"
}

function managedLauncherState(target) {
  let metadata
  try {
    metadata = fs.lstatSync(target)
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "absent" }
    throw error
  }
  if (!metadata.isFile()) {
    throw new Error(`Refusing to replace unmanaged Zed language-server launcher: ${target}`)
  }
  try {
    const contents = fs.readFileSync(target, "utf8")
    const marker = contents.split("\n")[1]
    if (!marker?.startsWith(LAUNCHER_MARKER)) {
      throw new Error(`Refusing to replace unmanaged Zed language-server launcher: ${target}`)
    }
    const command = Buffer.from(marker.slice(LAUNCHER_MARKER.length), "base64url").toString("utf8")
    if (!isRecognizedManagedRelease(command) || contents !== launcherContents(command)) {
      throw new Error(`Refusing to replace unmanaged Zed language-server launcher: ${target}`)
    }
    if (!fs.statSync(command).isFile()) {
      throw new Error(`Refusing to replace invalid Zed language-server launcher: ${target}`)
    }
    fs.accessSync(command, fs.constants.X_OK)
    return { kind: "file", contents }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Refusing to replace dangling Zed language-server launcher: ${target}`)
    }
    throw error
  }
}

function sameLauncherState(target, expected) {
  try {
    const metadata = fs.lstatSync(target)
    return expected.kind === "file"
      && metadata.isFile()
      && fs.readFileSync(target, "utf8") === expected.contents
  } catch (error) {
    if (error?.code === "ENOENT") return expected.kind === "absent"
    throw error
  }
}

function atomicExecutable(contents, target) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`,
  )
  fs.writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o755 })
  try {
    fs.renameSync(temporary, target)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function atomicSymlink(source, target) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`,
  )
  fs.symlinkSync(source, temporary, process.platform === "win32" ? "file" : undefined)
  try {
    fs.renameSync(temporary, target)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function run() {
  if (process.platform === "win32") {
    throw new Error("The source-checkout installer currently supports macOS and Linux")
  }
  const options = parseArguments(process.argv.slice(2))
  const zedUserDataDir = options.zedUserDataDir ?? defaultZedUserDataDir()
  const binDir = options.binDir ?? path.join(os.homedir(), ".local", "bin")
  const extensionsRoot = path.join(zedUserDataDir, "extensions")
  const installedExtension = path.join(extensionsRoot, "installed", EXTENSION_ID)
  const launcher = path.join(extensionsRoot, "work", EXTENSION_ID, "bin", "arkts-language-server")
  const installedCommand = path.join(binDir, "arkts-language-server")
  const libexecRoot = path.join(path.dirname(binDir), "libexec", "arkts-language-server")

  const initialExtensionState = existingLinkState(installedExtension)
  const initialLauncherState = managedLauncherState(launcher)

  const installation = spawnSync(path.join(scriptRoot, "install-local.sh"), [binDir], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, ARKTS_ZED_INSTALL_AUTO: "1" },
  })
  if (installation.stdout) process.stdout.write(installation.stdout)
  if (installation.stderr) process.stderr.write(installation.stderr)
  if (installation.error) throw installation.error
  if (installation.status !== 0) {
    throw new Error(`arkts-language-server build/install failed with status ${installation.status}`)
  }

  const validated = validateBuild()
  const commandMetadata = fs.statSync(installedCommand)
  if (!commandMetadata.isFile()) throw new Error(`Installed language server is not a file: ${installedCommand}`)
  fs.accessSync(installedCommand, fs.constants.X_OK)
  const immutableCommand = fs.realpathSync(installedCommand)

  fs.mkdirSync(path.join(extensionsRoot, "installed"), { recursive: true })
  fs.mkdirSync(path.dirname(launcher), { recursive: true })
  const releasesRoot = path.join(zedUserDataDir, "arkts-language-server", "zed-extension-releases")
  fs.mkdirSync(releasesRoot, { recursive: true })
  const release = stageRelease(releasesRoot, validated)

  if (!sameLinkState(installedExtension, initialExtensionState)) {
    throw new Error(`Zed extension changed during installation; refusing to overwrite ${installedExtension}`)
  }
  if (!sameLauncherState(launcher, initialLauncherState)) {
    throw new Error(`Zed language-server launcher changed during installation; refusing to overwrite ${launcher}`)
  }
  if (!isReleaseWithinRoot(immutableCommand, libexecRoot)) {
    throw new Error(`Installed language server escaped its managed release root: ${immutableCommand}`)
  }
  atomicExecutable(launcherContents(immutableCommand), launcher)
  atomicSymlink(release, installedExtension)

  process.stdout.write(`Installed ArkTS dev extension at ${installedExtension}\n`)
  process.stdout.write(`Zed will reload the extension through its installed-directory watcher; if Zed is closed, it loads on next start.\n`)
}

try {
  run()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
