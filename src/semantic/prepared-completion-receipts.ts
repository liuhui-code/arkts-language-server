import type { SemanticCompletion, SemanticCompletionList, SemanticCompletionResolveQuery,
  VersionedSemanticResult } from "../contracts/semantic-engine.js"

export interface PreparedCompletionInput {
  readonly rootUri: string
  readonly rootRevision: number
  readonly configurationRevision: number
}

/** Parent payload retention is not authority to reuse the Worker's physical inputs. */
export class PreparedCompletionReceipts {
  private readonly inputs = new WeakMap<SemanticCompletion, PreparedCompletionInput>()

  remember(list: Pick<SemanticCompletionList, "items">, input: PreparedCompletionInput): void {
    const stamp = { rootUri: input.rootUri, rootRevision: input.rootRevision,
      configurationRevision: input.configurationRevision }
    for (const item of list.items) if (item.preResolved) this.inputs.set(item, stamp)
  }

  resolve(query: SemanticCompletionResolveQuery, current: (input: PreparedCompletionInput) => boolean,
    request: (recipe: SemanticCompletion) => Promise<VersionedSemanticResult<SemanticCompletion>>):
    Promise<VersionedSemanticResult<SemanticCompletion>> | undefined {
    const input = this.inputs.get(query.completion), prepared = query.completion.preResolved
    const namespace = query.completion.data?.resolutionNamespace
    if (!input || !current(input) || input.rootUri !== query.document.workspaceId
      || query.document.source?.kind === "disk" || typeof namespace !== "string"
      || prepared?.documentVersion !== query.document.version
      || !(prepared.additionalTextEdits ?? []).every(edit => edit.uri === query.document.uri
        && edit.expectedVersion === query.document.version)) return undefined
    const { preResolved: _payload, ...completion } = query.completion
    const original = { ...completion, documentation: undefined, additionalTextEdits: undefined }
    // Keep arbitrarily large cached documentation/edits out of the bounded request.
    return request({ label: "cached-completion-admission", detail: "", kind: "property",
      data: { resolutionNamespace: namespace, requestCachedNamespaceAdmission: true } }).then(result => {
      if (!current(input) || result.value.data?.admittedCachedNamespace !== namespace) return { ...result, value: original }
      return { documentVersion: result.documentVersion, value: { ...completion,
        detail: prepared.detail, documentation: prepared.documentation,
        additionalTextEdits: prepared.additionalTextEdits, data: { ...completion.data, resolved: true } } }
    })
  }
}
