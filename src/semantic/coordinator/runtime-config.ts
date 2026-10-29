import committedConfig from "../../../config/semantic-runtime.json" assert { type: "json" }

export interface SemanticRuntimeConfig {
  readonly schemaVersion: 1
  readonly semanticWorkers: 1
  /** null disables the context-count cap; an RSS budget is independently opt-in. */
  readonly maxResidentContexts: number | null
  readonly defaultMemoryBudgetMiB: number | null
  readonly sampleIntervalMs: number
  readonly level1Ratio: number
  readonly level2Ratio: number
  readonly level3Ratio: number
  readonly level3TargetRatio: number
}

export function semanticRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SemanticRuntimeConfig & { readonly memoryBudgetBytes: number | null } {
  const override = env.ARKTS_MEMORY_BUDGET_MB
  const budgetMiB = override === undefined
    ? committedConfig.defaultMemoryBudgetMiB
    : Number(override)
  if (budgetMiB !== null && (!Number.isFinite(budgetMiB) || budgetMiB <= 0)) {
    throw new Error("ARKTS_MEMORY_BUDGET_MB must be a positive number")
  }
  const memoryBudgetBytes = budgetMiB === null ? null : Math.floor(budgetMiB * 1024 * 1024)
  if (memoryBudgetBytes !== null && (!Number.isSafeInteger(memoryBudgetBytes) || memoryBudgetBytes < 1)) {
    throw new Error("ARKTS_MEMORY_BUDGET_MB must be positive and represent a safe byte budget")
  }
  if (committedConfig.semanticWorkers !== 1 || (committedConfig.maxResidentContexts !== null
    && (!Number.isSafeInteger(committedConfig.maxResidentContexts) || committedConfig.maxResidentContexts < 1))) {
    throw new Error("semantic runtime configuration exceeds the production ownership bounds")
  }
  return Object.freeze({
    ...committedConfig,
    schemaVersion: 1,
    semanticWorkers: 1,
    memoryBudgetBytes,
  })
}
