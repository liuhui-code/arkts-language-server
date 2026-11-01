import fs from "node:fs"
import path from "node:path"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import type { HarmonySdkDiscovery } from "./discovery.js"

export function harmonySdkModuleCandidates(
  sdkRoot: string,
  moduleSpecifier: string,
): string[] {
  if (!isHarmonySdkModuleSpecifier(moduleSpecifier)) return []
  if (moduleSpecifier.startsWith("@ohos.") || moduleSpecifier.startsWith("@system.")) {
    return [
      path.join(sdkRoot, "ets", "api", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "ets", "api", `${moduleSpecifier}.d.ets`),
      path.join(sdkRoot, "js", "api", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "js", "api", `${moduleSpecifier}.d.ets`),
    ]
  }
  if (moduleSpecifier.startsWith("@kit.")) {
    return [
      path.join(sdkRoot, "ets", "kits", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "ets", "kits", `${moduleSpecifier}.d.ets`),
    ]
  }
  if (moduleSpecifier.startsWith("@arkts.")) {
    return [
      path.join(sdkRoot, "ets", "arkts", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "ets", "arkts", `${moduleSpecifier}.d.ets`),
    ]
  }
  return []
}

export function isHarmonySdkModuleSpecifier(moduleSpecifier: string, sdk?: HarmonySdkDiscovery): boolean {
  return !moduleSpecifier.includes("/")
    && !moduleSpecifier.includes("\\")
    && (moduleSpecifier.startsWith("@ohos.")
      || moduleSpecifier.startsWith("@system.")
      || moduleSpecifier.startsWith("@kit.")
      || moduleSpecifier.startsWith("@arkts.")
      || moduleSpecifier.startsWith("@hms.")
      || sdk?.components?.some(component => moduleSpecifier.startsWith(`${component.prefix}.`)) === true)
}

export function publicSdkSpecifier(sdk: HarmonySdkDiscovery, source: string | undefined,
  inputs?: LoadedConfigurationWitness): string | undefined {
  if (!source || !path.isAbsolute(source)) return undefined
  const stem = (file: string) => path.resolve(file).replace(/\.d\.(?:ts|ets)$/, "")
  const specifier = path.basename(stem(source))
  if (!isHarmonySdkModuleSpecifier(specifier, sdk)) return undefined
  const resolved = resolveHarmonySdkModule(sdk, specifier, inputs)
  if (!resolved) return undefined
  if (stem(resolved) === stem(source)) return specifier
  const physical = (file: string) => inputs ? inputs.observe(file, () => fs.realpathSync.native(file)) : fs.realpathSync.native(file)
  try {
    const target = physical(resolved)
    for (const file of /\.d\.(?:ts|ets)$/.test(source) ? [source] : [`${source}.d.ts`, `${source}.d.ets`]) {
      try { if (physical(file) === target) return specifier } catch { /* Try the declaration twin. */ }
    }
  } catch { /* Unknown physical source cannot authorize a public SDK route. */ }
  return undefined
}

export function resolveHarmonySdkModule(
  sdk: string | HarmonySdkDiscovery,
  moduleSpecifier: string,
  witness?: LoadedConfigurationWitness,
): string | null {
  const root = typeof sdk === "string" ? sdk : sdk.path
  if (!root || !isHarmonySdkModuleSpecifier(moduleSpecifier, typeof sdk === "string" ? undefined : sdk)) return null
  const candidates = harmonySdkModuleCandidates(root, moduleSpecifier)
  if (typeof sdk !== "string") for (const component of sdk.components?.slice(1) ?? []) {
    for (const apiPath of component.apiPaths) for (const extension of [".d.ts", ".d.ets"]) {
      candidates.push(path.join(apiPath, `${moduleSpecifier}${extension}`))
    }
  }
  return candidates.find(candidate => {
    const exists = witness ? witness.observe(candidate, () => fs.existsSync(candidate)) : fs.existsSync(candidate)
    if (!exists || typeof sdk === "string") return exists
    try {
      const physical = witness ? witness.observe(candidate, () => fs.realpathSync.native(candidate)) : fs.realpathSync.native(candidate)
      return (sdk.components ?? []).some(component => {
        const relative = path.relative(component.physicalRoot, physical)
        return !component.issue && relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      })
    } catch { return false }
  }) ?? null
}
