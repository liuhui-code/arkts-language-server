import type { Connection, TextDocuments } from "vscode-languageserver/node.js"
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticEnginePort } from "../contracts/semantic-engine.js"
import { toLspDiagnostic } from "./diagnostic-mapper.js"

const DIAGNOSTIC_DELAY_MS = 75

interface DiagnosticDependencies {
  connection: Connection
  documents: TextDocuments<TextDocument>
  semantic: SemanticEnginePort
  snapshot(document: TextDocument): DocumentSnapshot
}

interface PendingDiagnostics {
  controller: AbortController
  timer: NodeJS.Timeout
}

export interface DocumentDiagnostics {
  update(document: TextDocument): void
  close(documentUri: string): void
  dispose(): void
}

export function createDocumentDiagnostics({
  connection,
  documents,
  semantic,
  snapshot,
}: DiagnosticDependencies): DocumentDiagnostics {
  const pending = new Map<string, PendingDiagnostics>()

  const cancel = (documentUri: string) => {
    const task = pending.get(documentUri)
    if (!task) return
    clearTimeout(task.timer)
    task.controller.abort(new Error("Diagnostics superseded"))
    pending.delete(documentUri)
  }

  const update = (document: TextDocument) => {
    cancel(document.uri)
    const controller = new AbortController()
    const documentSnapshot = snapshot(document)
    const timer = setTimeout(async () => {
      try {
        const result = await semantic.diagnose({
          document: documentSnapshot,
          signal: controller.signal,
        })
        const current = documents.get(document.uri)
        if (
          controller.signal.aborted
          || pending.get(document.uri)?.controller !== controller
          || current?.version !== documentSnapshot.version
          || result.documentVersion !== documentSnapshot.version
        ) return
        await connection.sendDiagnostics({
          uri: document.uri,
          version: documentSnapshot.version,
          diagnostics: result.value.map(toLspDiagnostic),
        })
      } catch (error) {
        if (!controller.signal.aborted) {
          connection.console.error(`ArkTS diagnostics failed: ${errorMessage(error)}`)
        }
      } finally {
        if (pending.get(document.uri)?.controller === controller) pending.delete(document.uri)
      }
    }, DIAGNOSTIC_DELAY_MS)
    pending.set(document.uri, { controller, timer })
  }

  const close = (documentUri: string) => {
    cancel(documentUri)
    void connection.sendDiagnostics({ uri: documentUri, diagnostics: [] })
  }

  return {
    update,
    close,
    dispose: () => {
      for (const uri of [...pending.keys()]) cancel(uri)
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
