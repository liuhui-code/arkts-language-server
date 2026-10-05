#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

import { digestSdk } from "../lock-toolchain.mjs"
import { digest, inputIdentity, validFile } from "./input.mjs"
import { discoverDiskMembership } from "./production-oracle-loader.mjs"
import { digestProjectConfiguration } from "./project-config-digest.mjs"
import { digestInstalledDependencies } from "./installed-dependency-digest.mjs"
import { digestSdkCompilerOptions } from "./sdk-compiler-options-digest.mjs"

try {
  const options = parseOptions(process.argv.slice(2))
  if (fs.existsSync(options.out)) throw new Error(`refusing to overwrite: ${options.out}`)
  const projectConfigurationDigest = await digestProjectConfiguration(options.workspace,
    { allowInstalled: options.pinInstalled })
  const installedDependencyDigest = options.pinInstalled
    ? await digestInstalledDependencies(options.workspace) : undefined
  const discovery = await discoverDiskMembership({ workspaceRoot: options.workspace,
    sdkRoot: options.sdk, queryFile: options.file })
  const files = {}
  const physicalRoot = fs.realpathSync(options.workspace)
  for (const name of discovery.files) {
    if (!validFile(name)) throw new Error(`invalid discovered source: ${name}`)
    const source = path.resolve(options.workspace, name)
    const physicalSource = fs.realpathSync(source)
    const relative = path.relative(physicalRoot, physicalSource)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative) || !fs.statSync(physicalSource).isFile()) {
      throw new Error(`discovered source escapes workspace: ${name}`)
    }
    files[name] = fs.readFileSync(source, "utf8")
  }
  const manifest = { schemaVersion: options.pinInstalled ? 3 : 2, kind: "disk-workspace",
    workspaceRoot: options.workspace, sdkRoot: options.sdk,
    sdkDeclarationDigest: await digestSdk(options.sdk),
    sdkCompilerOptionsDigest: await digestSdkCompilerOptions(options.sdk),
    projectConfigurationDigest, ...(installedDependencyDigest ? { installedDependencyDigest } : {}),
    listedSourceSha256: inputIdentity(files),
    membershipSeedFile: discovery.queryFile, files: discovery.files }
  if (await digestProjectConfiguration(options.workspace,
    { allowInstalled: options.pinInstalled }) !== projectConfigurationDigest) {
    throw new Error("project configuration digest mismatch during pin")
  }
  if (options.pinInstalled
    && await digestInstalledDependencies(options.workspace) !== installedDependencyDigest) {
    throw new Error("installed dependency digest mismatch during pin")
  }
  fs.writeFileSync(options.out, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({ status: "PINNED", out: options.out,
    membershipFiles: discovery.files.length, listedSourceSha256: manifest.listedSourceSha256,
    sdkDeclarationDigest: manifest.sdkDeclarationDigest, sdkIdentity: discovery.sdkIdentity,
    sdkCompilerOptionsDigest: manifest.sdkCompilerOptionsDigest,
    projectConfigurationDigest: manifest.projectConfigurationDigest,
    ...(installedDependencyDigest ? { installedDependencyDigest } : {}),
    manifestSha256: digest(fs.readFileSync(options.out)) })}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length;) {
    if (args[index] === "--pin-installed" && !options.pinInstalled) {
      options.pinInstalled = true
      index += 1
      continue
    }
    const name = args[index]?.replace(/^--/u, "")
    const value = args[index + 1]
    if (!args[index]?.startsWith("--") || !["workspace", "sdk", "file", "out"].includes(name)
      || !value || options[name]) throw new Error("usage: pin-production-workspace.mjs --workspace ROOT --sdk SDK --file QUERY_RELATIVE_FILE --out NEW_JSON [--pin-installed]")
    options[name] = name === "file" ? value : path.resolve(value)
    index += 2
  }
  if (![4, 5].includes(Object.keys(options).length) || !validFile(options.file)
    || !fs.statSync(options.workspace).isDirectory() || !fs.statSync(options.sdk).isDirectory()) {
    throw new Error("production workspace pin requires valid absolute workspace, SDK, and relative source file")
  }
  return options
}
