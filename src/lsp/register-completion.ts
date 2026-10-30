import { createHash } from "node:crypto"
import { LSPErrorCodes, ResponseError, type ClientCapabilities, type Connection, type TextDocuments } from "vscode-languageserver/node.js"
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticCompletion, SemanticCompletionList, SemanticEnginePort,
  VersionedSemanticResult } from "../contracts/semantic-engine.js"
import { CompletionResolutionStore } from "./completion-resolution-store.js"
import { CompletionResolutionQueue } from "./completion-resolution-queue.js"
import { invalidCompletionResolution, toLspCompletionItem, toLspResolvedCompletionItem,
  type CompletionClientProfile } from "./completion-mapper.js"
import type { SemanticRequestRunner } from "./semantic-request-runner.js"

const MAX_COMPLETION_ITEMS = 256
const DEFAULT_PROFILE: CompletionClientProfile = Object.freeze({
  commitCharacters: false, insertReplaceEdits: false, snippets: false,
})

/** Own completion registration, client presentation and per-document handle lifetime. */
export function registerCompletionHandlers({ connection, documents, semantic, requests, assertRunning }: {
  connection: Connection
  documents: TextDocuments<TextDocument>
  semantic: SemanticEnginePort
  requests: SemanticRequestRunner
  assertRunning(): void
}) {
  const completionResolutions = new CompletionResolutionStore()
  const resolutionQueue = new CompletionResolutionQueue()
  let completionClientProfile = DEFAULT_PROFILE
  documents.onDidChangeContent(({ document }) => completionResolutions.forgetDocument(document.uri))
  documents.onDidClose(({ document }) => completionResolutions.forgetDocument(document.uri))
  connection.onCompletion(async (params, token) => {
    let completionDocument: DocumentSnapshot | undefined
    const result = await requests.run({
      method: "textDocument/completion",
      documentUri: params.textDocument.uri,
      token,
      fallback: { items: [], isIncomplete: false } as SemanticCompletionList,
      execute: (document, signal) => {
        completionDocument = document
        return semantic.complete({ document, position: params.position,
          completionOptions: { snippets: completionClientProfile.snippets }, signal })
      },
    })
    const document = documents.get(params.textDocument.uri) ?? completionDocument
    if (!document) return { isIncomplete: false, items: [] }
    const diskSourceSha256 = completionDocument?.source?.kind === "disk"
      ? createHash("sha256").update(completionDocument.text).digest("hex") : undefined
    const bounded = result.items.slice(0, MAX_COMPLETION_ITEMS)
    const items = bounded.map((completion) => completionResolutions.remember({
        documentUri: document.uri,
        documentVersion: document.version,
        position: { ...params.position },
        completion,
        ...(diskSourceSha256 ? { diskSourceSha256 } : {}),
      }, data => toLspCompletionItem(completion, data, completionClientProfile, params.position)))
    return {
      isIncomplete: result.isIncomplete || result.items.length > bounded.length,
      items,
    }
  })

  connection.onCompletionResolve(async (clientItem, token) => {
    assertRunning()
    if (token.isCancellationRequested) throw new ResponseError(LSPErrorCodes.RequestCancelled, "Request cancelled")
    const entry = completionResolutions.find(clientItem)
    if (!entry) throw invalidCompletionResolution()
    const record = entry.record
    const currentDocument = record ? documents.get(record.documentUri) : undefined
    if (!record || (record.diskSourceSha256 === undefined
      ? !currentDocument || currentDocument.version !== record.documentVersion
      : currentDocument !== undefined)) {
      entry.record = undefined
      return entry.item
    }
    const resolved = await requests.run<SemanticCompletion | null>({
      method: "completionItem/resolve",
      documentUri: record.documentUri,
      identityKey: entry.item.data.arktsCompletionId,
      coalesceKey: entry.item.data.arktsCompletionId,
      token,
      fallback: null,
      execute: (document, signal) => resolutionQueue.run<VersionedSemanticResult<SemanticCompletion | null>>(
        document.workspaceId, signal, () => {
        if (entry.record !== record) return Promise.resolve({ documentVersion: document.version, value: null })
        if (record.diskSourceSha256 !== undefined && (document.source?.kind !== "disk"
          || createHash("sha256").update(document.text).digest("hex") !== record.diskSourceSha256)) {
          entry.record = undefined
          return Promise.resolve({ documentVersion: document.version, value: null })
        }
        return semantic.resolveCompletion({ document, position: record.position,
          completionOptions: { snippets: completionClientProfile.snippets }, completion: record.completion, signal })
        }),
    })
    // Close/reopen may reuse the numeric version; record identity is the lifetime fence.
    if (!resolved || entry.record !== record) return entry.item
    return toLspResolvedCompletionItem(
      resolved,
      entry.item,
      record,
    )
  })

  return {
    configure(capabilities: ClientCapabilities): void {
      completionClientProfile = Object.freeze({
        commitCharacters: capabilities.textDocument?.completion
          ?.completionItem?.commitCharactersSupport === true,
        insertReplaceEdits: capabilities.textDocument?.completion
          ?.completionItem?.insertReplaceSupport === true,
        snippets: capabilities.textDocument?.completion
          ?.completionItem?.snippetSupport === true,
      })
    },
    clear(): void { completionResolutions.clear(); resolutionQueue.clear() },
  }
}
