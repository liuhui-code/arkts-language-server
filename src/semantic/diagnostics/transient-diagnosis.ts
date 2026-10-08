import { randomUUID } from "node:crypto"
import path from "node:path"
import { Worker, threadId } from "node:worker_threads"

import type { DocumentSnapshot } from "../../contracts/document.js"
import type { SemanticDiagnostic, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import { createStructuredLogger, type StructuredLogger } from "../../observability/logger.js"
import type { LegacySemanticEngineRuntimeOptions } from "../legacy-semantic-engine.js"

export interface TransientDiagnosisInput {
  readonly rootUri: string
  readonly documents: readonly DocumentSnapshot[]
  readonly document: DocumentSnapshot
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
  readonly interactiveSdkAmbientProfile?: LegacySemanticEngineRuntimeOptions["interactiveSdkAmbientProfile"]
  readonly interactiveProjectRootProfile?: LegacySemanticEngineRuntimeOptions["interactiveProjectRootProfile"]
}

type DiagnosisResponse =
  | { readonly ok: true; readonly result: VersionedSemanticResult<SemanticDiagnostic[]> }
  | { readonly ok: false; readonly message: string }

export interface TransientDiagnosisWorkerData extends TransientDiagnosisInput {
  readonly traceId?: string
}

let traceLogger: StructuredLogger | undefined

export function traceTransientDiagnosis(phase: string, documentVersion: number, traceId?: string): void {
  if (!traceId) return
  const { rss, heapUsed } = process.memoryUsage()
  const logger = traceLogger ?? (traceLogger = createStructuredLogger())
  logger.info("diagnostics.transient.phase", {
    phase,
    traceId,
    epochMs: Date.now(),
    monotonicNs: process.hrtime.bigint().toString(),
    threadId,
    documentVersion,
    rssBytes: rss,
    heapUsedBytes: heapUsed,
  })
}

export async function runTransientDiagnosis(
  input: TransientDiagnosisInput,
  signal: AbortSignal,
): Promise<VersionedSemanticResult<SemanticDiagnostic[]>> {
  if (signal.aborted) throw new Error("Semantic request cancelled")
  const traceId = process.env.ARKTS_BENCHMARK_CONTROL === "1"
    && process.env.ARKTS_L01_TRANSIENT_DIAGNOSTICS === "1"
    && process.env.ARKTS_L01_TRANSIENT_DIAGNOSTICS_TRACE === "1"
    ? randomUUID() : undefined
  traceTransientDiagnosis("spawn.before", input.document.version, traceId)
  const worker = new Worker(path.join(__dirname, "diagnostic-verifier-worker.cjs"), {
    workerData: { ...input, traceId } satisfies TransientDiagnosisWorkerData,
  })
  traceTransientDiagnosis("spawn.after", input.document.version, traceId)
  let settled = false
  const cancellationTimer = setInterval(() => {
    if (!signal.aborted || settled) return
    settled = true
    void worker.terminate()
  }, 10)
  cancellationTimer.unref()
  try {
    return await new Promise<VersionedSemanticResult<SemanticDiagnostic[]>>((resolve, reject) => {
      worker.on("message", (message: DiagnosisResponse) => {
        if (settled) return
        traceTransientDiagnosis("response", input.document.version, traceId)
        settled = true
        if (!message.ok) {
          reject(new Error(message.message))
        } else if (message.result.documentVersion !== input.document.version) {
          reject(new Error("Transient diagnosis returned a stale document version"))
        } else {
          resolve(message.result)
        }
      })
      worker.once("error", (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
      worker.once("exit", (code) => {
        if (!settled) {
          settled = true
          reject(new Error(`Diagnostic verifier worker exited ${code}`))
        } else if (signal.aborted) {
          reject(new Error("Semantic request cancelled"))
        }
      })
    })
  } finally {
    clearInterval(cancellationTimer)
    traceTransientDiagnosis("terminate.start", input.document.version, traceId)
    await worker.terminate().catch(() => undefined)
    traceTransientDiagnosis("terminate.end", input.document.version, traceId)
  }
}
