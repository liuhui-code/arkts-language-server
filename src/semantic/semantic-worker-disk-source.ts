import type { DocumentSnapshot } from "../contracts/document.js"
import { readOwnDataRecord } from "./semantic-worker-record.js"
import { stringByteMetrics } from "./semantic-worker-string-bytes.js"

export interface SemanticWorkerDiskSource { readonly text: string }

/** Document and item follow-up source payloads retain distinct version contracts. */
export function admitsWorkerDiskSource(method: string, expectedDocumentVersion: unknown): boolean {
  if (method === "outgoingCalls" || method === "incomingCalls") return expectedDocumentVersion === null
  return expectedDocumentVersion === 0 && (method === "define" || method === "typeDefinitions"
    || method === "hover" || method === "signatureHelp" || method === "complete"
    || method === "resolveCompletion" || method === "prepareCallHierarchy" || method === "implementations"
    || method === "references" || method === "prepareRename" || method === "rename")
}

/** Separate source bytes from bounded query arguments; both remain in the message budget. */
export function decodeWorkerDiskSource(value: unknown, maxTextBytes: number, maxMessageBytes: number,
  invalid: () => Error, textTooLarge: () => Error, messageTooLarge: () => Error) {
  const input = readOwnDataRecord(value, ["text"], [], 1)
  if (!input || typeof input.text !== "string") throw invalid()
  const metrics = stringByteMetrics(input.text, maxTextBytes, maxMessageBytes, textTooLarge, messageTooLarge)
  return { value: Object.freeze({ text: input.text }), textWireBytes: metrics.wireBytes }
}

/** A disk request never enters the Worker's open-document map or sync mutation path. */
export function workerRequestDocument(request: { readonly uri: string; readonly diskSource?: SemanticWorkerDiskSource },
  rootUri: string, opened: DocumentSnapshot | undefined): DocumentSnapshot | undefined {
  if (!request.diskSource) return opened
  if (opened) return undefined
  return Object.freeze({ uri: request.uri, version: 0, text: request.diskSource.text, workspaceId: rootUri,
    source: Object.freeze({ kind: "disk" as const, rootUri }) })
}
