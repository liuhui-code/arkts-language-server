import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

for (const explicit of [undefined, "/explicit-test-sdk"]) {
  test(`LSP transport uses a hermetic SDK unless the caller selects one (${explicit ?? "default"})`, async t => {
    const server = new LspProcess({ command: process.execPath, args: ["-e", `
      const body = JSON.stringify({ jsonrpc: "2.0", id: 71,
        result: process.env.ARKLINE_HARMONY_SDK_PATH })
      process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body)
    `], ...(explicit ? { env: { ARKLINE_HARMONY_SDK_PATH: explicit } } : {}) })
    t.after(() => server.close())
    const response = await server.response(71)
    assert.equal(response.result, explicit ?? path.join(projectRoot, "fixtures/conformance/v1/sdk/openharmony"))
  })
}
