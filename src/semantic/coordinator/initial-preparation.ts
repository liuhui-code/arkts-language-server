import type { SemanticReadinessReport } from "../../contracts/semantic-readiness.js"

let activePreparations = 0
const checkpoints = new Set<() => void>()

/** Isolate-local scope; observations still report real memory during initialization. */
export function initialPreparationActive(): boolean { return activePreparations > 0 }
export function initialPreparationCheckpoint(): void { for (const check of checkpoints) check() }

export class InitialProjectPreparation {
  private readonly preparedRoots = new Set<string>()

  restoreCompleted(rootUri: string): void { this.preparedRoots.add(rootUri) }

  async run(rootUri: string, prepare: boolean,
    operation: () => SemanticReadinessReport | Promise<SemanticReadinessReport>,
    checkpoint: () => void = () => {}): Promise<SemanticReadinessReport> {
    if (!prepare || this.preparedRoots.has(rootUri)) return operation()
    activePreparations++
    checkpoints.add(checkpoint)
    try {
      const report = await operation()
      // A completed attempt consumes initialization even when inputs are missing.
      // Ordinary recovery must never renew the pressure exemption.
      this.preparedRoots.add(rootUri)
      return report
    } finally { checkpoints.delete(checkpoint); activePreparations-- }
  }
}
