import { withRequestInputValidation, withSynchronousInputPreparation } from "../project/request-input-validation.js"
import { projectSourceNamespace } from "./project-source-namespace.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"
import type { SemanticReadinessQuery, SemanticReadinessReport } from "../contracts/semantic-readiness.js"
import { semanticUnprepared } from "../contracts/semantic-readiness.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type { SemanticDocumentStore } from "../core/workspace/document-store.js"
import type { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import { enableSharedSdkRetention } from "./backends/ohos-typescript/registry-pool.js"
import { InitialProjectPreparation } from "./coordinator/initial-preparation.js"
import { toFilePath } from "./semantic-worker-file-identity.js"

/** Keep the root's initialization lifetime separate from a replaceable Worker. */
export class ProjectReadinessLifecycle {
  private readonly initial = new InitialProjectPreparation()
  restoreCompleted(rootUri: string): void { this.initial.restoreCompleted(rootUri) }
  read(query: SemanticReadinessQuery, projects: ProjectResolverPort,
    documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry) {
    return prepareProjectReadiness(query, projects, documents, engines, this.initial)
  }
}

/** First complete project preparation owns its pressure exemption, never later recovery. */
export function prepareProjectReadiness(query: SemanticReadinessQuery, projects: ProjectResolverPort,
  documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry, initial: InitialProjectPreparation) {
  return initial.run(query.rootUri, query.prepare, () => withSynchronousInputPreparation(() => {
    checkpoint(query.signal)
    if (query.prepare) enableSharedSdkRetention()
    const rootPath = toFilePath(query.rootUri)
    if (!rootPath || projects.projectFor(query.rootUri).rootUri !== query.rootUri) {
      return semanticUnprepared(query.rootUri, "workspace-root-unavailable")
    }
    const workspace = documents.prepareRoot(rootPath)
    checkpoint(query.signal)
    if (workspace && query.prepare) engines.prepareInitialGroups(workspace)
    if (workspace && workspace.projectMembership?.status !== "complete") {
      return semanticUnprepared(query.rootUri, "project-membership-incomplete")
    }
    if (!workspace) return semanticUnprepared(query.rootUri, "workspace-sources-unavailable")
    // A namespace proof read must not consume a resolver rebase in an earlier
    // Worker command and silently authorize the subsequent semantic request.
    let admissionFailure: SemanticReadinessReport | undefined
    try { if (query.captureSourceInputs) engines.assertReadinessInputAdmission(workspace) }
    catch (error) {
      if (!(error instanceof SemanticInputUnavailableError)) throw error
      admissionFailure = semanticUnprepared(query.rootUri, "inputs-changed-during-preparation")
    }
    if (admissionFailure) return { ...admissionFailure,
      sourceNamespace: withRequestInputValidation(() => projectSourceNamespace(documents, workspace, query.captureSourceInputs !== undefined), unavailable) }
    if (query.captureSourceInputs) {
      let visited = false
      const report = engines.semanticReadiness(workspace, query.prepare, (digest, current) => {
        visited = true
        const sdkIncomplete = current.semanticState === "partial" && current.unavailableReasons.includes("sdk-inputs-incomplete")
        return projectSourceNamespace(documents, workspace, query.captureSourceInputs === true || !sdkIncomplete, digest)
      })
      // No owner/budget cannot supply compiler byte evidence. Preserve raw namespace
      // capture in that case; a visitor that failed must never be retried/rebased.
      return visited ? report : { ...report,
        sourceNamespace: withRequestInputValidation(() => projectSourceNamespace(documents, workspace, query.captureSourceInputs === true
          || !(report.semanticState === "partial" && report.unavailableReasons.includes("sdk-inputs-incomplete"))), unavailable) }
    }
    const sourceNamespace = projectSourceNamespace(documents, workspace, false)
    return { ...engines.semanticReadiness(workspace, query.prepare), sourceNamespace }
  }), () => checkpoint(query.signal))
}

function checkpoint(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}

function unavailable(): never { throw new SemanticInputUnavailableError() }
