import type { SemanticDocumentQuery, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { ReferenceInputState } from "./reference-input-snapshot.js"
import { SemanticWorkerSupervisorError } from "../semantic-worker-supervisor.js"
import type { SemanticReadinessQuery, SemanticReadinessReport } from "../../contracts/semantic-readiness.js"

/** Every admission performs a fresh Store observation. Native scope equality is
 * checked separately; first observation alone is not proof of a changed index. */
export class ReferenceNamespaceAdmission {
  private readonly observed = new Map<string, { names: string; disk?: string; currentDisk?: string; overlayOnly: boolean }>()
  private readonly reconciled = new Map<string, string>()
  constructor(private readonly readiness: (query: SemanticReadinessQuery) => Promise<SemanticReadinessReport>,
    private readonly changed: (rootUri: string, kind: "namespace" | "content") => void,
    private readonly reconcile: (rootUri: string, kind: "namespace" | "content") => void = () => {},
    private readonly indexCurrent?: (rootUri: string, fingerprint: string, signal?: AbortSignal) => Promise<boolean>) {}

  async read(query: SemanticReadinessQuery): Promise<SemanticReadinessReport> {
    const report = await this.readiness(query)
    if (query.signal?.aborted) throw query.signal.reason ?? new Error("References admission cancelled")
    const previous = this.observed.get(query.rootUri)
    if (previous) previous.currentDisk = undefined
    const namespace = report.sourceNamespace
    if (namespace && report.rootUri === query.rootUri) {
      const namesChanged = previous?.names !== namespace.sha256
      this.observed.set(query.rootUri, { names: namespace.sha256,
        disk: namespace.diskSha256 ?? (namesChanged ? undefined : previous?.disk), currentDisk: namespace.diskSha256,
        overlayOnly: namespace.overlayOnly ?? (namesChanged ? false : previous?.overlayOnly ?? false) })
      if (previous && (namesChanged || namespace.diskSha256 !== undefined
        && previous.disk !== undefined && previous.disk !== namespace.diskSha256)) {
        this.reconciled.delete(query.rootUri)
        this.changed(query.rootUri, namesChanged ? "namespace" : "content")
        if (!namespace.overlayOnly && namespace.diskSha256 && this.indexCurrent) {
          const qualified = await this.indexCurrent(query.rootUri, namespace.diskSha256, query.signal)
          if (query.signal?.aborted) throw query.signal.reason ?? new Error("References admission cancelled")
          const current = this.observed.get(query.rootUri)
          if (current?.names !== namespace.sha256 || current.currentDisk !== namespace.diskSha256) {
            throw new SemanticWorkerSupervisorError("content-modified")
          }
          if (qualified) return report
        }
        this.requestReconciliation(query.rootUri, namesChanged ? "namespace" : "content")
      }
    }
    return report
  }

  /** Complete edit sets retain one input/recovery generation through publication.
   * The existing compiler fences remain responsible for binding/SDK correctness. */
  async run<Value extends { readonly status: string }>(query: SemanticDocumentQuery, inputs: ReferenceInputState,
    execute: () => Promise<VersionedSemanticResult<Value>>): Promise<VersionedSemanticResult<Value>> {
    const request = { rootUri: query.document.source?.rootUri ?? query.document.workspaceId,
      prepare: false, captureSourceInputs: true, signal: query.signal } as const
    const beforeReport = await this.read(request)
    if (beforeReport.unavailableReasons.includes("inputs-changed-during-preparation")) {
      throw new SemanticWorkerSupervisorError("workspace-incomplete")
    }
    const before = beforeReport.sourceNamespace
    const revision = inputs.captureRevision(request.rootUri)
    const result = await execute()
    if (result.value.status !== "complete") return result
    const assertCurrent = () => {
      if (!inputs.isCurrent(revision)) throw new SemanticWorkerSupervisorError("content-modified")
    }
    assertCurrent()
    const afterReport = await this.read(request)
    assertCurrent()
    if (afterReport.unavailableReasons.includes("inputs-changed-during-preparation")) {
      throw new SemanticWorkerSupervisorError("workspace-incomplete")
    }
    const after = afterReport.sourceNamespace
    if (!before?.diskSha256 || !after?.diskSha256) throw new SemanticWorkerSupervisorError("workspace-incomplete")
    if (before.sha256 !== after.sha256 || before.diskSha256 !== after.diskSha256) {
      throw new SemanticWorkerSupervisorError("content-modified")
    }
    return result
  }

  /** One request per actual observed input; repeated stale-index queries cannot create a retry storm. */
  requestReconciliation(rootUri: string, kind: "namespace" | "content" = "namespace"): void {
    const input = this.observed.get(rootUri)
    if (!input || input.overlayOnly) return
    const key = `${input.names}:${input.disk ?? "unproved"}`
    if (this.reconciled.get(rootUri) === key) return
    this.reconciled.set(rootUri, key)
    this.reconcile(rootUri, kind)
  }

  hasOverlayOnly(rootUri: string): boolean { return this.observed.get(rootUri)?.overlayOnly === true }

  diskFingerprint(rootUri: string): string | undefined {
    const input = this.observed.get(rootUri)
    return input?.overlayOnly ? undefined : input?.currentDisk
  }

  clear(): void { this.observed.clear(); this.reconciled.clear() }
}
