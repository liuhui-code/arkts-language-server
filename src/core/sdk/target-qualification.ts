import { createHash } from "node:crypto"
import type { HarmonySdkTarget } from "../../project/harmony-sdk-target.js"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import type { HarmonySdkDiscovery } from "./discovery.js"
import { readSdkConfiguration } from "./configuration-reader.js"

export function bindSdkTarget<T extends HarmonySdkDiscovery>(sdk: T, target: HarmonySdkTarget,
  inputs?: LoadedConfigurationWitness): T & { target: HarmonySdkTarget; targetQualification?: SdkTargetQualification } {
  const selected = { ...sdk, identity: sdk.identity ? Object.freeze({ ...sdk.identity }) : undefined,
    components: target.runtimeOS === "OpenHarmony" && sdk.components ? Object.freeze(sdk.components.slice(0, 1)) : sdk.components }
  const qualification = qualifySdkTarget(selected, target, inputs)
  return Object.freeze({ ...selected, target, targetQualification: qualification ? Object.freeze(qualification) : undefined })
}

export interface SdkTargetQualification {
  readonly status: "compatible" | "mismatch" | "unverified"
  readonly compileApi?: number
  readonly compatibleApi?: number
  readonly targetApi?: number
  readonly aliasMapSha256?: string
  readonly message?: string
}

/** Interpret SDK release aliases from the selected distribution, never from a guessed version major. */
export function qualifySdkTarget(sdk: HarmonySdkDiscovery, target: HarmonySdkTarget,
  inputs?: LoadedConfigurationWitness): SdkTargetQualification | undefined {
  if (target.status === "unconfigured") return undefined
  if (target.status !== "ready") return { status: "unverified", message: "The selected project SDK target is unavailable." }
  if (target.runtimeOS !== undefined && target.runtimeOS !== "HarmonyOS" && target.runtimeOS !== "OpenHarmony") {
    return { status: "unverified", message: `The selected SDK cannot verify runtime OS ${target.runtimeOS}.` }
  }
  let aliases: Map<string, number> | undefined
  let aliasMapSha256: string | undefined
  const normalize = (version: string | number | undefined): number | undefined => {
    if (version === undefined) return undefined
    if (typeof version === "number") return version
    if (!aliases) {
      aliases = new Map()
      const hashes: string[] = []
      for (const component of sdk.components ?? []) {
        if (component.issue || !component.versionMapPath) continue
        try {
          const source = readSdkConfiguration(component.versionMapPath, inputs)
          const map: unknown = JSON.parse(source)
          if (!map || typeof map !== "object" || Array.isArray(map)) continue
          hashes.push(createHash("sha256").update(source).digest("hex"))
          for (const [api, values] of Object.entries(map)) {
            if (!/^[1-9]\d*$/.test(api) || !Number.isSafeInteger(Number(api)) || !Array.isArray(values)) continue
            for (const alias of values) if (typeof alias === "string") {
              aliases.set(alias, aliases.has(alias) && aliases.get(alias) !== Number(api) ? NaN : Number(api))
            }
          }
        } catch { /* Unavailable aliases cannot certify a target version. */ }
      }
      if (hashes.length) aliasMapSha256 = createHash("sha256").update(JSON.stringify(hashes)).digest("hex")
    }
    const api = aliases.get(version)
    return api !== undefined && Number.isSafeInteger(api) ? api : undefined
  }
  const compileApi = normalize(target.compileSdkVersion)
  const compatibleApi = normalize(target.compatibleSdkVersion)
  const targetApi = normalize(target.targetSdkVersion)
  const result = { compileApi, compatibleApi, targetApi, aliasMapSha256 }
  if (target.compileSdkVersion !== undefined && compileApi === undefined
    || target.compatibleSdkVersion !== undefined && compatibleApi === undefined
    || target.targetSdkVersion !== undefined && targetApi === undefined) {
    return { ...result, status: "unverified", message: "The selected SDK cannot verify the requested project SDK version aliases." }
  }
  const installed = sdk.identity?.status === "identified" ? Number(sdk.identity.apiVersion) : NaN
  const installedApi = Number.isSafeInteger(installed) && installed > 0 ? installed : undefined
  const effectiveCompile = compileApi ?? installedApi
  if (compileApi !== undefined && compileApi !== installedApi) return { ...result,
    status: installedApi === undefined ? "unverified" : "mismatch",
    message: `Project requires SDK API ${compileApi}; selected SDK API is ${installedApi ?? "unknown"}.` }
  if (effectiveCompile !== undefined && (compatibleApi !== undefined && compatibleApi > effectiveCompile
    || targetApi !== undefined && (targetApi > effectiveCompile || compatibleApi !== undefined && targetApi < compatibleApi))) {
    return { ...result, status: "mismatch", message: "Project SDK versions must satisfy compatible <= target <= compile." }
  }
  return { ...result, status: "compatible" }
}
