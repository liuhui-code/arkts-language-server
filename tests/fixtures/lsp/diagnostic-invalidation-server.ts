import { pathToFileURL } from "node:url"
import type { DocumentSnapshot } from "../../../src/contracts/document.js"
import type { SemanticDocumentQuery, SemanticEnginePort } from "../../../src/contracts/semantic-engine.js"
import { runLanguageServer } from "../../../src/lsp/run-language-server.js"
import { SingleRootProjectResolver } from "../../../src/project/single-root-project-resolver.js"

let rejectDiagnosis: ((error: Error) => void) | undefined
let first = true
const semantic = {
  sync(document: DocumentSnapshot) {
    if (document.uri.endsWith("/B.ets") && document.version === 2) {
      const error = Object.assign(new Error("fixture dependency changed"), {
        code: process.env.ARKTS_TEST_DIAGNOSTIC_ERROR ?? "content-modified",
      })
      rejectDiagnosis?.(error)
    }
  },
  close() {}, dispose() {},
  async diagnose(query: SemanticDocumentQuery) {
    if (first && query.document.uri.endsWith("/A.ets")) {
      first = false
      const result = new Promise<never>((_resolve, reject) => { rejectDiagnosis = reject })
      const body = JSON.stringify({ jsonrpc: "2.0", method: "window/logMessage",
        params: { type: 3, message: "fixture diagnosis entered" } })
      process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
      return result
    }
    return { documentVersion: query.document.version, value: [] }
  },
}
runLanguageServer({ semantic: semantic as unknown as SemanticEnginePort,
  projects: new SingleRootProjectResolver(pathToFileURL(process.cwd()).href) })
