import type { Connection, TextDocuments } from "vscode-languageserver/node.js"
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticEnginePort } from "../contracts/semantic-engine.js"
import { toLspDiagnostic } from "./diagnostic-mapper.js"

const DIAGNOSTIC_DELAY_MS = 75
const TEST_DIAGNOSTIC_DELAY_MS = Number(process.env.ARKTS_TEST_DIAGNOSTIC_DELAY_MS ?? 0)

interface DiagnosticDependencies {
  connection: Connection
  documents: TextDocuments<TextDocument>
  semantic: SemanticEnginePort
  snapshot(document: TextDocument): DocumentSnapshot
  onWorkspaceRefresh?(workspaceCount: number, documentCount: number): void
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
  refreshWorkspace(workspaceId: string): void
  close(documentUri: string): void
  suspend(): Promise<() => void>
  dispose(): void
}

export function createDocumentDiagnostics({
  connection,
  documents,
  semantic,
  snapshot,
  onWorkspaceRefresh,
}: DiagnosticDependencies): DocumentDiagnostics {
  const pending = new Map<string, PendingDiagnostics>()
  const deferredUris = new Set<string>()
  const workspaceEpochs = new Map<string, number>()
  const dirtyWorkspaces = new Map<string, number>()
  let refreshTimer: NodeJS.Timeout | undefined
  let suspensionCount = 0
  let disposed = false
  let quiescence = Promise.resolve()
  let testDelaySequence = 0

  const cancel = (documentUri: string) => {
    const task = pending.get(documentUri)
    if (!task) return
    clearTimeout(task.timer)
    task.controller.abort(new Error("Diagnostics superseded"))
    pending.delete(documentUri)
    if (!task.started) task.settle()
  }

  const update = (document: TextDocument, delay = DIAGNOSTIC_DELAY_MS) => {
    cancel(document.uri)
    if (disposed) return
    if (suspensionCount > 0) {
      deferredUris.add(document.uri)
      return
    }
    const controller = new AbortController()
    const documentSnapshot = snapshot(document)
    const epoch = workspaceEpochs.get(documentSnapshot.workspaceId) ?? 0
    const isCurrentWorkspace = () => epoch === (workspaceEpochs.get(documentSnapshot.workspaceId) ?? 0)
    let settle = () => {}
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    const timer = setTimeout(async () => {
      const task = pending.get(document.uri)
      if (task?.controller === controller) task.started = true
      try {
        if (!isCurrentWorkspace()) return
        if (Number.isSafeInteger(TEST_DIAGNOSTIC_DELAY_MS)
          && TEST_DIAGNOSTIC_DELAY_MS > 0 && TEST_DIAGNOSTIC_DELAY_MS <= 5_000) {
          const sequence = ++testDelaySequence
          connection.console.log(`diagnostics test delay entered ${document.uri} ${sequence}`)
          await new Promise(resolve => setTimeout(resolve, TEST_DIAGNOSTIC_DELAY_MS))
          connection.console.log(`diagnostics test delay settled ${document.uri} ${sequence}`)
        }
        const result = await semantic.diagnose({
          document: documentSnapshot,
          signal: controller.signal,
        })
        const current = documents.get(document.uri)
        if (
          controller.signal.aborted
          || !isCurrentWorkspace()
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
        const contentModified = error instanceof Error && "code" in error && error.code === "content-modified"
        // A queued workspace refresh already owns this expected invalidation.
        if (contentModified && !isCurrentWorkspace()) return
        const current = documents.get(document.uri)
        if (!controller.signal.aborted && !disposed && isCurrentWorkspace() && current
          && pending.get(document.uri)?.controller === controller
          && contentModified) {
          // Workspace mutations can invalidate a diagnosis without changing this document.
          // Keep the snapshot fence, then schedule a fresh diagnosis through the normal debounce.
          update(current)
        } else if (!controller.signal.aborted) {
          connection.console.error(`ArkTS diagnostics failed: ${errorMessage(error)}`)
        }
      } finally {
        if (pending.get(document.uri)?.controller === controller) pending.delete(document.uri)
        settle()
      }
    }, delay)
    pending.set(document.uri, {
      controller,
      timer,
      started: false,
      settled,
      settle,
    })
  }

  // Coalesce bursts before traversing open documents. This is not a filesystem scan:
  // without compiler dependency facts, the existing workspace is the safe scope.
  const scheduleRefresh = () => {
    if (disposed || suspensionCount > 0 || dirtyWorkspaces.size === 0) return
    clearTimeout(refreshTimer)
    const nextDue = Math.min(...dirtyWorkspaces.values())
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      const now = performance.now()
      const workspaces = new Set<string>()
      for (const [workspaceId, due] of dirtyWorkspaces) {
        if (due > now) continue
        workspaces.add(workspaceId)
        dirtyWorkspaces.delete(workspaceId)
      }
      let documentCount = 0
      for (const document of documents.all()) {
        if (!workspaces.has(snapshot(document).workspaceId)) continue
        documentCount += 1
        update(document, 0)
      }
      if (workspaces.size > 0) onWorkspaceRefresh?.(workspaces.size, documentCount)
      scheduleRefresh()
    }, Math.max(0, nextDue - performance.now()))
  }

  const refreshWorkspace = (workspaceId: string) => {
    if (disposed) return
    // Fence already-running work immediately, not only after the debounce fires.
    workspaceEpochs.set(workspaceId, (workspaceEpochs.get(workspaceId) ?? 0) + 1)
    // Each workspace owns its debounce deadline: edits elsewhere cannot postpone it.
    dirtyWorkspaces.set(workspaceId, performance.now() + DIAGNOSTIC_DELAY_MS)
    scheduleRefresh()
  }

  const close = (documentUri: string) => {
    cancel(documentUri)
    deferredUris.delete(documentUri)
    void connection.sendDiagnostics({ uri: documentUri, diagnostics: [] })
  }

  const suspend = async () => {
    suspensionCount += 1
    clearTimeout(refreshTimer)
    refreshTimer = undefined
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
        if (document && !dirtyWorkspaces.has(snapshot(document).workspaceId)) update(document)
      }
      scheduleRefresh()
    }
  }

  return {
    update,
    refreshWorkspace,
    close,
    suspend,
    dispose: () => {
      disposed = true
      deferredUris.clear()
      dirtyWorkspaces.clear()
      workspaceEpochs.clear()
      clearTimeout(refreshTimer)
      for (const uri of [...pending.keys()]) cancel(uri)
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
