import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("complete reference admission borrows verified closed-source bytes without reopening every Program file",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let index = 0; index < 96; index++) fs.writeFileSync(path.join(noise, `Unused${index}.ts`), "export {}\n")
    await initializeReadinessFixture(f, 98)
    assert.equal(f.initialPreparation.semanticState, "ready")
    const uri = f.uri("Main.ets")
    const response = await f.session.request("textDocument/references", { textDocument: { uri },
      position: { line: 1, character: 24 }, context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result.map(value => JSON.stringify(value)).sort(), [
      { uri: f.uri("Unopened.ets"), range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } },
      { uri, range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri, range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    ].map(value => JSON.stringify(value)).sort())
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "semanticReadiness" && row.id > 1)
    assert.ok(rows.length > 0, "references must actually run complete-input admission")
    t.diagnostic(JSON.stringify({ qualification: "COMPLETE_98_SOURCE_PUBLIC_REFERENCES", observations: rows }))
    assert.ok(rows.every(row => row.sourceReads === 0), `verified Program byte evidence should avoid repeated disk reads: ${JSON.stringify(rows)}`)
    assert.ok(rows.every(row => row.leafStats <= 96 * 4), `membership must join the existing two fresh identity fences: ${JSON.stringify(rows)}`)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("Native disk qualification never borrows unsaved overlay bytes and recovers after close",
  { timeout: 30_000 }, async t => {
    const { f, references, observations, expected, warm } = await completeFixture(t, "reference-disk-fingerprint.cjs")
    const target = f.uri("noise/Unused5.ts")
    f.session.openDocument({ uri: target, version: 1, text: "export class OnlyInUnsavedBuffer {}\n" })
    await warm()
    const before = observations().length
    assert.deepEqual(normalize((await references()).result), expected)
    const overlay = observations().slice(before)
    assert.ok(overlay.length > 0)
    assert.ok(overlay.every(row => row.sourceReads === 1), JSON.stringify(overlay))
    const namespaces = () => fs.readFileSync(path.join(f.directory, "disk-namespace.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.diskSha256)
    const diskDigest = diskNamespaceDigest(f.workspace)
    const overlayDigest = diskNamespaceDigest(f.workspace, new Map([["noise/Unused5.ts", "export class OnlyInUnsavedBuffer {}\n"]]))
    assert.notEqual(diskDigest, overlayDigest, "the oracle must distinguish disk and overlay bytes")
    assert.ok(namespaces().length > 0)
    assert.ok(namespaces().every(row => row.diskSha256 === diskDigest), "every actual admission fingerprint must describe disk, never the unsaved overlay")
    assert.equal(fs.readFileSync(path.join(f.workspace, "noise/Unused5.ts"), "utf8"), "export {}\n")
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: target } } })
    await warm()
    const closed = observations().length
    assert.deepEqual(normalize((await references()).result), expected)
    assert.ok(observations().slice(closed).every(row => row.sourceReads === 0))
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("a same-length/mtime disk edit during borrowed digest construction revokes the whole request",
  { timeout: 30_000 }, async t => {
    const { f, params, warm } = await completeFixture(t, "reference-digest-final-mutation.cjs")
    const file = path.join(f.workspace, "noise/Unused0.ts"), original = fs.readFileSync(file, "utf8")
    const plan = path.join(f.directory, "reference-digest-mutation.json")
    fs.writeFileSync(plan, JSON.stringify({ text: original.replace("= 1", "= 2") }))
    const stale = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(fs.existsSync(plan + ".fired"), true, "the edit must occur inside actual digest borrowing")
    const mutation = JSON.parse(fs.readFileSync(plan + ".evidence.json", "utf8"))
    assert.equal(mutation.before.size, mutation.after.size)
    assert.equal(mutation.before.mtimeMs, mutation.after.mtimeMs)
    assert.equal(stale.result, undefined)
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    fs.writeFileSync(file, original)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("noise/Unused0.ts"), type: 2 }] } })
    await warm()
    const ready = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
    assert.equal(ready.error, undefined, JSON.stringify(ready))
    assert.equal(ready.result.semanticState, "ready")
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

async function completeFixture(t, extraObserver) {
  const observers = ["scope-directory-resolution-count.cjs", extraObserver].filter(Boolean)
  const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
    NODE_OPTIONS: observers.map(file => `--require=${JSON.stringify(path.resolve("tests/fixtures", file))}`).join(" ") })
  const noise = path.join(f.workspace, "noise")
  fs.mkdirSync(noise)
  for (let index = 0; index < 96; index++) fs.writeFileSync(path.join(noise, `Unused${index}.ts`),
    index === 0 ? "export const proof = 1\n" : "export {}\n")
  const normalizedTime = Math.floor(Date.now() / 1000)
  fs.utimesSync(path.join(noise, "Unused0.ts"), normalizedTime, normalizedTime)
  await initializeReadinessFixture(f, 98)
  assert.equal(f.initialPreparation.semanticState, "ready")
  const uri = f.uri("Main.ets"), params = { textDocument: { uri }, position: { line: 1, character: 24 } }
  const expected = normalize([
    { uri: f.uri("Unopened.ets"), range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } },
    { uri, range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
    { uri, range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
  ])
  const references = async () => {
    const result = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(result.error, undefined, JSON.stringify(result))
    return result
  }
  const warm = async () => {
    const result = await f.session.request("textDocument/definition", params)
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.equal(result.result?.length, 1)
    assert.equal(result.result[0].uri, f.uri("Unopened.ets"))
  }
  const observations = () => fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
    .trim().split("\n").map(JSON.parse).filter(row => row.method === "semanticReadiness" && row.id > 1)
  return { f, references, warm, observations, expected, params }
}

function normalize(values) { return values.map(value => JSON.stringify(value)).sort() }

/** Independent CompleteScanInputs source projection from actual on-disk bytes. */
function diskNamespaceDigest(root, overlays = new Map()) {
  const files = []
  const visit = (directory, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name, file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file, relative + "/")
      else if (entry.isFile() && /\.(ets|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        const uri = pathToFileURL(fs.realpathSync.native(file)).href
        const content = overlays.has(relative) ? overlays.get(relative) : fs.readFileSync(file, "utf8")
        files.push({ uri, digest: createHash("sha256").update(content).digest() })
      }
    }
  }
  visit(root)
  const hash = createHash("sha256")
  for (const { uri, digest } of files.sort((a,b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0)) {
    const bytes = Buffer.from(uri), length = Buffer.alloc(8); length.writeBigUInt64LE(BigInt(bytes.length))
    hash.update(length).update(bytes).update(digest)
  }
  return hash.digest("hex")
}
