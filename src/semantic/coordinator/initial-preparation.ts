import type { SemanticReadinessReport } from "../../contracts/semantic-readiness.js"

let activePreparations = 0
const checkpoints = new Set<() => void>()

/** Isolate-local scope; observations still report real memory during initialization. */
export function initialPreparationActive(): boolean { return activePreparations > 0 }
export function initialPreparationCheckpoint(): void { for (const check of checkpoints) check() }

export class InitialProjectPreparation {
  private readonly preparedRoots = new Set<string>()

  async run(rootUri: string, prepare: boolean,
    operation: () => SemanticReadinessReport | Promise<SemanticReadinessReport>,
    checkpoint: () => void = () => {}): Promise<SemanticReadinessReport> {
    if (!prepare || this.preparedRoots.has(rootUri)) return operation()
    activePreparations++
    checkpoints.add(checkpoint)
    try {
      const report = await operation()
      if (report.semanticState === "ready") this.preparedRoots.add(rootUri)
      return report
    } finally { checkpoints.delete(checkpoint); activePreparations-- }
  }
}
