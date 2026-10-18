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
  let finished = false
  let lastPercentage = 0
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
      const percentage = indexPercentage(status)
      const message = indexingMessage(status)
      if (percentage === undefined) {
        progress.report(message)
      } else {
        lastPercentage = Math.max(lastPercentage, percentage)
        progress.report(lastPercentage, message)
      }
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

function indexPercentage(status: WorkspaceIndexProgress): number | undefined {
  if (!status.totalFiles || status.indexedFiles <= 0) return undefined
  return Math.min(99, Math.max(1, Math.floor(status.indexedFiles * 100 / status.totalFiles)))
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
