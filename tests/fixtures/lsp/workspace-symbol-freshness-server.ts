import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { SemanticDocumentQuery, SemanticEnginePort } from "../../../src/contracts/semantic-engine.js"
import type { DocumentSnapshot } from "../../../src/contracts/document.js"
import { DefaultWorkspaceSymbolService } from "../../../src/workspace/default-workspace-symbol-service.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"

const directory = process.cwd()
const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
const mark = (name: string) => fs.writeFileSync(path.join(directory, name), "yes")
async function gate(name: string) {
  mark(`${name}.entered`)
  while (!fs.existsSync(path.join(directory, `${name}.release`))) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
const semantic = {
  sync(document: DocumentSnapshot) {
    queueMicrotask(() => mark(`sync-${path.basename(new URL(document.uri).pathname)}-${document.version}`))
  },
  close(uri: string) { queueMicrotask(() => mark(`close-${path.basename(new URL(uri).pathname)}`)) },
  dispose() {},
  async diagnose(query: SemanticDocumentQuery) { return { documentVersion: query.document.version, value: [] } },
  async documentSymbols(query: SemanticDocumentQuery) {
    const name = /class (\w+)/.exec(query.document.text)?.[1] ?? "Unknown"
    if (query.document.text.includes("WAIT_OVERLAY")) await gate("overlay")
    mark(`resolved-${name}`)
    return { documentVersion: query.document.version,
      value: [{ name, kind: "class", range, selectionRange: range }] }
  },
} as unknown as SemanticEnginePort
const index = {
  async open() { mark("index-open"); return { state: "ready" as const, committedGeneration: 1 } },
  async close() {},
  async searchSymbols(_workspaceId: string, query: string) {
    if (query === "WAIT_INDEX") await gate("index")
    return { items: query === "WAIT_INDEX" ? [{ name: "WAIT_INDEX_StaleDisk", kind: "class" as const,
      uri: pathToFileURL(path.join(directory, "New.ets")).href, range }] : [],
    servedGeneration: 1, completeness: "ready" as const }
  },
  async refresh() { return { state: "ready" as const, committedGeneration: 1 } },
  async status() { return { state: "ready" as const, committedGeneration: 1 } },
}
const workspaceSymbols = new DefaultWorkspaceSymbolService({ index, semantic, cacheDirectory: directory,
  catalog: { async start(_workspace, report) {
    report({ phase: "ready", discoveredFiles: 0, indexedFiles: 0, skippedEntries: 0, totalFiles: 0 })
  } } })
const search = workspaceSymbols.searchSymbols.bind(workspaceSymbols)
workspaceSymbols.searchSymbols = (query, ...args) => {
  if (query === "FAIL_SERVICE") return Promise.reject(new Error("scripted service failure"))
  return search(query, ...args)
}
runLanguageServer({ semantic, workspaceSymbols,
  projects: new SingleRootProjectResolver(pathToFileURL(directory).href) })
