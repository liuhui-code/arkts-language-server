#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { LspSession } from "../../tests/support/lsp-session.mjs"

if (process.platform !== "win32") throw new Error("This smoke test requires Windows")
const profile = process.argv[2]
if (!profile) throw new Error("usage: node scripts/bench/windows-zed-smoke.mjs ZED_USER_DATA_DIR")

const extension = path.join(profile, "extensions", "installed", "arkts")
assert.ok(fs.lstatSync(extension).isSymbolicLink(), "installed extension must be a junction")
assert.equal(fs.readFileSync(path.join(extension, "extension.wasm")).subarray(0, 4).toString("hex"), "0061736d")
assert.equal(fs.readFileSync(path.join(extension, "grammars", "arkts.wasm")).subarray(0, 4).toString("hex"), "0061736d")

const launch = path.join(profile, "extensions", "work", "arkts", "bin", "arkts-language-server.windows")
const [marker, node, server, terminator] = fs.readFileSync(launch, "utf8").split("\n")
assert.equal(marker, "arkts-language-server-zed-node-v1")
assert.equal(terminator, "")
assert.ok(fs.statSync(node).isFile())
assert.ok(fs.statSync(server).isFile())
assert.ok(fs.statSync(path.resolve(server, "..", "..", "target", "release", "arkts-index-sidecar.exe")).isFile())

const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP ?? process.cwd(), "arkts-zed-smoke-"))
const source = path.join(root, "Main.ets")
fs.writeFileSync(source, "export class SmokeClass {}\nconst smoke = new SmokeClass()\n")
const session = new LspSession({
  command: node,
  args: [server, "--stdio"],
  rootUri: pathToFileURL(root).href,
  cwd: root,
})
try {
  const initialized = await session.initialize({ timeoutMs: 15_000 })
  assert.equal(initialized.result.serverInfo.name, "arkts-language-server")
  session.openDocument({ uri: pathToFileURL(source).href, version: 1, text: fs.readFileSync(source, "utf8") })
  const symbols = await session.request("textDocument/documentSymbol", {
    textDocument: { uri: pathToFileURL(source).href },
  }, { timeoutMs: 15_000 })
  assert.ok(Array.isArray(symbols.result), JSON.stringify(symbols.error))
  assert.ok(symbols.result.some((symbol) => symbol.name === "SmokeClass"))
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.equal(closed.exit.code, 0)
  process.stdout.write("WINDOWS_ZED_INSTALL=PASS\n")
} finally {
  await session.close().catch(() => {})
  fs.rmSync(root, { recursive: true, force: true })
}
