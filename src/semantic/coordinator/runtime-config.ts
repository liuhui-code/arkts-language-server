import committedConfig from "../../../config/semantic-runtime.json" assert { type: "json" }

export interface SemanticRuntimeConfig {
  readonly schemaVersion: 1
  readonly semanticWorkers: 1
  readonly maxResidentContexts: number
  readonly defaultMemoryBudgetMiB: number
  readonly sampleIntervalMs: number
  readonly level1Ratio: number
  readonly level2Ratio: number
  readonly level3Ratio: number
  readonly level3TargetRatio: number
}

export function semanticRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SemanticRuntimeConfig & { readonly memoryBudgetBytes: number } {
  const override = env.ARKTS_MEMORY_BUDGET_MB
  const budgetMiB = override === undefined
    ? committedConfig.defaultMemoryBudgetMiB
    : Number(override)
  if (!Number.isFinite(budgetMiB) || budgetMiB <= 0) {
    throw new Error("ARKTS_MEMORY_BUDGET_MB must be a positive number")
  }
  if (committedConfig.semanticWorkers !== 1 || committedConfig.maxResidentContexts > 2) {
    throw new Error("semantic runtime configuration exceeds the production ownership bounds")
  }
  return Object.freeze({
    ...committedConfig,
    schemaVersion: 1,
    semanticWorkers: 1,
    memoryBudgetBytes: Math.floor(budgetMiB * 1024 * 1024),
  })
}
