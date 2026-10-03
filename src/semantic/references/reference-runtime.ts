import type { TypeScriptSdkAmbientProfile } from "../../core/types/typescript-language-service.js"

export type ReferenceSearchStrategy = "legacy" | "batched" | "indexed-batched"
export type ReferenceSdkAmbientProfile = Extract<TypeScriptSdkAmbientProfile, "full" | "common">
export type ReferenceDependencyProfile = "closure" | "identity"
export type ReferenceContextRetentionProfile = "dispose" | "budget-aware"

export interface ReferenceSearchRuntimeConfig {
  readonly strategy: ReferenceSearchStrategy
  readonly batchRootLimit: number
  readonly sdkAmbientProfile: ReferenceSdkAmbientProfile
  readonly dependencyProfile: ReferenceDependencyProfile
  readonly contextRetentionProfile: ReferenceContextRetentionProfile
  readonly anchorReuse: boolean
  readonly residentFastPath: boolean
  readonly constructorScope: boolean
  readonly conservativeSemanticUnits: boolean
  readonly trace: boolean
  readonly sessionReuse?: "off" | "experimental"
}

const DEFAULT_BATCH_ROOT_LIMIT = 64
const MAX_BATCH_ROOT_LIMIT = 512

export function referenceSearchRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ReferenceSearchRuntimeConfig {
  const configuredStrategy = environment.ARKTS_REFERENCES_STRATEGY ?? "indexed-batched"
  if (configuredStrategy !== "legacy"
    && configuredStrategy !== "batched"
    && configuredStrategy !== "indexed-batched") {
    throw new Error("ARKTS_REFERENCES_STRATEGY must be legacy, batched, or indexed-batched")
  }
  const sdkAmbientProfile = environment.ARKTS_REFERENCES_SDK_AMBIENT_PROFILE ?? "full"
  if (sdkAmbientProfile !== "full" && sdkAmbientProfile !== "common") {
    throw new Error("ARKTS_REFERENCES_SDK_AMBIENT_PROFILE must be full or common")
  }
  const dependencyProfile = environment.ARKTS_REFERENCES_DEPENDENCY_PROFILE ?? "closure"
  if (dependencyProfile !== "closure" && dependencyProfile !== "identity") {
    throw new Error("ARKTS_REFERENCES_DEPENDENCY_PROFILE must be closure or identity")
  }
  const contextRetentionProfile = environment.ARKTS_REFERENCES_CONTEXT_RETENTION ?? "dispose"
  if (contextRetentionProfile !== "dispose" && contextRetentionProfile !== "budget-aware") {
    throw new Error("ARKTS_REFERENCES_CONTEXT_RETENTION must be dispose or budget-aware")
  }
  const sessionReuse = environment.ARKTS_SEMANTIC_SESSION_REUSE ?? "off"
  if (sessionReuse !== "off" && sessionReuse !== "experimental") {
    throw new Error("ARKTS_SEMANTIC_SESSION_REUSE must be off or experimental")
  }
  return {
    strategy: configuredStrategy,
    batchRootLimit: positiveInteger(
      environment.ARKTS_REFERENCES_BATCH_ROOTS,
      DEFAULT_BATCH_ROOT_LIMIT,
      MAX_BATCH_ROOT_LIMIT,
    ),
    sdkAmbientProfile,
    dependencyProfile,
    contextRetentionProfile,
    anchorReuse: environment.ARKTS_REFERENCES_ANCHOR_REUSE === "1",
    residentFastPath: environment.ARKTS_REFERENCES_RESIDENT_FAST_PATH === "1",
    constructorScope: environment.ARKTS_REFERENCES_CONSTRUCTOR_SCOPE === "1",
    conservativeSemanticUnits: environment.ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS === "1",
    trace: environment.ARKTS_REFERENCES_TRACE === "1",
    sessionReuse,
  }
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`ARKTS_REFERENCES_BATCH_ROOTS must be an integer from 1 to ${maximum}`)
  }
  return parsed
}
