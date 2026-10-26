import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { LspProcess, projectRoot } from "./lsp-process.mjs"

export async function openEditorFixture(t, directory, fileName, capabilities = {}) {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", directory)
  const documentPath = path.join(fixtureRoot, fileName)
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        ...capabilities,
      },
    },
  })
  const initialized = await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const semanticPreparation = await server.notification("arkts/semanticPreparation", message =>
    message.params.rootUri === pathToFileURL(fixtureRoot).href
    && (message.params.phase === "complete" || message.params.phase === "failed"))
  if (semanticPreparation.params.phase === "failed") {
    throw new Error("Editor fixture semantic preparation failed: " + JSON.stringify(semanticPreparation.params))
  }
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text,
      },
    },
  })

  return { server, initialized, documentUri, text, semanticPreparation }
}
