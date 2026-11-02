import path from "node:path"
import type { RetainedConfigurationProof } from "../../project/loaded-configuration-witness.js"
import type { SemanticCoordinator } from "../../semantic/coordinator/semantic-coordinator.js"
import type { WorkspaceEngineEntry } from "./type-workspace-entry.js"
import { canonicalTypeEngineOwner } from "./type-context-reset.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

// Successful replacements release their capsule immediately. Failed replacements
// retain bounded denial evidence, never an old LS/Program, until configuration reload.
const MAX_PENDING_FACTS = 4096

export class SourceResetAdmissions {
  private readonly pending = new Map<string, { root: string; proof: RetainedConfigurationProof; cost: number }>()
  private configured = new WeakSet<WorkspaceEngineEntry>()
  private facts = 0

  begin(contextId: string, root: string, previous: WorkspaceEngineEntry | undefined,
    reason: string | undefined, checkpoint: () => void): RetainedConfigurationProof | undefined {
    let retained = this.pending.get(contextId)
    if (previous && this.configured.has(previous)) {
      this.complete(contextId, retained?.proof)
      return undefined
    }
    if (!retained && previous && (reason === "content-revision-change"
      || reason === "document-store-reset" || reason === "reset-epoch-change"
      || reason === "resolution-generation-change" || reason === "unnotified-resolution-change")) {
      const proof = previous.engine.captureConfigurationBeforeSourceReset(checkpoint)
      if (proof) {
        const cost = Math.max(1, proof.factCount)
        if (this.facts + cost > MAX_PENDING_FACTS) throw new SemanticInputUnavailableError()
        retained = { root, proof, cost }
        this.pending.set(contextId, retained)
        this.facts += cost
      }
    }
    this.assertCurrent(retained?.proof, checkpoint)
    return retained?.proof
  }

  assertCurrent(proof: RetainedConfigurationProof | undefined, checkpoint: () => void): void {
    if (proof && !proof.current(checkpoint)) throw new SemanticInputUnavailableError()
  }

  complete(contextId: string, proof: RetainedConfigurationProof | undefined): void {
    const retained = this.pending.get(contextId)
    if (!retained || retained.proof !== proof) return
    this.facts -= retained.cost
    this.pending.delete(contextId)
  }

  /** A real configuration watcher event, not a source reset reason, authorizes new input loads. */
  configurationChanged(rootPath: string, coordinator: SemanticCoordinator<WorkspaceEngineEntry>): void {
    const root = canonicalTypeEngineOwner(rootPath), lexical = path.resolve(rootPath)
    coordinator.forEachContext((entry, id) => {
      if (entry.ownerId === root || id === lexical) this.configured.add(entry)
    })
    for (const [id, retained] of this.pending) {
      if (retained.root === root || retained.root === lexical) this.complete(id, retained.proof)
    }
  }

  consumeConfiguration(entry: WorkspaceEngineEntry | undefined): void { if (entry) this.configured.delete(entry) }

  clear(): void { this.pending.clear(); this.facts = 0; this.configured = new WeakSet() }
}
