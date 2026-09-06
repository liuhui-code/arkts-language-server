import path from "node:path"
import { Worker } from "node:worker_threads"

import {
  createConnection,
  ErrorCodes,
  LogMessageNotification,
  LSPErrorCodes,
  MessageType,
  ProposedFeatures,
  ResponseError,
  TextDocumentSyncKind,
  type CancellationToken,
} from "vscode-languageserver/node.js"

const connection = createConnection(ProposedFeatures.all)
const worker = new Worker(path.join(__dirname, "blocking-semantic-worker.cjs"))
const documents = new Map<string, { version: number; text: string }>()
const pending = new Map<number, PendingRequest>()
let nextWorkerRequestId = 1
let disposed = false

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Full,
    },
    referencesProvider: true,
    completionProvider: { triggerCharacters: ["."] },
    documentHighlightProvider: true,
  },
}))

connection.onDidOpenTextDocument(({ textDocument }) => {
  documents.set(textDocument.uri, {
    version: textDocument.version,
    text: textDocument.text,
  })
})

connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => {
  const latest = contentChanges.at(-1)
  if (latest && "text" in latest) {
    documents.set(textDocument.uri, { version: textDocument.version, text: latest.text })
  }
  cancelRequestsForDocument(textDocument.uri, 2)
})

connection.onDidCloseTextDocument(({ textDocument }) => {
  documents.delete(textDocument.uri)
  cancelRequestsForDocument(textDocument.uri, 2)
})

connection.onReferences((params, token) => {
  if (!documents.has(params.textDocument.uri)) return []
  return blockSemanticRequest(params.textDocument.uri, token)
})

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri)
  return document ? [{ label: `fixture-v${document.version}` }] : []
})

connection.onDocumentHighlight((params) => {
  if (!validDocumentPosition(params)) {
    throw new ResponseError(ErrorCodes.InvalidParams, "Invalid document highlight parameters.")
  }
  return []
})

connection.onShutdown(dispose)
connection.onExit(() => { void dispose() })

worker.on("message", (message: unknown) => {
  if (!isWorkerMessage(message)) return
  const request = pending.get(message.requestId)
  if (!request) return

  if (message.kind === "entered") {
    void connection.sendNotification(LogMessageNotification.type, {
      type: MessageType.Log,
      message: "blocking semantic request entered",
    })
    return
  }

  pending.delete(message.requestId)
  request.cancellation.dispose()
  if (message.kind === "failsafe") {
    request.reject(new Error(message.reason))
    return
  }
  request.resolve(message.cancellation)
})

worker.on("error", failPending)
worker.on("exit", (code) => {
  if (!disposed) failPending(new Error(`blocking semantic worker exited ${code}`))
})

connection.listen()

async function blockSemanticRequest(uri: string, token: CancellationToken): Promise<never[]> {
  const requestId = nextWorkerRequestId
  nextWorkerRequestId += 1
  const cancelCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationState = new Int32Array(cancelCell)

  const state = await new Promise<number>((resolve, reject) => {
    const cancellation = token.onCancellationRequested(() => {
      releaseCell(cancellationState, 1)
    })
    pending.set(requestId, { uri, cancellationState, cancellation, resolve, reject })
    worker.postMessage({ protocol: 1, kind: "block", requestId, cancelCell })
  })

  if (state === 1) {
    throw new ResponseError(LSPErrorCodes.RequestCancelled, "Request cancelled by client")
  }
  if (state === 2) {
    throw new ResponseError(LSPErrorCodes.ContentModified, "References request is stale")
  }
  throw new ResponseError(ErrorCodes.InternalError, "Blocking semantic fixture stopped")
}

function cancelRequestsForDocument(uri: string, state: number): void {
  for (const request of pending.values()) {
    if (request.uri === uri) releaseCell(request.cancellationState, state)
  }
}

function releaseCell(cell: Int32Array, state: number): void {
  Atomics.compareExchange(cell, 0, 0, state)
  Atomics.notify(cell, 0)
}

async function dispose(): Promise<void> {
  if (disposed) return
  disposed = true
  for (const request of pending.values()) releaseCell(request.cancellationState, 3)
  await worker.terminate()
  failPending(new Error("blocking semantic fixture disposed"))
}

function failPending(error: Error): void {
  const requests = [...pending.values()]
  pending.clear()
  for (const request of requests) {
    request.cancellation.dispose()
    request.reject(error)
  }
}

function validDocumentPosition(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false
  const params = value as {
    textDocument?: { uri?: unknown }
    position?: { line?: unknown; character?: unknown }
  }
  return typeof params.textDocument?.uri === "string"
    && Number.isInteger(params.position?.line)
    && Number.isInteger(params.position?.character)
    && Number(params.position?.line) >= 0
    && Number(params.position?.character) >= 0
}

interface PendingRequest {
  uri: string
  cancellationState: Int32Array
  cancellation: { dispose(): void }
  resolve(state: number): void
  reject(error: Error): void
}

type WorkerMessage = {
  protocol: 1
  requestId: number
} & (
  | { kind: "entered" }
  | { kind: "terminal"; cancellation: number }
  | { kind: "failsafe"; reason: string }
)

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (value === null || typeof value !== "object") return false
  const message = value as Partial<WorkerMessage>
  return message.protocol === 1
    && Number.isSafeInteger(message.requestId)
    && (
      message.kind === "entered"
      || (message.kind === "terminal" && Number.isInteger(message.cancellation))
      || (message.kind === "failsafe" && typeof message.reason === "string")
    )
}
