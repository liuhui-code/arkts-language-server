import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"

import type { DocumentSnapshot } from "../../../src/contracts/document.js"
import type {
  SemanticCallHierarchyPrepareOutcome,
  SemanticCallHierarchyItemQuery,
  SemanticCallHierarchyIncomingOutcome,
  SemanticCallHierarchyOutgoingOutcome,
  SemanticCodeActionQuery,
  SemanticCodeActionResolveQuery,
  SemanticDocumentQuery,
  SemanticDocumentFormattingQuery,
  SemanticDocumentHighlight,
  SemanticDocumentSymbol,
  SemanticDocumentTextEdit,
  SemanticEnginePort,
  SemanticHover,
  SemanticInlayHint,
  SemanticInlayHintQuery,
  SemanticCompletionResolveQuery,
  SemanticQuery,
  SemanticReferencesOutcome,
  SemanticReferencesQuery,
  SemanticPrepareRenameOutcome,
  SemanticRenameOutcome,
  SemanticRenameQuery,
  SemanticResolvedCodeAction,
  SemanticSignatureHelp,
  SemanticSignatureHelpQuery,
  VersionedSemanticResult,
  SemanticCompletion,
  SemanticDefinition,
  SemanticFoldingRange,
  SemanticFoldingRangeQuery,
  SemanticWorkspaceFileChangeBatch,
} from "../../../src/contracts/semantic-engine.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"
import { DefaultWorkspaceSymbolService } from "../../../src/workspace/default-workspace-symbol-service.js"

class ScriptedSemanticEngine implements SemanticEnginePort {
  private completionCount = 0
  private readonly resistantCallHierarchyResolvers = new Map<string, Set<() => void>>()
  private readonly resistantCodeActionResolvers = new Map<string, () => void>()
  private readonly resistantRenameResolvers = new Map<string, () => void>()
  private readonly workspaceMutationResolvers = new Map<string, Set<() => void>>()
  private readonly documentWorkspaces = new Map<string, string>()

  sync(document: DocumentSnapshot): void {
    this.documentWorkspaces.set(document.uri, document.workspaceId)
    this.releaseResistantCallHierarchy(document.uri)
    this.releaseResistantRename(document.uri)
    this.releaseWorkspaceMutation(
      document.workspaceId,
      `${document.uri}@${document.version}`,
      document.text.includes("WORKSPACE_MUTATION_PROBE"),
    )
  }

  close(documentUri: string): void {
    this.releaseResistantCallHierarchy(documentUri)
    this.releaseResistantRename(documentUri)
    const workspaceId = this.documentWorkspaces.get(documentUri)
    if (workspaceId) this.releaseWorkspaceMutation(workspaceId, `${documentUri}@close`)
    this.documentWorkspaces.delete(documentUri)
  }

  workspaceFilesChanged(batches: readonly SemanticWorkspaceFileChangeBatch[]): void {
    for (const batch of batches) {
      this.releaseWorkspaceMutation(batch.rootUri, batch.rootUri)
    }
  }

  async complete(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion[]>> {
    this.completionCount += 1
    if (query.document.text.includes("RELEASE_WORKSPACE_GLOBAL_BARRIER")) {
      this.releaseWorkspaceMutation(
        query.document.workspaceId,
        `semantic-release:${query.document.uri}`,
      )
    }
    await this.waitForWorkspaceMutation(
      query,
      "completion",
      "WORKSPACE_MUTATION_RELEASES_COMPLETION",
    )
    if (
      query.document.text.includes("FIRST_WAITS_FOR_ABORT")
      && this.completionCount === 1
    ) {
      return waitForAbort(query.signal)
    }
    const bulkCompletion = /COMPLETION_RESULT_(\d+)/u.exec(query.document.text)
    if (bulkCompletion) {
      const completionCount = Number.parseInt(bulkCompletion[1] ?? "0", 10)
      return {
        documentVersion: query.document.version,
        value: Array.from({ length: completionCount }, (_, index) => ({
          label: `bulk-${String(index).padStart(3, "0")}`,
          detail: `Scripted bulk completion ${index}`,
          kind: "property",
        })),
      }
    }
    if (query.document.text.includes("DELAY_IGNORING_ABORT")) {
      query.signal?.addEventListener(
        "abort",
        () => process.stderr.write("SCRIPTED_STALE_ABORT\n"),
        { once: true },
      )
      await new Promise((resolve) => setTimeout(resolve, 150))
      return {
        documentVersion: query.document.version,
        value: [{
          label: `stale-v${query.document.version}`,
          detail: "Delayed scripted completion",
          kind: "property",
        }],
      }
    }
    console.log(`scripted completion v${query.document.version}`)
    return {
      documentVersion: query.document.version,
      value: [{
        label: `fixture-v${query.document.version}`,
        detail: "Scripted semantic completion",
        kind: "property",
      }],
    }
  }

  async resolveCompletion(
    query: SemanticCompletionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion>> {
    if (query.document.text.includes("RESOLVE_WAITS_FOR_ABORT")) {
      return waitForAbortValue(query.signal)
    }
    return scriptedSemanticResult(query, {
      ...query.completion,
      detail: "Resolved scripted semantic completion",
      documentation: "Scripted completion documentation.",
    })
  }

  async codeActions(query: SemanticCodeActionQuery) {
    return scriptedSemanticResult(query, [{
      title: "Replace scripted typo",
      kind: "quickfix" as const,
      diagnostic: {
        range: zeroRange(),
        severity: "error" as const,
        code: 2552,
        message: "Scripted spelling diagnostic",
        source: "arkts" as const,
      },
      fingerprint: "scripted-code-action-v1",
    }])
  }

  async resolveCodeAction(
    query: SemanticCodeActionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticResolvedCodeAction | null>> {
    if (query.document.text.includes("CODE_ACTION_RESOLVE_WAITS_FOR_ABORT")) {
      console.log("scripted code-action resolve entered")
      return waitForAbortValue(query.signal)
    }
    if (query.document.text.includes("CODE_ACTION_RESOLVE_IGNORES_ABORT")) {
      const releasePrevious = this.resistantCodeActionResolvers.get(query.document.uri)
      if (releasePrevious) {
        this.resistantCodeActionResolvers.delete(query.document.uri)
        releasePrevious()
      } else {
        console.log("scripted resistant resolve entered")
        await new Promise<void>((resolve) => {
          this.resistantCodeActionResolvers.set(query.document.uri, resolve)
        })
      }
    }
    return scriptedSemanticResult(query, {
      ...query.action,
      edits: [{
        uri: query.document.uri,
        range: query.action.diagnostic.range,
        newText: "fixed",
        expectedVersion: query.document.version,
      }],
    })
  }

  async define(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    return scriptedSemanticResult(query, [{
      uri: query.document.uri,
      range: zeroRange(),
    }])
  }

  async typeDefinitions(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    return scriptedSemanticResult(query, [{
      uri: query.document.uri,
      range: zeroRange(),
    }])
  }

  async implementations(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    return scriptedSemanticResult(query, [{
      uri: query.document.uri,
      range: zeroRange(),
    }])
  }

  async references(
    query: SemanticReferencesQuery,
  ): Promise<VersionedSemanticResult<SemanticReferencesOutcome>> {
    await this.waitForWorkspaceMutation(query, "references")
    return scriptedSemanticResult(query, {
      status: "complete",
      references: query.document.text.includes("WORKSPACE_GLOBAL_IGNORES_ABORT")
        ? [{ uri: query.document.uri, range: zeroRange() }]
        : [],
    })
  }

  async prepareRename(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticPrepareRenameOutcome>> {
    await this.waitForWorkspaceMutation(query, "prepareRename")
    if (query.document.text.includes("RENAME_WAITS_FOR_ABORT")) {
      console.log("scripted prepare-rename wait entered")
      return waitForAbortValue(query.signal)
    }
    if (query.document.text.includes("RENAME_INCOMPLETE")) {
      return scriptedSemanticResult(query, {
        status: "incomplete",
        reason: "project-membership-incomplete",
      })
    }
    if (query.document.text.includes("RENAME_UNAVAILABLE")) {
      return scriptedSemanticResult(query, { status: "unavailable" })
    }
    return scriptedSemanticResult(query, {
      status: "ready",
      range: zeroRange(),
      placeholder: "ScriptedName",
    })
  }

  async rename(
    query: SemanticRenameQuery,
  ): Promise<VersionedSemanticResult<SemanticRenameOutcome>> {
    await this.waitForWorkspaceMutation(query, "rename")
    if (query.document.text.includes("RENAME_WAITS_FOR_ABORT")) {
      console.log("scripted rename wait entered")
      return waitForAbortValue(query.signal)
    }
    if (query.document.text.includes("RENAME_IGNORES_ABORT")) {
      await new Promise<void>((resolve) => {
        this.resistantRenameResolvers.set(query.document.uri, resolve)
        console.log("scripted resistant rename entered")
      })
    }
    if (query.newName === "not valid") {
      return scriptedSemanticResult(query, { status: "invalid-name" })
    }
    if (query.document.text.includes("RENAME_INCOMPLETE")) {
      return scriptedSemanticResult(query, {
        status: "incomplete",
        reason: "source-unavailable",
      })
    }
    if (query.document.text.includes("RENAME_UNAVAILABLE")) {
      return scriptedSemanticResult(query, { status: "unavailable" })
    }
    return scriptedSemanticResult(query, {
      status: "complete",
      edits: [{
        uri: query.document.uri,
        range: zeroRange(),
        newText: query.newName,
        expectedVersion: query.document.version,
      }],
    })
  }

  async diagnose(query: { document: DocumentSnapshot }) {
    return { documentVersion: query.document.version, value: [] }
  }

  async hover(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticHover | null>> {
    return scriptedSemanticResult(query, {
      signature: "struct Scripted",
      range: zeroRange(),
    })
  }

  async signatureHelp(
    query: SemanticSignatureHelpQuery,
  ): Promise<VersionedSemanticResult<SemanticSignatureHelp | null>> {
    const triggerCharacter = "triggerCharacter" in query.triggerReason
      ? `:${query.triggerReason.triggerCharacter ?? ""}`
      : ""
    return scriptedSemanticResult(query, {
      signatures: [{
        label: `scripted ${query.triggerReason.kind}${triggerCharacter}`,
        parameters: [{ label: "value" }],
      }],
      activeSignature: 0,
      activeParameter: 0,
    })
  }

  async documentSymbols(
    query: SemanticDocumentQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentSymbol[]>> {
    if (query.document.text.includes("WORKSPACE_SYMBOL_KIND_FIXTURE")) {
      const kinds = [
        "class",
        "interface",
        "enum",
        "enumMember",
        "function",
        "method",
        "property",
        "constructor",
        "module",
        "type",
        "variable",
        "struct",
      ] satisfies SemanticDocumentSymbol["kind"][]
      return scriptedSemanticResult(query, kinds.map((kind) => ({
        name: `W2Symbol${kind}`,
        kind,
        range: zeroRange(),
        selectionRange: zeroRange(),
      })))
    }
    const declaration = /\b(struct|class)\s+([A-Za-z_$][\w$]*)/.exec(query.document.text)
    return scriptedSemanticResult(query, [{
      name: declaration?.[2] ?? "Scripted",
      kind: declaration?.[1] === "class" ? "class" : "struct",
      range: zeroRange(),
      selectionRange: zeroRange(),
    }])
  }

  async documentHighlights(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentHighlight[]>> {
    return scriptedSemanticResult(query, [])
  }

  async inlayHints(
    query: SemanticInlayHintQuery,
  ): Promise<VersionedSemanticResult<SemanticInlayHint[]>> {
    if (query.document.text.includes("INLAY_HINT_COUNT_BUDGET")) {
      const hints = Array.from({ length: 1_001 }, (_, index): SemanticInlayHint => {
        const line = 1_000 - index
        return {
          position: { line, character: line % 3 },
          label: `hint-${String(line).padStart(4, "0")}`,
          kind: line % 2 === 0 ? "type" : "parameter",
          paddingLeft: line % 5 === 0 || undefined,
        }
      })
      return scriptedSemanticResult(query, [...hints, hints[500], hints[0]])
    }
    if (query.document.text.includes("INLAY_HINT_BYTE_BUDGET")) {
      return scriptedSemanticResult(query, Array.from(
        { length: 400 },
        (_, index): SemanticInlayHint => {
          const line = 399 - index
          return {
            position: { line, character: 0 },
            label: `${String(line).padStart(3, "0")}:${"x".repeat(1_024)}`,
            kind: "type",
          }
        },
      ))
    }
    if (query.document.text.includes("INLAY_HINT_INVALID_ITEMS")) {
      return scriptedSemanticResult(query, [
        {
          position: { line: 1, character: 2 },
          label: "valid:",
          kind: "parameter",
          paddingRight: true,
        },
        {
          position: { line: 1, character: 3 },
          label: "unknown:",
          kind: "enum",
        } as unknown as SemanticInlayHint,
        {
          position: { line: -1, character: 0 },
          label: "negative:",
          kind: "type",
        },
        {
          position: { line: 1, character: 4 },
          label: "",
          kind: "type",
        },
      ])
    }
    return scriptedSemanticResult(query, [])
  }

  async prepareCallHierarchy(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCallHierarchyPrepareOutcome>> {
    if (query.document.text.includes("CALL_HIERARCHY_WAITS_FOR_ABORT")) {
      console.log(`scripted call-hierarchy prepare entered ${query.document.uri}`)
      return waitForAbortValue(query.signal)
    }
    if (query.document.text.includes("CALL_HIERARCHY_IGNORES_ABORT")) {
      await this.waitForResistantCallHierarchy(query.document.uri, "prepare")
    }
    return scriptedSemanticResult(query, {
      status: "complete",
      items: [scriptedCallHierarchyItem(query.document.uri, query.document.text)],
    })
  }

  async outgoingCalls(
    query: SemanticCallHierarchyItemQuery,
  ): Promise<SemanticCallHierarchyOutgoingOutcome> {
    if (callHierarchySourceText(query).includes("CALL_HIERARCHY_WAITS_FOR_ABORT")) {
      console.log(`scripted call-hierarchy outgoing entered ${query.item.uri}`)
      return waitForAbortResult(query.signal)
    }
    const sourceText = callHierarchySourceText(query)
    if (sourceText.includes("CALL_HIERARCHY_IGNORES_ABORT")) {
      await this.waitForResistantCallHierarchy(query.item.uri, "outgoing")
    }
    return {
      status: "complete",
      calls: [{
        to: scriptedCallHierarchyItem(query.item.uri, sourceText),
        fromRanges: [zeroRange()],
      }],
    }
  }

  async incomingCalls(
    query: SemanticCallHierarchyItemQuery,
  ): Promise<SemanticCallHierarchyIncomingOutcome> {
    const sourceText = callHierarchySourceText(query)
    if (sourceText.includes("CALL_HIERARCHY_WAITS_FOR_ABORT")) {
      console.log(`scripted call-hierarchy incoming entered ${query.item.uri}`)
      return waitForAbortResult(query.signal)
    }
    if (sourceText.includes("CALL_HIERARCHY_IGNORES_ABORT")) {
      await this.waitForResistantCallHierarchy(query.item.uri, "incoming")
    }
    return {
      status: "complete",
      calls: [{
        from: scriptedCallHierarchyItem(query.item.uri, sourceText),
        fromRanges: [zeroRange()],
      }],
    }
  }

  async foldingRanges(
    query: SemanticFoldingRangeQuery,
  ): Promise<VersionedSemanticResult<SemanticFoldingRange[]>> {
    return scriptedSemanticResult(query, [])
  }

  async formatDocument(
    query: SemanticDocumentFormattingQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentTextEdit[]>> {
    return scriptedSemanticResult(query, [])
  }

  dispose(): void {
    process.stderr.write("SCRIPTED_DISPOSE\n")
  }

  private releaseResistantRename(documentUri: string): void {
    const release = this.resistantRenameResolvers.get(documentUri)
    if (!release) return
    this.resistantRenameResolvers.delete(documentUri)
    release()
  }

  private waitForResistantCallHierarchy(documentUri: string, method: string): Promise<void> {
    console.log(`scripted resistant call-hierarchy ${method} entered ${documentUri}`)
    return new Promise((resolve) => {
      const resolvers = this.resistantCallHierarchyResolvers.get(documentUri)
        ?? new Set<() => void>()
      resolvers.add(resolve)
      this.resistantCallHierarchyResolvers.set(documentUri, resolvers)
    })
  }

  private releaseResistantCallHierarchy(documentUri: string): void {
    const resolvers = this.resistantCallHierarchyResolvers.get(documentUri)
    if (!resolvers) return
    this.resistantCallHierarchyResolvers.delete(documentUri)
    for (const release of resolvers) release()
  }

  private waitForWorkspaceMutation(
    query: SemanticDocumentQuery,
    method: string,
    marker = "WORKSPACE_GLOBAL_IGNORES_ABORT",
  ): Promise<void> {
    if (!query.document.text.includes(marker)) {
      return Promise.resolve()
    }
    console.log(`scripted workspace-global ${method} entered ${query.document.uri}`)
    return new Promise((resolve) => {
      const resolvers = this.workspaceMutationResolvers.get(query.document.workspaceId)
        ?? new Set<() => void>()
      resolvers.add(resolve)
      this.workspaceMutationResolvers.set(query.document.workspaceId, resolvers)
    })
  }

  private releaseWorkspaceMutation(
    workspaceId: string,
    changedUri: string,
    announce = false,
  ): void {
    const resolvers = this.workspaceMutationResolvers.get(workspaceId)
    if (!resolvers && !announce) return
    console.log(`scripted workspace mutation processed ${workspaceId} ${changedUri}`)
    if (!resolvers) return
    this.workspaceMutationResolvers.delete(workspaceId)
    for (const release of resolvers) release()
  }
}

class ScriptedWorkspaceIndex {
  async open() {
    return { state: "warming" as const, committedGeneration: 7 }
  }

  async refresh() {
    return { state: "ready" as const, committedGeneration: 8 }
  }

  async searchSymbols(_workspaceId: string, query: string, _limit: number, signal?: AbortSignal) {
    if (query === "WAIT_CANCEL") return waitForAbortWorkspaceSymbols(signal)
    const uri = pathToFileURL(`${process.cwd()}/fixtures/UnsavedWorkspaceSymbol.ets`).href
    return {
      items: query === "UnsavedWorkspaceType"
        ? [{
            name: "StalePersistedType",
            kind: "class",
            uri,
            range: {
              start: { line: 99, character: 0 },
              end: { line: 99, character: 1 },
            },
          }]
        : query === "W2Symbol"
          ? [{
              name: "W2SymbolUnknown",
              kind: "future-index-kind",
              uri: pathToFileURL(`${process.cwd()}/fixtures/W2UnknownSymbol.ets`).href,
              range: zeroRange(),
            }]
          : [],
      servedGeneration: 7,
      completeness: "stale" as const,
    }
  }

  async status() {
    return { state: "ready" as const, committedGeneration: 7 }
  }

  async close(): Promise<void> {}
}

class ScriptedWorkspaceCatalog {
  async start(
    _workspace: { id: string; rootUri: string },
    report: (progress: {
      phase: "discovering" | "indexing" | "ready" | "degraded"
      discoveredFiles: number
      indexedFiles: number
      skippedEntries: number
      totalFiles?: number
    }) => void,
  ): Promise<void> {
    report({
      phase: "discovering",
      discoveredFiles: 0,
      indexedFiles: 0,
      skippedEntries: 0,
    })
    report({
      phase: "indexing",
      discoveredFiles: 3,
      indexedFiles: 0,
      skippedEntries: 2,
      totalFiles: 3,
    })
    report({
      phase: "indexing",
      discoveredFiles: 3,
      indexedFiles: 1,
      skippedEntries: 2,
      totalFiles: 3,
    })
    await new Promise((resolve) => setTimeout(resolve, 750))
    report({
      phase: "ready",
      discoveredFiles: 3,
      indexedFiles: 3,
      skippedEntries: 2,
      totalFiles: 3,
    })
  }
}

async function scriptedSemanticResult<T>(
  query: SemanticDocumentQuery,
  value: T,
): Promise<VersionedSemanticResult<T>> {
  if (query.document.text.includes("SEMANTIC_WAITS_FOR_ABORT")) {
    return waitForAbortValue(query.signal)
  }
  if (query.document.text.includes("SEMANTIC_DELAY_IGNORING_ABORT")) {
    query.signal?.addEventListener(
      "abort",
      () => process.stderr.write("SCRIPTED_SEMANTIC_STALE_ABORT\n"),
      { once: true },
    )
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return { documentVersion: query.document.version, value }
}

function waitForAbortValue<T>(
  signal?: AbortSignal,
): Promise<VersionedSemanticResult<T>> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    signal?.addEventListener("abort", () => reject(abortError()), { once: true })
  })
}

function waitForAbortResult<T>(signal?: AbortSignal): Promise<T> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    signal?.addEventListener("abort", () => reject(abortError()), { once: true })
  })
}

function zeroRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}

function scriptedCallHierarchyItem(uri: string, text: string) {
  return {
    uri,
    name: "scriptedCallHierarchy",
    kind: "function" as const,
    sourceFingerprint: createHash("sha256").update(text).digest("hex"),
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    selectionRange: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
  }
}

function callHierarchySourceText(query: SemanticCallHierarchyItemQuery): string {
  return query.source.kind === "open"
    ? query.source.document.text
    : query.source.text
}

function waitForAbortWorkspaceSymbols(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    signal?.addEventListener("abort", () => reject(abortError()), { once: true })
  })
}

function waitForAbort(
  signal?: AbortSignal,
): Promise<VersionedSemanticResult<SemanticCompletion[]>> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    signal?.addEventListener("abort", () => reject(abortError()), { once: true })
  })
}

function abortError(): Error {
  const error = new Error("Scripted semantic request aborted")
  error.name = "AbortError"
  return error
}

const projects = new SingleRootProjectResolver(pathToFileURL(process.cwd()).href)
const semantic = new ScriptedSemanticEngine()
runLanguageServer({
  projects,
  semantic,
  workspaceSymbols: new DefaultWorkspaceSymbolService({
    index: new ScriptedWorkspaceIndex(),
    catalog: new ScriptedWorkspaceCatalog(),
    semantic,
    cacheDirectory: process.cwd(),
  }),
})
