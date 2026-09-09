import type { SemanticMemoryLevel } from "./semantic-coordinator.js"

export interface SemanticMemoryPolicyConfig {
  readonly level1Ratio: number
  readonly level2Ratio: number
  readonly level3Ratio: number
  readonly level3TargetRatio: number
}

export class SemanticMemoryPolicy {
  constructor(private readonly config: SemanticMemoryPolicyConfig) {
    if (!(config.level1Ratio < config.level2Ratio
      && config.level2Ratio < config.level3Ratio
      && config.level3TargetRatio < config.level3Ratio)) {
      throw new Error("invalid semantic memory thresholds")
    }
  }

  levelFor(rssBytes: number, budgetBytes: number): SemanticMemoryLevel {
    if (!Number.isFinite(rssBytes) || rssBytes < 0) throw new Error("rssBytes must be non-negative")
    if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) {
      throw new Error("budgetBytes must be positive")
    }
    const ratio = rssBytes / budgetBytes
    if (ratio >= this.config.level3Ratio) return "level3"
    if (ratio >= this.config.level2Ratio) return "level2"
    if (ratio >= this.config.level1Ratio) return "level1"
    return "level0"
  }
}
