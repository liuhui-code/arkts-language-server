import { pathToFileURL } from "node:url"

import type { DocumentSnapshot } from "../../../src/contracts/document.js"
import type {
  SemanticCodeActionQuery,
  SemanticCodeActionResolveQuery,
  SemanticDocumentQuery,
  SemanticDocumentSymbol,
  SemanticEnginePort,
  SemanticHover,
  SemanticCompletionResolveQuery,
  SemanticQuery,
  SemanticReferencesOutcome,
  SemanticReferencesQuery,
  SemanticRenameQuery,
  SemanticResolvedCodeAction,
  SemanticSignatureHelp,
  SemanticSignatureHelpQuery,
  VersionedSemanticResult,
  SemanticCompletion,
  SemanticDefinition,
} from "../../../src/contracts/semantic-engine.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"
import { DefaultWorkspaceSymbolService } from "../../../src/workspace/default-workspace-symbol-service.js"

class ScriptedSemanticEngine implements SemanticEnginePort {
  private completionCount = 0
  private readonly resistantCodeActionResolvers = new Map<string, () => void>()

  sync(_document: DocumentSnapshot): void {}

  close(_documentUri: string): void {}

  async complete(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion[]>> {
    this.completionCount += 1
    if (
      query.document.text.includes("FIRST_WAITS_FOR_ABORT")
      && this.completionCount === 1
    ) {
      return waitForAbort(query.signal)
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

  async references(
    query: SemanticReferencesQuery,
  ): Promise<VersionedSemanticResult<SemanticReferencesOutcome>> {
    return scriptedSemanticResult(query, { status: "complete", references: [] })
  }

  async prepareRename(query: SemanticQuery) {
    return scriptedSemanticResult(query, { status: "unavailable" as const })
  }

  async rename(query: SemanticRenameQuery) {
    return scriptedSemanticResult(query, { status: "unavailable" as const })
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

  dispose(): void {
    process.stderr.write("SCRIPTED_DISPOSE\n")
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

function zeroRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
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
