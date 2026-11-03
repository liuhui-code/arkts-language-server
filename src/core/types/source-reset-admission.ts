import path from "node:path"
import type { RetainedConfigurationProof } from "../../project/loaded-configuration-witness.js"
import { CAPSULE_HEADER_BYTES, ExactEvidenceCapacityError, MAX_WITNESS_BYTES } from "../../project/exact-witness-facts.js"
import type { SemanticCoordinator } from "../../semantic/coordinator/semantic-coordinator.js"
import type { WorkspaceEngineEntry } from "./type-workspace-entry.js"
import { canonicalTypeEngineOwner } from "./type-context-reset.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

// Successful replacements release their capsule immediately. Failed replacements
// retain bounded denial evidence, never an old LS/Program, until configuration reload.
const MAX_PENDING_BYTES = MAX_WITNESS_BYTES

export class SourceResetAdmissions {
  private readonly pending = new Map<string, { root: string; proof: RetainedConfigurationProof; cost: number }>()
  private configured = new WeakSet<WorkspaceEngineEntry>()
  private bytes = 0

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
      const entryBytes = 128 + 2 * (contextId.length + root.length)
      const available = MAX_PENDING_BYTES - this.bytes - entryBytes
      if (available < CAPSULE_HEADER_BYTES) throw new SemanticInputUnavailableError()
      let proof: RetainedConfigurationProof | undefined
      try { proof = previous.engine.captureConfigurationBeforeSourceReset(checkpoint, available) }
      catch (error) {
        if (error instanceof ExactEvidenceCapacityError) throw new SemanticInputUnavailableError()
        throw error
      }
      if (proof) {
        const cost = entryBytes + proof.accountedBytes
        retained = { root, proof, cost }
        this.pending.set(contextId, retained)
        this.bytes += cost
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
    this.bytes -= retained.cost
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

  clear(): void { this.pending.clear(); this.bytes = 0; this.configured = new WeakSet() }
}
