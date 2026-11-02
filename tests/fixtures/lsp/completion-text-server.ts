import { pathToFileURL } from "node:url"
import type { SemanticCompletion, SemanticDocumentQuery, SemanticEnginePort, SemanticQuery } from "../../../src/contracts/semantic-engine.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"

const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }
const items: SemanticCompletion[] = [
  { label: "foo$1", kind: "variable", insertText: "foo$1", replacementRange: range },
  { label: "literal", kind: "property", insertText: "${1:literal} ${2} $0", isSnippet: false,
    replacementRange: range },
  { label: "fallback$2", kind: "variable" },
  { label: "snippet", kind: "function", insertText: "call(${1:argument}, ${2})$0",
    isSnippet: true, replacementRange: range },
]
const semantic = {
  sync() {}, close() {}, dispose() {},
  async diagnose(query: SemanticDocumentQuery) {
    return { documentVersion: query.document.version, value: [] }
  },
  async complete(query: SemanticQuery) {
    return { documentVersion: query.document.version, value: { items, isIncomplete: false } }
  },
}
runLanguageServer({ semantic: semantic as unknown as SemanticEnginePort,
  projects: new SingleRootProjectResolver(pathToFileURL(process.cwd()).href) })
