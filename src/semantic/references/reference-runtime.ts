import type { TypeScriptSdkAmbientProfile } from "../../core/types/typescript-language-service.js"

export type ReferenceSearchStrategy = "legacy" | "batched" | "indexed-batched"
export type ReferenceSdkAmbientProfile = Extract<TypeScriptSdkAmbientProfile, "full" | "common">
export type ReferenceDependencyProfile = "closure" | "identity"

export interface ReferenceSearchRuntimeConfig {
  readonly strategy: ReferenceSearchStrategy
  readonly batchRootLimit: number
  readonly sdkAmbientProfile: ReferenceSdkAmbientProfile
  readonly dependencyProfile: ReferenceDependencyProfile
  readonly trace: boolean
}

const DEFAULT_BATCH_ROOT_LIMIT = 64
const MAX_BATCH_ROOT_LIMIT = 512

export function referenceSearchRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ReferenceSearchRuntimeConfig {
  const configuredStrategy = environment.ARKTS_REFERENCES_STRATEGY ?? "legacy"
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
  return {
    strategy: configuredStrategy,
    batchRootLimit: positiveInteger(
      environment.ARKTS_REFERENCES_BATCH_ROOTS,
      DEFAULT_BATCH_ROOT_LIMIT,
      MAX_BATCH_ROOT_LIMIT,
    ),
    sdkAmbientProfile,
    dependencyProfile,
    trace: environment.ARKTS_REFERENCES_TRACE === "1",
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
