import fs from "node:fs"
import path from "node:path"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

/** Real public LSP workspace with independent module manifests and configurable source inputs. */
export async function groupInputWorkspace(t, files, env = {}) {
  const fixture = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1", ...env })
  const { workspace, session, sdk, rootUri, uri } = fixture
  const modules = [...new Set(Object.keys(files).map(file => file.split("/")[0]))]
  fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] }, modules: modules.map(name => ({
      name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true })
    fs.writeFileSync(path.join(workspace, file), content)
  }
  for (const [file, content] of Object.entries(files)) write(file, content)
  for (const name of modules) {
    write(`${name}/build-profile.json5`, "{ targets: [{ name: 'default' }] }")
    write(`${name}/oh-package.json5`, JSON.stringify({ name,
      main: "./src/main/ets/Query.ets", dependencies: {} }))
  }
  await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
  const prepared = await session.transport.notification("arkts/semanticPreparation",
    message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
  const progress = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
  await session.transport.progress(progress.params.token, message => message.params.value.kind === "end", 10_000)
  const watch = (file, type = 2) => session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: uri(file), type }] } })
  const define = (file, text, symbol) => session.request("textDocument/definition", { textDocument: { uri: uri(file) },
    position: positionAt(text, text.lastIndexOf(symbol) + 1) })
  return { ...fixture, write, watch, define, preparation: prepared.params.report }
}
