import { createHash } from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

import { build } from "esbuild"
import { digestSdk } from "../lock-toolchain.mjs"
import { digestProjectConfiguration } from "./project-config-digest.mjs"
import { snapshotInstalledDependencies } from "./installed-dependency-digest.mjs"
import { digestSdkCompilerOptions } from "./sdk-compiler-options-digest.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let runtime
let bundledDriver

async function driverCode() {
  if (bundledDriver) return bundledDriver
  const entry = path.join(here, "production-oracle-entry.ts")
  const built = await build({
    entryPoints: [entry], bundle: true, write: false,
    platform: "node", format: "cjs", target: "node20",
    external: ["typescript"],
  })
  if (built.outputFiles.length !== 1) throw new Error("production oracle driver build is incomplete")
  bundledDriver = { entry, code: built.outputFiles[0].text }
  return bundledDriver
}

async function instantiateDriver(resolveModule = require) {
  const { entry, code } = await driverCode()
  const module = { exports: {} }
  const compiled = vm.compileFunction(code,
    ["require", "module", "exports", "__filename", "__dirname"], { filename: entry })
  compiled(resolveModule, module, module.exports, entry, here)
  return module.exports
}

/** Load only the repository-owned driver; the pinned compiler stays in its installed package. */
async function driver() {
  if (runtime) return runtime
  const loaded = await instantiateDriver()
  if (typeof loaded.runProductionDiskOracle !== "function") {
    throw new Error("production oracle driver entry is unavailable")
  }
  runtime = loaded
  return runtime
}

/** Run the experimental compiler only inside its own VM driver, never the stock oracle. */
export async function productionDiskHookContext(input, artifactPath) {
  if (!path.isAbsolute(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error("production extraction requires an absolute compiler artifact")
  }
  const artifactSha256 = sha256(fs.readFileSync(artifactPath))
  const installed = await assertEnvironmentPins(input, "before production extraction")
  const compiler = require(fs.realpathSync(artifactPath))
  const stockCompiler = require("typescript")
  const capture = { calls: 0 }
  const wrappedCompiler = new Proxy(compiler, {
    get(target, key, receiver) {
      // A hook artifact lives outside node_modules/typescript/lib. Its own default
      // library locator would silently drop the standard declarations from Program.
      if (key === "getDefaultLibFilePath") return options => stockCompiler.getDefaultLibFilePath(options)
      const value = Reflect.get(target, key, receiver)
      if (key !== "createLanguageService") return value
      if (typeof value !== "function") throw new Error("compiler LanguageService API unavailable")
      return (...args) => {
        capture.calls += 1
        capture.host = args[0]
        const service = Reflect.apply(value, target, args)
        capture.service = service
        return service
      }
    },
  })
  const loaded = await instantiateDriver(specifier => (
    specifier === "typescript" ? wrappedCompiler : require(specifier)
  ))
  if (typeof loaded.runProductionDiskHook !== "function") {
    throw new Error("production extraction driver entry is unavailable")
  }
  const result = loaded.runProductionDiskHook({ ...input,
    pinnedPackageSourceSha256: installed?.semanticSourceSha256 ?? {} }, compiler, capture)
  if (path.dirname(result.hostDefaultLibFilePath)
    !== path.dirname(stockCompiler.getDefaultLibFilePath({ target: stockCompiler.ScriptTarget.ESNext }))) {
    throw new Error("production extraction host did not use stock default library directory")
  }
  await assertEnvironmentPins(input, "after production extraction")
  if (sha256(fs.readFileSync(artifactPath)) !== artifactSha256) {
    throw new Error("compiler artifact digest changed during production extraction")
  }
  return { ...result, compilerArtifactSha256: artifactSha256 }
}

async function assertEnvironmentPins(input, stage) {
  if (!/^[a-f0-9]{64}$/u.test(input.sdkDeclarationDigest)
    || await digestSdk(input.sdkRoot) !== input.sdkDeclarationDigest) {
    throw new Error(`SDK declaration digest mismatch ${stage}`)
  }
  if (!/^[a-f0-9]{64}$/u.test(input.sdkCompilerOptionsDigest)
    || await digestSdkCompilerOptions(input.sdkRoot) !== input.sdkCompilerOptionsDigest) {
    throw new Error(`SDK compiler-options digest mismatch ${stage}`)
  }
  if (!/^[a-f0-9]{64}$/u.test(input.projectConfigurationDigest)
    || await digestProjectConfiguration(input.root,
      { allowInstalled: Boolean(input.installedDependencyDigest) }) !== input.projectConfigurationDigest) {
    throw new Error(`project configuration digest mismatch ${stage}`)
  }
  return assertInstalledPin(input, stage)
}

async function assertInstalledPin(input, stage) {
  if (input.installedDependencyDigest === undefined) return undefined
  const installed = await snapshotInstalledDependencies(input.root)
  if (installed.digest !== input.installedDependencyDigest) {
    throw new Error(`installed dependency digest mismatch ${stage}`)
  }
  return installed
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

export async function productionDiskOracle(input, queries) {
  if (!/^[a-f0-9]{64}$/u.test(input.sdkDeclarationDigest)
    || await digestSdk(input.sdkRoot) !== input.sdkDeclarationDigest) {
    throw new Error("SDK declaration digest mismatch before production oracle query")
  }
  if (!/^[a-f0-9]{64}$/u.test(input.sdkCompilerOptionsDigest)
    || await digestSdkCompilerOptions(input.sdkRoot) !== input.sdkCompilerOptionsDigest) {
    throw new Error("SDK compiler-options digest mismatch before production oracle query")
  }
  if (!/^[a-f0-9]{64}$/u.test(input.projectConfigurationDigest)
    || await digestProjectConfiguration(input.root,
      { allowInstalled: Boolean(input.installedDependencyDigest) }) !== input.projectConfigurationDigest) {
    throw new Error("project configuration digest mismatch before production oracle query")
  }
  const installed = await assertInstalledPin(input, "before production oracle query")
  const result = (await driver()).runProductionDiskOracle({ ...input,
    pinnedPackageSourceSha256: installed?.semanticSourceSha256 ?? {} }, queries)
  if (await digestSdk(input.sdkRoot) !== input.sdkDeclarationDigest) {
    throw new Error("SDK declaration digest mismatch after production oracle query")
  }
  if (await digestSdkCompilerOptions(input.sdkRoot) !== input.sdkCompilerOptionsDigest) {
    throw new Error("SDK compiler-options digest mismatch after production oracle query")
  }
  if (await digestProjectConfiguration(input.root,
    { allowInstalled: Boolean(input.installedDependencyDigest) }) !== input.projectConfigurationDigest) {
    throw new Error("project configuration digest mismatch after production oracle query")
  }
  await assertInstalledPin(input, "after production oracle query")
  return result
}

export async function discoverDiskMembership(options) {
  const loaded = await driver()
  if (typeof loaded.discoverDiskMembership !== "function") {
    throw new Error("production membership discovery entry is unavailable")
  }
  return loaded.discoverDiskMembership(options)
}
