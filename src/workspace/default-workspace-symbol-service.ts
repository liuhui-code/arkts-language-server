import type { WorkspaceCatalogPort } from "../contracts/workspace-catalog.js"
import type {
  DocumentSnapshot,
  DocumentUri,
  WorkspaceDescriptor,
} from "../contracts/document.js"
import type {
  SemanticDocumentSymbol,
  SemanticEnginePort,
} from "../contracts/semantic-engine.js"
import type {
  WorkspaceIndexCompleteness,
  WorkspaceIndexPort,
  WorkspaceSymbol,
  WorkspaceSymbolSearchResult,
} from "../contracts/workspace-index.js"
import type {
  WorkspaceIndexProgress,
  WorkspaceSymbolServicePort,
} from "../contracts/workspace-symbol-service.js"

interface DefaultWorkspaceSymbolServiceDependencies {
  index: WorkspaceIndexPort
  catalog: WorkspaceCatalogPort
  semantic: SemanticEnginePort
  cacheDirectory: string
}

export class DefaultWorkspaceSymbolService implements WorkspaceSymbolServicePort {
  private readonly workspaces = new Map<string, WorkspaceDescriptor>()
  private readonly openDocuments = new Map<DocumentUri, DocumentSnapshot>()
  private readonly searchableWorkspaces = new Set<string>()
  private readonly progress = new Map<string, WorkspaceIndexProgress>()
  private report?: (progress: WorkspaceIndexProgress) => void
  private disposed = false

  constructor(private readonly dependencies: DefaultWorkspaceSymbolServiceDependencies) {}

  start(
    workspaces: readonly WorkspaceDescriptor[],
    report: (progress: WorkspaceIndexProgress) => void,
    signal?: AbortSignal,
  ): void {
    if (this.disposed) return
    this.report = report
    if (workspaces.length === 0) {
      report({ ...emptyProgress("ready"), totalFiles: 0 })
      return
    }
    for (const workspace of workspaces) {
      this.workspaces.set(workspace.id, workspace)
      this.progress.set(workspace.id, emptyProgress("discovering"))
    }
    this.reportAggregate()
    for (const workspace of workspaces) {
      void this.openWorkspace(workspace, signal)
    }
  }

  sync(document: DocumentSnapshot): void {
    if (!this.disposed) this.openDocuments.set(document.uri, document)
  }

  closeDocument(documentUri: DocumentUri): void {
    this.openDocuments.delete(documentUri)
  }

  async searchSymbols(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceSymbolSearchResult> {
    assertActive(signal)

    const snapshots = [...this.openDocuments.values()]
    const openUris = new Set(snapshots.map((document) => document.uri))
    const persistedResults = await raceAbort(Promise.all(
      [...this.searchableWorkspaces].map(async (workspaceId) => {
        try {
          return await this.dependencies.index.searchSymbols(
            workspaceId,
            query,
            limit,
            signal,
            [...openUris],
          )
        } catch (error) {
          assertActive(signal)
          return null
        }
      }),
    ), signal)
    assertActive(signal)

    const overlayResults = await raceAbort(Promise.all(snapshots.map(async (document) => {
      try {
        const result = await this.dependencies.semantic.documentSymbols({ document, signal })
        const current = this.openDocuments.get(document.uri)
        return {
          items: current?.version === document.version && result.documentVersion === document.version
            ? flattenDocumentSymbols(result.value, document.uri)
            : [],
          failed: false,
        }
      } catch (error) {
        assertActive(signal)
        return { items: [], failed: true }
      }
    })), signal)
    assertActive(signal)

    const availablePersisted = persistedResults.filter(isSearchResult)
    const candidates = [
      ...availablePersisted.flatMap((result) => result.items)
        .filter((item) => !openUris.has(item.uri)),
      ...overlayResults.flatMap((result) => result.items),
    ]
    const persistedCompleteness = aggregateCompleteness(
      availablePersisted.map((result) => result.completeness),
      this.workspaces.size,
    )
    return {
      items: rankAndLimit(query, candidates, limit),
      servedGeneration: availablePersisted.length === 0
        ? 0
        : Math.min(...availablePersisted.map((result) => result.servedGeneration)),
      completeness: overlayResults.some((result) => result.failed)
        ? "partial"
        : persistedCompleteness,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.openDocuments.clear()
    const closing = [...this.workspaces].map(([workspaceId]) =>
      this.dependencies.index.close(workspaceId))
    void Promise.allSettled(closing)
  }

  private async openWorkspace(
    workspace: WorkspaceDescriptor,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.dependencies.index.open(workspace, this.dependencies.cacheDirectory)
      if (this.disposed) {
        await this.dependencies.index.close(workspace.id)
        return
      }
      if (signal?.aborted) {
        await this.dependencies.index.close(workspace.id)
      }
      assertActive(signal)
      this.searchableWorkspaces.add(workspace.id)
      void this.runCatalog(workspace, signal)
    } catch (error) {
      this.failWorkspace(workspace.id, signal)
    }
  }

  private async runCatalog(
    workspace: WorkspaceDescriptor,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.dependencies.catalog.start(
        workspace,
        (progress) => {
          if (this.disposed) return
          this.progress.set(workspace.id, progress)
          this.reportAggregate()
        },
        signal,
      )
    } catch (error) {
      this.failWorkspace(workspace.id, signal)
    }
  }

  private failWorkspace(workspaceId: string, signal?: AbortSignal): void {
    if (this.disposed) return
    const phase = signal?.aborted ? "cancelled" : "degraded"
    this.progress.set(workspaceId, {
      ...(this.progress.get(workspaceId) ?? emptyProgress(phase)),
      phase,
    })
    this.reportAggregate()
  }

  private reportAggregate(): void {
    if (!this.report || this.progress.size === 0) return
    this.report(aggregateProgress([...this.progress.values()]))
  }
}

function emptyProgress(phase: WorkspaceIndexProgress["phase"]): WorkspaceIndexProgress {
  return {
    phase,
    discoveredFiles: 0,
    indexedFiles: 0,
    skippedEntries: 0,
  }
}

function aggregateProgress(statuses: readonly WorkspaceIndexProgress[]): WorkspaceIndexProgress {
  const phase = aggregatePhase(statuses.map((status) => status.phase))
  const totalsKnown = statuses.every((status) => status.totalFiles !== undefined)
  return {
    phase,
    discoveredFiles: sum(statuses, (status) => status.discoveredFiles),
    indexedFiles: sum(statuses, (status) => status.indexedFiles),
    skippedEntries: sum(statuses, (status) => status.skippedEntries),
    ...(totalsKnown
      ? { totalFiles: sum(statuses, (status) => status.totalFiles ?? 0) }
      : {}),
  }
}

function aggregatePhase(
  phases: readonly WorkspaceIndexProgress["phase"][],
): WorkspaceIndexProgress["phase"] {
  const terminal = phases.every((phase) =>
    phase === "ready" || phase === "degraded" || phase === "cancelled")
  if (terminal) {
    if (phases.includes("degraded")) return "degraded"
    if (phases.includes("cancelled")) return "cancelled"
    return "ready"
  }
  if (phases.includes("discovering")) return "discovering"
  return "indexing"
}

function sum(
  statuses: readonly WorkspaceIndexProgress[],
  select: (status: WorkspaceIndexProgress) => number,
): number {
  return statuses.reduce((total, status) => total + select(status), 0)
}

function flattenDocumentSymbols(
  symbols: readonly SemanticDocumentSymbol[],
  uri: DocumentUri,
  containerName?: string,
): WorkspaceSymbol[] {
  return symbols.flatMap((symbol) => [{
    name: symbol.name,
    kind: symbol.kind,
    uri,
    range: symbol.selectionRange,
    ...(containerName ? { containerName } : {}),
  }, ...flattenDocumentSymbols(symbol.children ?? [], uri, symbol.name)])
}

function rankAndLimit(
  query: string,
  symbols: readonly WorkspaceSymbol[],
  limit: number,
): WorkspaceSymbol[] {
  const foldedQuery = query.toLowerCase()
  const unique = new Map<string, { rank: number; symbol: WorkspaceSymbol }>()
  for (const symbol of symbols) {
    const rank = matchRank(symbol.name, foldedQuery)
    if (rank === undefined) continue
    const key = [
      symbol.uri,
      symbol.name,
      symbol.kind,
      symbol.range.start.line,
      symbol.range.start.character,
    ].join("\0")
    const existing = unique.get(key)
    if (!existing || rank < existing.rank) unique.set(key, { rank, symbol })
  }
  return [...unique.values()]
    .sort((left, right) =>
      left.rank - right.rank
      || left.symbol.name.toLowerCase().localeCompare(right.symbol.name.toLowerCase())
      || left.symbol.uri.localeCompare(right.symbol.uri)
      || left.symbol.range.start.line - right.symbol.range.start.line
      || left.symbol.range.start.character - right.symbol.range.start.character)
    .slice(0, Math.max(0, limit))
    .map(({ symbol }) => symbol)
}

function matchRank(name: string, query: string): number | undefined {
  const foldedName = name.toLowerCase()
  if (foldedName === query) return 0
  if (foldedName.startsWith(query)) return 1
  if (acronym(name).startsWith(query)) return 2
  return foldedName.includes(query) ? 3 : undefined
}

function acronym(name: string): string {
  return [...name]
    .filter((character, index) =>
      index === 0
      || (character.toUpperCase() === character && character.toLowerCase() !== character))
    .join("")
    .toLowerCase()
}

function aggregateCompleteness(
  completeness: readonly WorkspaceIndexCompleteness[],
  expected: number,
): WorkspaceIndexCompleteness {
  if (completeness.length < expected || completeness.includes("partial")) return "partial"
  return completeness.includes("stale") ? "stale" : "ready"
}

function isSearchResult(
  result: WorkspaceSymbolSearchResult | null,
): result is WorkspaceSymbolSearchResult {
  return result !== null
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(abortReason(signal))
    signal.addEventListener("abort", aborted, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", aborted)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", aborted)
        reject(error)
      },
    )
  })
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal)
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Workspace request cancelled")
}
