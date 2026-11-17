import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-maintenance-negotiation-"))
const output = path.join(root, "negotiation.mjs")
try {
  buildSync({ stdin: { contents: `export * from "./src/index/maintenance-negotiation.ts";
      export {SidecarRequestError} from "./src/index/sidecar-session.ts";`,
    resolveDir: path.resolve(import.meta.dirname, "..") },
    outfile: output, bundle: true, platform: "node", format: "esm" })
} catch (error) { fs.rmSync(root, { recursive: true, force: true }); throw error }
const api = await import(pathToFileURL(output).href)
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }))
const capability = "versioned-file-maintenance-v1"
const legacy = () => ({ workspaceIdentity: "file:///fixture", status: { state: "warming", committedGeneration: 0 } })
const modern = () => ({ ...legacy(), capabilities: [capability], factsDomain: "facts-producer-a", readerEpoch: "epoch-a" })
const params = { workspaceRoot: "/fixture", cacheDirectory: "/cache" }
function session(respond) {
  const calls = []
  return { calls, request: async (method, value) => {
    calls.push({ method, params: value })
    return respond(calls.length, value)
  } }
}

test("requests explicit capability and binds the acknowledged producer and reader lifetime", async () => {
  const child = session(() => modern())
  const result = await api.negotiateMaintenance(child, params)
  assert.deepEqual(result.maintenance, { factsDomain: "facts-producer-a", readerEpoch: "epoch-a" })
  assert.equal(result.legacyRetry, false)
  assert.deepEqual(child.calls, [{ method: "initialize", params: { ...params, capabilities: [capability] } }])
  assert.equal(result.initialized.workspaceIdentity, "file:///fixture")
})

test("a valid response with no capability acknowledgment stays on the legacy protocol", async () => {
  for (const response of [legacy(), { ...legacy(), capabilities: [] },
    { ...legacy(), capabilities: ["unrelated-future-capability"] }]) {
    const child = session(() => response)
    const result = await api.negotiateMaintenance(child, params)
    assert.equal(result.maintenance, undefined)
    assert.equal(child.calls.length, 1)
  }
})

test("only typed initialize invalid_params allows one compatibility retry without the new field", async () => {
  const child = session(count => {
    if (count === 1) throw new api.SidecarRequestError("invalid_params", "unknown field capabilities")
    return legacy()
  })
  const result = await api.negotiateMaintenance(child, params)
  assert.equal(result.legacyRetry, true)
  assert.equal(result.maintenance, undefined)
  assert.deepEqual(child.calls[1], { method: "initialize", params })
  assert.equal(child.calls.length, 2)
})

test("failed compatibility retry is final and never loops", async () => {
  const error = new api.SidecarRequestError("invalid_params", "bad root")
  const child = session(() => { throw error })
  await assert.rejects(api.negotiateMaintenance(child, params), caught => caught === error)
  assert.equal(child.calls.length, 2)
})

test("IO, busy, malformed and transport failures never downgrade to legacy", async () => {
  for (const error of [new api.SidecarRequestError("io", "missing database"),
    new api.SidecarRequestError("busy", "active owner"), new Error("invalid_params"),
    Object.assign(new Error("fake code"), { code: "invalid_params" })]) {
    const child = session(() => { throw error })
    await assert.rejects(api.negotiateMaintenance(child, params), caught => caught === error)
    assert.equal(child.calls.length, 1)
  }
})

test("malformed acknowledged identities fail closed without falling back", async () => {
  const mutate = [v => { delete v.factsDomain }, v => { v.factsDomain = "" },
    v => { v.readerEpoch = "" }, v => { delete v.readerEpoch }, v => { v.readerEpoch = 4 },
    v => { v.capabilities = capability }, v => { v.capabilities = [capability, 3] },
    v => { v.capabilities = [capability, capability] }]
  for (const change of mutate) {
    const response = modern()
    change(response)
    const child = session(() => response)
    await assert.rejects(api.negotiateMaintenance(child, params), { name: "SidecarProtocolError" })
    assert.equal(child.calls.length, 1)
  }
})

test("a peer cannot activate a capability that the compatibility retry did not request", async () => {
  const child = session(count => {
    if (count === 1) throw new api.SidecarRequestError("invalid_params", "old initialize")
    return modern()
  })
  await assert.rejects(api.negotiateMaintenance(child, params), { name: "SidecarProtocolError" })
  assert.equal(child.calls.length, 2)
})
