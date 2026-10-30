import type { Connection } from "vscode-languageserver/node.js"
import type { WorkspaceIndexProgress, WorkspaceSymbolServicePort } from "../contracts/workspace-symbol-service.js"
import type { StructuredLogger } from "../observability/logger.js"

/** Workspace catalog progress is independent of semantic initialization. */
export async function startWorkspaceIndex(connection: Connection, workspaceSymbols: WorkspaceSymbolServicePort,
  workspaceRoots: { id: string; rootUri: string }[], logger: StructuredLogger,
  shuttingDown: () => boolean): Promise<AbortController | undefined> {
  const progress = await connection.window.createWorkDoneProgress()
  if (shuttingDown()) return
  const workspaceIndexAbort = new AbortController()
  const cancellation = progress.token.onCancellationRequested(() => {
    workspaceIndexAbort?.abort(new Error("Workspace indexing cancelled by client"))
  })
  let lastStorageLog = 0
  let lastStorageStage: string | undefined
  let finished = false
  progress.begin("ArkTS workspace index", undefined, "Discovering project files", true)
  const report = (status: WorkspaceIndexProgress) => {
    if (finished) return
    if (status.phase === "discovering") {
      if (status.discoveredFiles > 0) {
        progress.report(discoveryMessage(status))
      }
      return
    }
    if (status.phase === "indexing") {
      if (status.storage) {
        const storage = status.storage
        const stage = ["writing", "committing", "checkpointing"].includes(storage.stage) ? "persisting" : storage.stage
        const now = Date.now()
        if (stage !== lastStorageStage || now - lastStorageLog >= 10_000) {
          logger.info("index.catalog.storage", { ...storage, workspaceCount: workspaceRoots.length })
          lastStorageLog = now
          lastStorageStage = stage
        }
      }
      progress.report(status.storage ? storageMessage(status) : indexingMessage(status))
      return
    }
    if (status.phase === "ready") {
      progress.report(100, readyMessage(status))
    } else if (status.phase === "degraded") {
      progress.report(degradedMessage(status))
    } else {
      progress.report(cancelledMessage(status))
    }
    logger.info("index.catalog.terminal", {
      phase: status.phase,
      workspaceCount: workspaceRoots.length,
      discoveredFiles: status.discoveredFiles,
      indexedFiles: status.indexedFiles,
      skippedEntries: status.skippedEntries,
      totalFiles: status.totalFiles,
      storageStage: status.storage?.stage,
      storageStageElapsedMs: status.storage?.stageElapsedMs,
      persistedFiles: status.storage?.writtenDocuments,
      persistedRows: status.storage?.writtenRows,
    })
    finished = true
    cancellation.dispose()
    progress.done()
  }
  try {
    workspaceSymbols.start(workspaceRoots, report, workspaceIndexAbort.signal)
  } catch {
    logger.error("index.start.failed", { outcome: "degraded" })
    report({
      phase: "degraded",
      discoveredFiles: 0,
      indexedFiles: 0,
      skippedEntries: 0,
    })
  }
  return workspaceIndexAbort
}

function storageMessage(status: WorkspaceIndexProgress): string {
  const storage = status.storage!
  const labels = { writing: "Writing index", committing: "Committing index", checkpointing: "Saving index",
    validating: "Validating index", checking: "Checking project files", publishing: "Publishing index",
    reusing: "Reusing unchanged index" }
  const elapsed = Math.floor(storage.stageElapsedMs / 1000)
  const count = storage.stage === "reusing" ? `; ${status.indexedFiles} files unchanged`
    : ["writing", "committing", "checkpointing"].includes(storage.stage)
      ? `; ${storage.writtenDocuments}/${status.indexedFiles} files saved` : ""
  return `${labels[storage.stage]}${count}; ${elapsed}s elapsed`
}

function discoveryMessage(status: WorkspaceIndexProgress): string {
  return `Discovered ${status.discoveredFiles} files; skipped ${status.skippedEntries} entries`
}

function indexingMessage(status: WorkspaceIndexProgress): string {
  const total = status.totalFiles === undefined ? "?" : String(status.totalFiles)
  return `Indexing ${status.indexedFiles}/${total} files; skipped ${status.skippedEntries} entries`
}

function readyMessage(status: WorkspaceIndexProgress): string {
  const total = status.totalFiles ?? status.discoveredFiles
  return total === 0
    ? `No ArkTS files found; skipped ${status.skippedEntries} entries`
    : `Indexed ${status.indexedFiles}/${total} files; skipped ${status.skippedEntries} entries`
}

function degradedMessage(status: WorkspaceIndexProgress): string {
  return `Indexing degraded after ${status.indexedFiles} files; skipped ${status.skippedEntries} entries`
}

function cancelledMessage(status: WorkspaceIndexProgress): string {
  return `Indexing cancelled after ${status.indexedFiles} files; skipped ${status.skippedEntries} entries`
}
