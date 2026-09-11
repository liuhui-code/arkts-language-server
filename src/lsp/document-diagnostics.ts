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
  started: boolean
  settled: Promise<void>
  settle(): void
}

export interface DocumentDiagnostics {
  update(document: TextDocument): void
  close(documentUri: string): void
  suspend(): Promise<() => void>
  dispose(): void
}

export function createDocumentDiagnostics({
  connection,
  documents,
  semantic,
  snapshot,
}: DiagnosticDependencies): DocumentDiagnostics {
  const pending = new Map<string, PendingDiagnostics>()
  const deferredUris = new Set<string>()
  let suspensionCount = 0
  let disposed = false
  let quiescence = Promise.resolve()

  const cancel = (documentUri: string) => {
    const task = pending.get(documentUri)
    if (!task) return
    clearTimeout(task.timer)
    task.controller.abort(new Error("Diagnostics superseded"))
    pending.delete(documentUri)
    if (!task.started) task.settle()
  }

  const update = (document: TextDocument) => {
    cancel(document.uri)
    if (disposed) return
    if (suspensionCount > 0) {
      deferredUris.add(document.uri)
      return
    }
    const controller = new AbortController()
    const documentSnapshot = snapshot(document)
    let settle = () => {}
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    const timer = setTimeout(async () => {
      const task = pending.get(document.uri)
      if (task?.controller === controller) task.started = true
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
        settle()
      }
    }, DIAGNOSTIC_DELAY_MS)
    pending.set(document.uri, {
      controller,
      timer,
      started: false,
      settled,
      settle,
    })
  }

  const close = (documentUri: string) => {
    cancel(documentUri)
    deferredUris.delete(documentUri)
    void connection.sendDiagnostics({ uri: documentUri, diagnostics: [] })
  }

  const suspend = async () => {
    suspensionCount += 1
    const settling: Promise<void>[] = []
    for (const [documentUri, task] of pending) {
      deferredUris.add(documentUri)
      settling.push(task.settled)
      cancel(documentUri)
    }
    quiescence = Promise.all([quiescence, ...settling]).then(() => {})
    await quiescence
    let released = false
    return () => {
      if (released) return
      released = true
      suspensionCount -= 1
      if (disposed || suspensionCount > 0) return
      const uris = [...deferredUris]
      deferredUris.clear()
      for (const uri of uris) {
        const document = documents.get(uri)
        if (document) update(document)
      }
    }
  }

  return {
    update,
    close,
    suspend,
    dispose: () => {
      disposed = true
      deferredUris.clear()
      for (const uri of [...pending.keys()]) cancel(uri)
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
