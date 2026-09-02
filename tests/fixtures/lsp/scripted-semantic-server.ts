import { pathToFileURL } from "node:url"

import type { DocumentSnapshot } from "../../../src/contracts/document.js"
import type {
  SemanticDocumentQuery,
  SemanticDocumentSymbol,
  SemanticEnginePort,
  SemanticHover,
  SemanticQuery,
  SemanticSignatureHelp,
  VersionedSemanticResult,
  SemanticCompletion,
  SemanticDefinition,
} from "../../../src/contracts/semantic-engine.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"

class ScriptedSemanticEngine implements SemanticEnginePort {
  private completionCount = 0

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

  async define(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    return scriptedSemanticResult(query, [{
      uri: query.document.uri,
      range: zeroRange(),
    }])
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
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticSignatureHelp | null>> {
    return scriptedSemanticResult(query, {
      signatures: [{ label: "scripted(value: string)", parameters: [{ label: "value" }] }],
      activeSignature: 0,
      activeParameter: 0,
    })
  }

  async documentSymbols(
    query: SemanticDocumentQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentSymbol[]>> {
    return scriptedSemanticResult(query, [{
      name: "Scripted",
      kind: "struct",
      range: zeroRange(),
      selectionRange: zeroRange(),
    }])
  }

  dispose(): void {
    process.stderr.write("SCRIPTED_DISPOSE\n")
  }
}

class ScriptedWorkspaceSymbols {
  private readonly documents = new Map<string, DocumentSnapshot>()

  start(
    _workspaces: readonly { id: string; rootUri: string }[],
    report?: (progress: {
      phase: string
      discoveredFiles: number
      indexedFiles: number
      skippedEntries: number
      totalFiles?: number
    }) => void,
  ): void {
    if (!report) return
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
    report({
      phase: "ready",
      discoveredFiles: 3,
      indexedFiles: 3,
      skippedEntries: 2,
      totalFiles: 3,
    })
  }

  sync(document: DocumentSnapshot): void {
    this.documents.set(document.uri, document)
  }

  closeDocument(documentUri: string): void {
    this.documents.delete(documentUri)
  }

  async searchSymbols(query: string, _limit: number, signal?: AbortSignal) {
    if (query === "WAIT_CANCEL") return waitForAbortWorkspaceSymbols(signal)
    const items = [...this.documents.values()]
      .filter((document) => document.text.includes(query))
      .map((document) => ({
        name: query,
        kind: "struct",
        uri: document.uri,
        range: zeroRange(),
      }))
    return { items, servedGeneration: 7, completeness: "partial" as const }
  }

  dispose(): void {
    process.stderr.write("SCRIPTED_WORKSPACE_DISPOSE\n")
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
runLanguageServer({
  projects,
  semantic: new ScriptedSemanticEngine(),
  workspaceSymbols: new ScriptedWorkspaceSymbols(),
})
