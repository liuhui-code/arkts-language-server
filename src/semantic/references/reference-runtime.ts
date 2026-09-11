export type ReferenceSearchStrategy = "legacy" | "batched" | "indexed-batched"

export interface ReferenceSearchRuntimeConfig {
  readonly strategy: ReferenceSearchStrategy
  readonly batchRootLimit: number
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
  return {
    strategy: configuredStrategy,
    batchRootLimit: positiveInteger(
      environment.ARKTS_REFERENCES_BATCH_ROOTS,
      DEFAULT_BATCH_ROOT_LIMIT,
      MAX_BATCH_ROOT_LIMIT,
    ),
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
