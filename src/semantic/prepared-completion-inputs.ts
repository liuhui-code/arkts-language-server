import type { SemanticCompletion, SemanticCompletionResolveQuery } from "../contracts/semantic-engine.js"
import type { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import { completionNamespaceCurrent } from "../core/types/completion-resolution-inputs.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"
import { resolutionInputWasRebased } from "../project/resolution-input-admission.js"

/** A lazy result cannot silently acquire a different resolver authority after repair. */
export function reusablePreparedCompletion(query: SemanticCompletionResolveQuery, resolver: LocalPackageResolver,
  rootPath: string | undefined, allowPreResolved: boolean, checkpoint: () => void): SemanticCompletion | undefined {
  if (typeof query.completion.data?.resolutionNamespace === "string") {
    if (rootPath && (resolver.refreshInputGeneration(rootPath, checkpoint) || resolutionInputWasRebased(resolver))) {
      throw new SemanticInputUnavailableError()
    }
    if (!completionNamespaceCurrent(resolver, query.completion)) return { ...query.completion,
      documentation: undefined, additionalTextEdits: undefined, preResolved: undefined }
    if (query.completion.data.requestCachedNamespaceAdmission === true) return { ...query.completion,
      data: { admittedCachedNamespace: query.completion.data.resolutionNamespace } }
  }
  const prepared = query.completion.preResolved
  if (!allowPreResolved || prepared?.documentVersion !== query.document.version) return undefined
  return { ...query.completion, detail: prepared.detail, documentation: prepared.documentation,
    additionalTextEdits: prepared.additionalTextEdits,
    data: { ...query.completion.data, resolved: true } }
}
