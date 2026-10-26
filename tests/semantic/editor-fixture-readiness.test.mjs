import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { openEditorFixture } from "../support/editor-fixture.mjs"
import { until } from "../support/worker-recovery-audit.mjs"

function gatedEditorFixture(t) {
  const gate = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-editor-init-gate-"))
  const keys = ["NODE_OPTIONS", "ARKTS_EDITOR_INIT_GATE_DIR"]
  const previous = keys.map(key => process.env[key])
  const cleanup = []
  t.after(async () => {
    fs.writeFileSync(path.join(gate, "release"), "released")
    try { for (const action of cleanup) await action() }
    finally {
      for (const [i, key] of keys.entries()) {
        if (previous[i] === undefined) delete process.env[key]
        else process.env[key] = previous[i]
      }
      fs.rmSync(gate, { recursive: true, force: true })
    }
  })
  process.env.NODE_OPTIONS = "--require=" + JSON.stringify(path.resolve("tests/fixtures/editor-startup-gate.cjs"))
  process.env.ARKTS_EDITOR_INIT_GATE_DIR = gate
  return { gate, context: { after: action => cleanup.push(action) } }
}

test("editor behavior fixtures wait for the public semantic initialization terminal before opening a document", { timeout: 20000 }, async t => {
  const { gate, context } = gatedEditorFixture(t)
  let opened = false
  const pending = openEditorFixture(context, "hover", "Profile.ets")
    .then(value => { opened = true; return value })
  await until(() => fs.existsSync(path.join(gate, "entered")), "the real Worker startup gate")
  assert.equal(opened, false, "initialize response alone does not finish semantic preparation")
  assert.ok(!fs.readFileSync(path.join(gate, "inbound.bin"), "utf8").includes('"method":"textDocument/didOpen"'),
    "the real stdio transcript must not open the document while initialization is gated")
  fs.writeFileSync(path.join(gate, "release"), "released")
  const { server, documentUri, semanticPreparation } = await pending
  assert.equal(semanticPreparation.params.phase, "complete")
  server.send({ jsonrpc: "2.0", id: 501, method: "textDocument/hover", params: {
    textDocument: { uri: documentUri }, position: { line: 3, character: 0 } } })
  const response = await server.response(501)
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.equal(response.result, null)
})

test("editor behavior fixtures reject failed initialization without opening the document", { timeout: 20000 }, async t => {
  const { gate, context } = gatedEditorFixture(t)
  fs.writeFileSync(path.join(gate, "fail"), "fail initialization")
  fs.writeFileSync(path.join(gate, "release"), "released")
  await assert.rejects(openEditorFixture(context, "hover", "Profile.ets"), /Editor fixture semantic preparation failed/)
  assert.ok(!fs.readFileSync(path.join(gate, "inbound.bin"), "utf8").includes('"method":"textDocument/didOpen"'))
})
