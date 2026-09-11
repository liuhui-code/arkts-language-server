import path from "node:path"
import { Worker } from "node:worker_threads"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { ReferenceBatchVerification } from "./reference-search-executor.js"

interface ReferenceBatchWorkerResponse extends ReferenceBatchVerification {
  readonly ok: true
}

interface ReferenceBatchWorkerFailure {
  readonly ok: false
  readonly message: string
}

export interface ReferenceAnchorVerification {
  readonly definitions: readonly SemanticDefinitionCandidate[]
  readonly prepared: ReferenceBatchVerification["prepared"]
  readonly stats: ReferenceBatchVerification["stats"]
  readonly memory: ReferenceBatchVerification["memory"]
}

export interface ReferenceBatchWorkerOptions {
  readonly workerPath?: string
  readonly isCancellationRequested?: () => boolean
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
}

export async function verifyReferenceBatchInWorker(
  workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition,
  includeDeclaration: boolean,
  options: ReferenceBatchWorkerOptions,
): Promise<ReferenceBatchVerification> {
  const workerPath = options.workerPath
    ?? path.join(__dirname, "reference-verifier-worker.cjs")
  const worker = new Worker(workerPath, {
    workerData: {
      operation: "references",
      workspace,
      position,
      includeDeclaration,
      projectConfiguration: options.projectConfiguration,
      sdkConfiguration: options.sdkConfiguration,
    },
  })
  let settled = false
  const cancellationTimer = options.isCancellationRequested
    ? setInterval(() => {
        if (!options.isCancellationRequested?.() || settled) return
        settled = true
        void worker.terminate()
      }, 10)
    : undefined
  cancellationTimer?.unref()
  try {
    return await new Promise<ReferenceBatchVerification>((resolve, reject) => {
      worker.once("message", (message: ReferenceBatchWorkerResponse | ReferenceBatchWorkerFailure) => {
        if (settled) return
        settled = true
        if (message.ok) resolve({
          result: message.result,
          prepared: message.prepared,
          stats: message.stats,
          memory: message.memory,
        })
        else reject(new Error(message.message))
      })
      worker.once("error", (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
      worker.once("exit", (code) => {
        if (settled) {
          if (options.isCancellationRequested?.()) reject(new Error("Semantic request cancelled"))
          return
        }
        settled = true
        reject(new Error(`Reference verifier worker exited ${code}`))
      })
    })
  } finally {
    if (cancellationTimer) clearInterval(cancellationTimer)
    await worker.terminate().catch(() => undefined)
  }
}

export function resolveReferenceAnchorInWorker(
  workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition,
  options: ReferenceBatchWorkerOptions,
): Promise<ReferenceAnchorVerification> {
  return runReferenceWorker({
    operation: "definition",
    workspace,
    position,
    projectConfiguration: options.projectConfiguration,
    sdkConfiguration: options.sdkConfiguration,
  }, options)
}

interface ReferenceWorkerInput {
  readonly operation: "definition"
  readonly workspace: SemanticWorkspaceView
  readonly position: SemanticDocumentPosition
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
}

async function runReferenceWorker(
  workerData: ReferenceWorkerInput,
  options: ReferenceBatchWorkerOptions,
): Promise<ReferenceAnchorVerification> {
  const workerPath = options.workerPath
    ?? path.join(__dirname, "reference-verifier-worker.cjs")
  const worker = new Worker(workerPath, { workerData })
  let settled = false
  const cancellationTimer = options.isCancellationRequested
    ? setInterval(() => {
        if (!options.isCancellationRequested?.() || settled) return
        settled = true
        void worker.terminate()
      }, 10)
    : undefined
  cancellationTimer?.unref()
  try {
    return await new Promise<ReferenceAnchorVerification>((resolve, reject) => {
      worker.once("message", (message: (
        | (ReferenceAnchorVerification & { readonly ok: true })
        | ReferenceBatchWorkerFailure
      )) => {
        if (settled) return
        settled = true
        if (message.ok) resolve({
          definitions: message.definitions,
          prepared: message.prepared,
          stats: message.stats,
          memory: message.memory,
        })
        else reject(new Error(message.message))
      })
      worker.once("error", (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
      worker.once("exit", (code) => {
        if (settled) {
          if (options.isCancellationRequested?.()) reject(new Error("Semantic request cancelled"))
          return
        }
        settled = true
        reject(new Error(`Reference verifier worker exited ${code}`))
      })
    })
  } finally {
    if (cancellationTimer) clearInterval(cancellationTimer)
    await worker.terminate().catch(() => undefined)
  }
}
