import type { Connection } from "vscode-languageserver/node.js"
import type { SemanticEnginePort } from "../contracts/semantic-engine.js"
import { processMemoryFields, type StructuredLogger } from "../observability/logger.js"

/** Server-owned preparation; ordinary clients do not need a custom warm-up request. */
export async function prepareInitialSemantics(connection: Connection, semantic: SemanticEnginePort,
  roots: readonly { readonly rootUri: string }[], logger: StructuredLogger, signal: AbortSignal): Promise<void> {
  if (!semantic.semanticReadiness) return
  for (const { rootUri } of roots) {
    if (signal.aborted) return
    const started = performance.now()
    logger.info("semantic.initialization.started", { rootUri })
    void connection.sendNotification("arkts/semanticPreparation", { rootUri, phase: "started" })
    while (!signal.aborted) {
      try {
        const report = semantic.initializeProject ? await semantic.initializeProject({ rootUri, signal })
          : await semantic.semanticReadiness({ rootUri, prepare: true, signal })
        if (signal.aborted) return
        logger.info("semantic.initialization.complete", { rootUri, semanticState: report.semanticState,
          durationMs: performance.now() - started, ...processMemoryFields() })
        await connection.sendNotification("arkts/semanticPreparation", { rootUri, phase: "complete", report })
        break
      } catch (error) {
        if (signal.aborted) return
        if ((error as { code?: unknown } | null)?.code === "content-modified") continue
        logger.error("semantic.initialization.failed", { rootUri,
          durationMs: performance.now() - started, message: error instanceof Error ? error.message : String(error) })
        await connection.sendNotification("arkts/semanticPreparation", { rootUri, phase: "failed" })
        break
      }
    }
  }
}
