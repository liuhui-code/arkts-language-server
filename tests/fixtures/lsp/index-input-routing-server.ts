import fs from "node:fs"
import { pathToFileURL } from "node:url"
import type { SemanticEnginePort } from "../../../src/contracts/semantic-engine.js"
import type { WorkspaceSymbolServicePort } from "../../../src/contracts/workspace-symbol-service.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"

const output = process.env.ARKTS_INPUT_ROUTING_AUDIT
if (!output) throw new Error("input routing audit path is required")
const record = (kind: string, data: unknown) => fs.appendFileSync(output,
  `${JSON.stringify({ kind, data })}\n`)
const semantic = {
  sync() {}, close() {}, dispose() {},
  isResourceFile() { return true },
  isSourceNamespace() { return false },
  workspaceFilesChanged(batches) { record("semantic", batches) },
  async diagnose(query) { return { documentVersion: query.document.version, value: [] } },
} as SemanticEnginePort
const workspaceSymbols = {
  start(_workspaces, report) {
    report({ phase: "ready", discoveredFiles: 0, indexedFiles: 0, skippedEntries: 0, totalFiles: 0 })
  },
  sync() {}, closeDocument() {}, async dispose() {},
  observeWorkspaceFiles(batches) { record("observe", batches) },
  workspaceFilesChanged(ids) { record("catalog", ids) },
  async searchSymbols() { return { items: [], servedGeneration: 1, completeness: "ready" } },
} as WorkspaceSymbolServicePort
runLanguageServer({ semantic, workspaceSymbols,
  projects: new SingleRootProjectResolver(pathToFileURL(process.cwd()).href) })
