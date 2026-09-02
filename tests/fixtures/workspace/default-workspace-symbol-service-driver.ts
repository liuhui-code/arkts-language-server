import type {
  DocumentSnapshot,
  DocumentUri,
  WorkspaceDescriptor,
} from "../../../src/contracts/document.js"
import type {
  SemanticDocumentQuery,
  SemanticDocumentSymbol,
  SemanticEnginePort,
  SemanticQuery,
  VersionedSemanticResult,
} from "../../../src/contracts/semantic-engine.js"
import type { WorkspaceIndexProgress } from "../../../src/contracts/workspace-symbol-service.js"
import type {
  WorkspaceIndexStatus,
  WorkspaceSymbolSearchResult,
} from "../../../src/contracts/workspace-index.js"
import { DefaultWorkspaceSymbolService } from "../../../src/workspace/default-workspace-symbol-service.js"

const fastWorkspace = workspace("file:///FastRoot")
const slowWorkspace = workspace("file:///SlowRoot")
const failedWorkspace = workspace("file:///FailedRoot")
const failedCatalogWorkspace = workspace("file:///CatalogFailRoot")
const overlayUri = "file:///FastRoot/Open.ets"

export async function searchDoesNotWaitForAnUnopenedRoot() {
  const fixture = createFixture()
  fixture.service.start([fastWorkspace, slowWorkspace], () => {})
  fixture.service.sync(document(overlayUri, "class OverlayResult {}"))
  await tick()

  const startedAt = performance.now()
  const result = await fixture.service.searchSymbols("OverlayResult", 10)
  const durationMs = performance.now() - startedAt
  fixture.service.dispose()
  return { durationMs, names: result.items.map((item) => item.name) }
}

export async function cancellationDoesNotWaitForAnIgnoringProvider() {
  const fixture = createFixture()
  fixture.service.start([fastWorkspace], () => {})
  await tick()
  const controller = new AbortController()
  const startedAt = performance.now()
  const pending = fixture.service.searchSymbols("IGNORE_CANCEL", 10, controller.signal)
  setTimeout(() => controller.abort(), 10)
  try {
    await pending
    return { durationMs: performance.now() - startedAt, rejected: false }
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      rejected: true,
      name: error instanceof Error ? error.name : "unknown",
    }
  } finally {
    fixture.service.dispose()
  }
}

export async function cancellationDoesNotWaitForAnIgnoringOverlayProvider() {
  const fixture = createFixture()
  fixture.service.start([fastWorkspace], () => {})
  fixture.service.sync(document(overlayUri, "class OverlayResult {} // IGNORE_CANCEL_OVERLAY"))
  await tick()
  const controller = new AbortController()
  const startedAt = performance.now()
  const pending = fixture.service.searchSymbols("OverlayResult", 10, controller.signal)
  setTimeout(() => controller.abort(), 10)
  try {
    await pending
    return { durationMs: performance.now() - startedAt, rejected: false }
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      rejected: true,
      name: error instanceof Error ? error.name : "unknown",
    }
  } finally {
    fixture.service.dispose()
  }
}

export async function disposeClosesAnIndexThatFinishesOpeningLate() {
  const fixture = createFixture()
  fixture.service.start([slowWorkspace], () => {})
  await delay(20)
  fixture.service.dispose()
  await delay(800)
  return { closeCount: fixture.index.closeCount(slowWorkspace.id) }
}

export async function cancellationClosesAnIndexThatFinishesOpeningLate() {
  const fixture = createFixture()
  const controller = new AbortController()
  fixture.service.start([slowWorkspace], () => {}, controller.signal)
  await delay(20)
  controller.abort()
  await delay(800)
  return { closeCount: fixture.index.closeCount(slowWorkspace.id) }
}

export async function failedRootsKeepResultsPartial() {
  const fixture = createFixture()
  fixture.service.start([fastWorkspace, failedWorkspace], () => {})
  await tick()
  const result = await fixture.service.searchSymbols("PersistedResult", 10)
  fixture.service.dispose()
  return { completeness: result.completeness, names: result.items.map((item) => item.name) }
}

export async function failedOverlayExtractionKeepsResultsPartial() {
  const fixture = createFixture()
  fixture.service.start([fastWorkspace], () => {})
  fixture.service.sync(document(overlayUri, "BROKEN_OVERLAY"))
  await tick()
  const result = await fixture.service.searchSymbols("PersistedResult", 10)
  fixture.service.dispose()
  return { completeness: result.completeness, names: result.items.map((item) => item.name) }
}

export function anEmptyWorkspaceSetTerminatesProgress() {
  const fixture = createFixture()
  const reports: WorkspaceIndexProgress[] = []
  fixture.service.start([], (progress) => reports.push(progress))
  fixture.service.dispose()
  return reports
}

export async function catalogFailurePreservesObservedProgress() {
  const fixture = createFixture()
  const reports: WorkspaceIndexProgress[] = []
  fixture.service.start([failedCatalogWorkspace], (progress) => reports.push(progress))
  await tick()
  fixture.service.dispose()
  return reports.at(-1)
}

export async function openDocumentUrisAreExcludedBeforeTheIndexLimit() {
  const fixture = createFixture()
  fixture.service.start([fastWorkspace], () => {})
  fixture.service.sync(document(overlayUri, "class UnrelatedOverlay {}"))
  await tick()
  const result = await fixture.service.searchSymbols("Target", 1)
  fixture.service.dispose()
  return {
    names: result.items.map((item) => item.name),
    excludedUris: fixture.index.lastExcludedUris,
  }
}

function createFixture() {
  const index = new ScenarioWorkspaceIndex()
  const semantic = new ScenarioSemanticEngine()
  return {
    index,
    service: new DefaultWorkspaceSymbolService({
      index,
      catalog: new ImmediateCatalog(),
      semantic,
      cacheDirectory: "/tmp/arkts-language-server-service-test",
    }),
  }
}

class ScenarioWorkspaceIndex {
  private readonly closes = new Map<string, number>()
  lastExcludedUris: readonly DocumentUri[] = []

  async open(workspace: WorkspaceDescriptor): Promise<WorkspaceIndexStatus> {
    if (workspace.id === slowWorkspace.id) await delay(750)
    if (workspace.id === failedWorkspace.id) throw new Error("scripted open failure")
    return { state: "ready", committedGeneration: 7 }
  }

  async refresh(): Promise<WorkspaceIndexStatus> {
    return { state: "ready", committedGeneration: 8 }
  }

  async searchSymbols(
    workspaceId: string,
    query: string,
    limit: number,
    _signal?: AbortSignal,
    excludedUris: readonly DocumentUri[] = [],
  ): Promise<WorkspaceSymbolSearchResult> {
    if (query === "IGNORE_CANCEL") await delay(750)
    this.lastExcludedUris = excludedUris
    const candidates = query === "Target"
      ? [symbol("TargetStale", overlayUri), symbol("TargetValid", `${workspaceId}/Valid.ets`)]
      : [symbol("PersistedResult", `${workspaceId}/Persisted.ets`)]
    return {
      items: candidates.filter((item) => !excludedUris.includes(item.uri)).slice(0, limit),
      servedGeneration: 7,
      completeness: "ready",
    }
  }

  async status(): Promise<WorkspaceIndexStatus> {
    return { state: "ready", committedGeneration: 7 }
  }

  async close(workspaceId: string): Promise<void> {
    this.closes.set(workspaceId, (this.closes.get(workspaceId) ?? 0) + 1)
  }

  closeCount(workspaceId: string): number {
    return this.closes.get(workspaceId) ?? 0
  }
}

class ImmediateCatalog {
  async start(
    workspace: WorkspaceDescriptor,
    report: (progress: WorkspaceIndexProgress) => void,
  ): Promise<void> {
    if (workspace.id === failedCatalogWorkspace.id) {
      report({
        phase: "indexing",
        discoveredFiles: 3,
        indexedFiles: 1,
        skippedEntries: 2,
        totalFiles: 3,
      })
      throw new Error("scripted catalog failure")
    }
    report({
      phase: "ready",
      discoveredFiles: 1,
      indexedFiles: 1,
      skippedEntries: 0,
      totalFiles: 1,
    })
  }
}

class ScenarioSemanticEngine implements SemanticEnginePort {
  sync(_document: DocumentSnapshot): void {}
  close(_documentUri: DocumentUri): void {}

  async complete(query: SemanticQuery): Promise<VersionedSemanticResult<never[]>> {
    return versioned(query, [])
  }

  async define(query: SemanticQuery): Promise<VersionedSemanticResult<never[]>> {
    return versioned(query, [])
  }

  async hover(query: SemanticQuery): Promise<VersionedSemanticResult<null>> {
    return versioned(query, null)
  }

  async signatureHelp(query: SemanticQuery): Promise<VersionedSemanticResult<null>> {
    return versioned(query, null)
  }

  async diagnose(query: SemanticDocumentQuery): Promise<VersionedSemanticResult<never[]>> {
    return versioned(query, [])
  }

  async documentSymbols(
    query: SemanticDocumentQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentSymbol[]>> {
    if (query.document.text === "BROKEN_OVERLAY") throw new Error("scripted parse failure")
    if (query.document.text.includes("IGNORE_CANCEL_OVERLAY")) await delay(750)
    const name = /class\s+([A-Za-z_$][\w$]*)/.exec(query.document.text)?.[1] ?? "Overlay"
    return versioned(query, [{
      name,
      kind: "class",
      range: zeroRange(),
      selectionRange: zeroRange(),
    }])
  }

  dispose(): void {}
}

function versioned<T>(
  query: SemanticDocumentQuery,
  value: T,
): Promise<VersionedSemanticResult<T>> {
  return Promise.resolve({ documentVersion: query.document.version, value })
}

function workspace(rootUri: string): WorkspaceDescriptor {
  return { id: rootUri, rootUri }
}

function document(uri: DocumentUri, text: string): DocumentSnapshot {
  return { uri, version: 1, text, workspaceId: fastWorkspace.id }
}

function symbol(name: string, uri: DocumentUri) {
  return { name, kind: "class", uri, range: zeroRange() }
}

function zeroRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}

function tick(): Promise<void> {
  return delay(0)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
