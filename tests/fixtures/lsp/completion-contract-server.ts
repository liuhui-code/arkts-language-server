import { pathToFileURL } from "node:url"
import type { SemanticCompletion, SemanticCompletionResolveQuery, SemanticEnginePort, SemanticQuery } from "../../../src/contracts/semantic-engine.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"

const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }
const item: SemanticCompletion = {
  label: "member", detail: "listed detail", kind: "property", insertText: "member",
  filterText: "member", sortText: "001", replacementRange: range,
}
const semantic = {
  sync() {}, close() {}, dispose() {},
  async diagnose() { return [] },
  async complete(query: SemanticQuery) {
    return { documentVersion: query.document.version, value: { items: [item], isIncomplete: false } }
  },
  async resolveCompletion(query: SemanticCompletionResolveQuery) {
    if (query.document.text.includes("BACKEND_FAILURE")) throw new Error("controlled completion backend failure")
    const invalid = query.document.text.includes("CROSS_FILE_EDIT")
    return { documentVersion: query.document.version, value: {
      ...query.completion, label: "changed by backend", insertText: "changed()", filterText: "changed",
      sortText: "999", replacementRange: { start: range.start, end: { line: 0, character: 99 } },
      detail: "resolved detail", documentation: "resolved documentation",
      additionalTextEdits: [{ uri: invalid ? query.document.uri + ".other" : query.document.uri,
        expectedVersion: query.document.version, range: { start: range.start, end: range.start }, newText: "// import\n" }],
    } }
  },
}
runLanguageServer({ semantic: semantic as unknown as SemanticEnginePort,
  projects: new SingleRootProjectResolver(pathToFileURL(process.cwd()).href) })
