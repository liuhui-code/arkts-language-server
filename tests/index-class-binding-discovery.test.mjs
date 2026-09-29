import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

const projectRoot = path.resolve(import.meta.dirname, "..")
const require = createRequire(import.meta.url)

test("discovers a base binding through the public sidecar port and rebases its bounded support", async (t) => {
  const fixture = await createFixture(t)
  const query = fixture.query()
  const result = await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query)
  assert.deepEqual(result, {
    servedGeneration: 7,
    completeness: "ready",
    binding: {
      kind: "resolved", declarationUri: query.documentUris[1], name: "Base",
      nameRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 17 } },
      supportUris: query.documentUris,
    },
  })
  const request = fixture.requests().find(request => request.method === "class-bindings/resolve")
  const canonicalUris = ["Child.ets", "Base.ets"].map(name => `${fixture.identity}/${name}`)
  assert.deepEqual(request.params, {
    workspaceIdentity: fixture.identity, expectedGeneration: 7, documentUris: canonicalUris,
    overlays: [{ uri: canonicalUris[0], text: query.overlays[0].text }],
    documentUri: canonicalUris[0], classNamePosition: query.classNamePosition,
  })
})

test("transports captured availability for every extensionless source candidate without inferring absence", async (t) => {
  const fixture = await createFixture(t, `({ workspaceIdentity, servedGeneration: 7,
    completeness: "ready", binding: { kind: "unknown" } })`)
  const query = fixture.query()
  query.overlays[0].text = "import { Base } from './Base';\nclass Child extends Base {}"
  const candidates = ["Base.ets", "Base.ts", "Base.d.ets", "Base.d.ts",
    "Base/index.ets", "Base/index.ts", "Base/index.d.ets", "Base/index.d.ts"]
    .map(name => `${fixture.workspace.rootUri}/${name}`)
  fs.writeFileSync(fileURLToPath(candidates[0]), "export class Base {}\n")
  assert.ok(fs.existsSync(fileURLToPath(candidates[0])))
  assert.ok(candidates.slice(1).every(uri => !fs.existsSync(fileURLToPath(uri))))
  query.documentUris = [query.documentUri, ...candidates]
  query.sourceAvailability = query.documentUris.map((uri, i) => ({
    uri, state: i < 2 ? "present" : i === 2 ? "unknown" : "absent",
  }))
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query), {
    servedGeneration: 7, completeness: "ready", binding: { kind: "unknown" },
  })
  const request = fixture.requests().find(request => request.method === "class-bindings/resolve")
  assert.deepEqual(request.params.sourceAvailability, query.sourceAvailability.map(entry => ({
    uri: entry.uri.replace(fixture.workspace.rootUri, fixture.identity), state: entry.state,
  })))
})

test("rejects invalid source availability before IO without degrading the session", async (t) => {
  const fixture = await createFixture(t, `({ workspaceIdentity, servedGeneration: 7,
    completeness: "ready", binding: { kind: "unknown" } })`)
  for (const [label, evidence] of [
    ["invalid state", query => [{ uri: query.documentUris[1], state: "missing" }]],
    ["object state", query => [{ uri: query.documentUris[1], state: { present: null } }]],
    ["missing state", query => [{ uri: query.documentUris[1] }]],
    ["null", () => null],
    ["non-array", () => ({})],
    ["sparse", () => Array(1)],
    ["null entry", () => [null]],
    ["invalid URI", () => [{ uri: 1, state: "unknown" }]],
    ["duplicate", query => Array(2).fill({ uri: query.documentUris[1], state: "present" })],
    ["canonical duplicate", query => [
      { uri: query.documentUris[1], state: "present" },
      { uri: `${fixture.identity}/Base.ets`, state: "present" },
    ]],
    ["unrequested", () => [{ uri: `${fixture.workspace.rootUri}/Other.ets`, state: "absent" }]],
    ["foreign", () => [{ uri: "file:///outside/Other.ets", state: "absent" }]],
    ["oversized", query => Array(129).fill({ uri: query.documentUris[1], state: "unknown" })],
    ["absent open source", query => [{ uri: query.documentUri, state: "absent" }]],
  ]) {
    await t.test(label, async () => {
      const query = fixture.query()
      query.sourceAvailability = evidence(query)
      await assert.rejects(fixture.index.resolveClassBaseBinding(fixture.workspace.id, query),
        error => error.name !== "SidecarProtocolError")
    })
  }
  assert.equal(fixture.requests().filter(request => request.method === "class-bindings/resolve").length, 0)
  assert.equal((await fixture.index.status(fixture.workspace.id)).state, "ready")
})

test("keeps partial or unknown availability unchanged and does not invent absent entries", async (t) => {
  const fixture = await createFixture(t, `({ workspaceIdentity, servedGeneration: 7,
    completeness: "ready", binding: { kind: "unknown" } })`)
  for (const sourceAvailability of [undefined, [],
    [{ uri: fixture.query().documentUri, state: "unknown" }]]) {
    const query = fixture.query()
    query.sourceAvailability = sourceAvailability
    await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query)
    const request = fixture.requests().filter(request => request.method === "class-bindings/resolve").at(-1)
    if (sourceAvailability === undefined) assert.equal(Object.hasOwn(request.params, "sourceAvailability"), false)
    else assert.deepEqual(request.params.sourceAvailability, sourceAvailability.map(entry => ({
      uri: entry.uri.replace(fixture.workspace.rootUri, fixture.identity), state: entry.state,
    })))
  }
})

test("captures the complete bounded availability input before caller mutation", async (t) => {
  const fixture = await createFixture(t, `({ workspaceIdentity, servedGeneration: 7,
    completeness: "ready", binding: { kind: "unknown" } })`)
  const query = fixture.query()
  query.documentUris = [query.documentUri,
    ...Array.from({ length: 127 }, (_, i) => `${fixture.workspace.rootUri}/Candidate${i}.ets`)]
  query.sourceAvailability = query.documentUris.map(uri => ({ uri, state: "unknown" }))
  const expected = query.sourceAvailability.map(entry => ({
    uri: entry.uri.replace(fixture.workspace.rootUri, fixture.identity), state: entry.state,
  }))
  const pending = fixture.index.resolveClassBaseBinding(fixture.workspace.id, query)
  query.sourceAvailability[0].state = "absent"
  query.sourceAvailability.splice(1)
  query.documentUris.splice(1)
  assert.deepEqual(await pending, { servedGeneration: 7, completeness: "ready", binding: { kind: "unknown" } })
  const request = fixture.requests().find(request => request.method === "class-bindings/resolve")
  assert.equal(request.params.documentUris.length, 128)
  assert.deepEqual(request.params.sourceAvailability, expected)
})

test("resolves complete caller-evidenced diskless candidates through the real sidecar", async (t) => {
  const sidecarPath = path.join(projectRoot, "target/release", process.platform === "win32"
    ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  assert.ok(fs.existsSync(sidecarPath), "build the release sidecar before this public protocol test")
  const fixture = await createFixture(t, undefined, { sidecarPath })
  const query = fixture.query()
  const child = { ...query.overlays[0], text: "import { Base } from './Base';\nclass Child extends Base {}" }
  const base = { ...child, uri: query.documentUris[1], text: "export class Base {}" }
  assert.equal(fs.existsSync(fileURLToPath(base.uri)), false)
  await fixture.index.refresh(fixture.workspace.id, 7, [child], [])
  query.documentUris = [query.documentUri, ...["Base.ets", "Base.ts", "Base.d.ets", "Base.d.ts",
    "Base/index.ets", "Base/index.ts", "Base/index.d.ets", "Base/index.d.ts"]
    .map(name => `${fixture.workspace.rootUri}/${name}`)]
  query.overlays = [child, base]
  query.sourceAvailability = query.documentUris.map((uri, i) => ({ uri, state: i < 2 ? "present" : "absent" }))
  const expected = { servedGeneration: 7, completeness: "ready", binding: { kind: "unknown" } }
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query), {
    servedGeneration: 7, completeness: "ready", binding: { kind: "resolved", name: "Base",
      declarationUri: base.uri,
      nameRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 17 } },
      supportUris: [base.uri, child.uri] },
  })
  query.sourceAvailability[2].state = "unknown"
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query), expected)
  fs.writeFileSync(fileURLToPath(query.documentUris[2]), "export class UnindexedBase {}")
  query.sourceAvailability[2].state = "present"
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query), expected)
  assert.equal((await fixture.index.status(fixture.workspace.id)).committedGeneration, 7)
})

test("rejects a discovery response from another workspace and degrades its session", async (t) => {
  const fixture = await createFixture(t, `({ workspaceIdentity: workspaceIdentity + "/foreign",
    servedGeneration: 7, completeness: "ready", binding: { kind: "no-base" } })`)
  await assert.rejects(fixture.index.resolveClassBaseBinding(fixture.workspace.id, fixture.query()),
    error => error.name === "SidecarProtocolError")
  assert.equal((await fixture.index.status(fixture.workspace.id)).state, "degraded")
})

test("withholds known discovery unless completeness and generation match the request", async (t) => {
  for (const [completeness, servedGeneration] of [["partial", 7], ["stale", 7], ["ready", 8]]) {
    await t.test(`${completeness} generation ${servedGeneration}`, async (t) => {
      const fixture = await createFixture(t, `({ workspaceIdentity, servedGeneration: ${servedGeneration},
        completeness: ${JSON.stringify(completeness)}, binding: { kind: "no-base" } })`)
      await assert.rejects(fixture.index.resolveClassBaseBinding(fixture.workspace.id, fixture.query()),
        error => error.name === "SidecarProtocolError")
      assert.equal((await fixture.index.status(fixture.workspace.id)).state, "degraded")
    })
  }
})

test("rejects a resolved discovery whose support does not prove the requested declaration", async (t) => {
  for (const [label, support] of [
    ["duplicate", "[params.documentUris[1], params.documentUris[1]]"],
    ["unrequested", "[params.documentUris[1], workspaceIdentity + '/Other.ets']"],
    ["missing declaration", "[params.documentUris[0]]"],
    ["missing queried class", "[params.documentUris[1]]"],
  ]) {
    await t.test(label, async (t) => {
      const fixture = await createFixture(t, `({ workspaceIdentity, servedGeneration: 7, completeness: "ready",
        binding: { kind: "resolved", declarationUri: params.documentUris[1], name: "Base",
          nameRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 17 } },
          supportUris: ${support} } })`)
      await assert.rejects(fixture.index.resolveClassBaseBinding(fixture.workspace.id, fixture.query()),
        error => error.name === "SidecarProtocolError")
      assert.equal((await fixture.index.status(fixture.workspace.id)).state, "degraded")
    })
  }
})

test("treats malformed discovery envelopes, tags and UTF-16 ranges as protocol failures", async (t) => {
  for (const [label, expression] of [
    ["null response", "null"],
    ["invalid generation", `({ workspaceIdentity, servedGeneration: 0.5, completeness: "ready", binding: { kind: "unknown" } })`],
    ["unsafe generation", `({ workspaceIdentity, servedGeneration: 9007199254740992, completeness: "ready", binding: { kind: "unknown" } })`],
    ["invalid completeness", `({ workspaceIdentity, servedGeneration: 7, completeness: "complete", binding: { kind: "unknown" } })`],
    ["missing binding", `({ workspaceIdentity, servedGeneration: 7, completeness: "ready" })`],
    ["unknown tag", `({ workspaceIdentity, servedGeneration: 7, completeness: "ready", binding: { kind: "compiler" } })`],
    ["empty name", resolvedResponse(`name: ""`)],
    ["missing range", resolvedResponse(`nameRange: undefined`)],
    ["negative position", resolvedResponse(`nameRange: { start: { line: -1, character: 13 }, end: { line: 0, character: 17 } }`)],
    ["reversed range", resolvedResponse(`nameRange: { start: { line: 0, character: 17 }, end: { line: 0, character: 13 } }`)],
    ["empty range", resolvedResponse(`nameRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 13 } }`)],
    ["missing support", resolvedResponse(`supportUris: undefined`)],
  ]) {
    await t.test(label, async (t) => {
      const fixture = await createFixture(t, expression)
      await assert.rejects(fixture.index.resolveClassBaseBinding(fixture.workspace.id, fixture.query()),
        error => error.name === "SidecarProtocolError")
      assert.equal((await fixture.index.status(fixture.workspace.id)).state, "degraded")
    })
  }
})

test("rejects foreign overlays before sidecar IO and leaves the workspace session usable", async (t) => {
  const fixture = await createFixture(t)
  const query = fixture.query()
  query.overlays[0].workspaceId = "another-workspace"
  await assert.rejects(fixture.index.resolveClassBaseBinding(fixture.workspace.id, query))
  assert.equal(fixture.requests().filter(request => request.method === "class-bindings/resolve").length, 0)
  assert.equal((await fixture.index.status(fixture.workspace.id)).state, "ready")
})

test("bounds query documents, positions and authoritative overlays before sidecar IO", async (t) => {
  const fixture = await createFixture(t, `({ workspaceIdentity, servedGeneration: 7,
    completeness: "ready", binding: { kind: "unknown" } })`)
  const uri = name => `${fixture.workspace.rootUri}/${name}.ets`
  const invalidQueries = [
    ["too many documents", query => { query.documentUris = Array.from({ length: 129 }, (_, i) => uri(`D${i}`)) }],
    ["duplicate documents", query => { query.documentUris.push(query.documentUris[0]) }],
    ["sparse documents", query => { query.documentUris.length++ }],
    ["duplicate canonical identities", query => { query.documentUris.push(`${fixture.identity}/Child.ets`) }],
    ["target outside requested set", query => { query.documentUri = uri("Unrequested") }],
    ["foreign document", query => { query.documentUris.push("file:///outside/Other.ets") }],
    ["oversized URI", query => { query.documentUris.push(uri("a".repeat(4096))) }],
    ["total URI budget", query => { query.documentUris.push(...Array.from({ length: 32 }, (_, i) => uri(`${i}${"a".repeat(2048)}`))) }],
    ["overlay outside requested set", query => { query.overlays[0].uri = uri("Unrequested") }],
    ["duplicate overlays", query => { query.overlays.push({ ...query.overlays[0] }) }],
    ["sparse overlays", query => { query.overlays.length++ }],
    ["invalid overlay version", query => { query.overlays[0].version = -1 }],
    ["unsafe overlay version", query => { query.overlays[0].version = 9007199254740992 }],
    ["invalid overlay text", query => { query.overlays[0].text = 1 }],
    ["UTF-8 overlay byte limit", query => { query.overlays[0].text = "😀".repeat(524289) }],
    ["total overlay byte limit", query => {
      query.documentUris = Array.from({ length: 5 }, (_, i) => uri(i === 0 ? "Child" : `D${i}`))
      query.overlays = query.documentUris.map(documentUri => ({ ...query.overlays[0], uri: documentUri, text: "a".repeat(2097152) }))
    }],
    ["invalid generation", query => { query.expectedGeneration = -1 }],
    ["unsafe generation", query => { query.expectedGeneration = 9007199254740992 }],
    ["invalid position", query => { query.classNamePosition.character = 0.5 }],
    ["out of wire range position", query => { query.classNamePosition.line = 4294967296 }],
  ]
  for (const [label, alter] of invalidQueries) {
    await t.test(label, async () => {
      const query = fixture.query()
      alter(query)
      await assert.rejects(fixture.index.resolveClassBaseBinding(fixture.workspace.id, query),
        error => error.name !== "SidecarProtocolError")
    })
  }
  assert.equal(fixture.requests().filter(request => request.method === "class-bindings/resolve").length, 0)
  assert.equal((await fixture.index.status(fixture.workspace.id)).state, "ready")
})

test("discovers persisted and overlay bindings through the real release sidecar without persisting overlays", async (t) => {
  const sidecarPath = path.join(projectRoot, "target/release", process.platform === "win32"
    ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  assert.ok(fs.existsSync(sidecarPath), "build the Rust release sidecar before this public protocol test")
  const fixture = await createFixture(t, undefined, { sidecarPath })
  const query = { ...fixture.query(), overlays: [] }
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, {
    ...query, expectedGeneration: 0,
  }), {
    servedGeneration: 0, completeness: "stale", binding: { kind: "unknown" },
  })
  const child = fixture.query().overlays[0]
  const base = { ...child, uri: query.documentUris[1], text: "export class Base {}\n" }
  await fixture.index.refresh(fixture.workspace.id, 7, [child, base], [])
  const persisted = {
    servedGeneration: 7, completeness: "ready", binding: {
      kind: "resolved", declarationUri: base.uri, name: "Base",
      nameRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 17 } },
      supportUris: [base.uri, child.uri],
    },
  }
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query), persisted)
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, {
    ...query, overlays: [{ ...child, version: 3, text: "\nclass Child {}" }],
  }), { servedGeneration: 7, completeness: "ready", binding: { kind: "no-base" } })
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, {
    ...query, overlays: [{ ...child, version: 4,
      text: "import { Ghost } from './Missing.ets';\nclass Child extends Ghost {}" }],
  }), { servedGeneration: 7, completeness: "ready", binding: { kind: "unknown" } })
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query), persisted)
  await fixture.index.close(fixture.workspace.id)
  await fixture.index.open(fixture.workspace, fixture.cacheDir)
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, query), {
    servedGeneration: 7, completeness: "stale", binding: { kind: "unknown" },
  })
  await fixture.index.refresh(fixture.workspace.id, 8, [], [])
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, {
    ...query, expectedGeneration: 8,
  }), { ...persisted, servedGeneration: 8 })
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, {
    ...query, expectedGeneration: 9,
  }), { servedGeneration: 8, completeness: "ready", binding: { kind: "unknown" } })
  await fixture.index.refresh(fixture.workspace.id, 9, [{ ...base, version: 2, text: "export class Other {}" }], [])
  assert.deepEqual(await fixture.index.resolveClassBaseBinding(fixture.workspace.id, {
    ...query, expectedGeneration: 9,
  }), { servedGeneration: 9, completeness: "ready", binding: { kind: "unknown" } })
  assert.equal((await fixture.index.status(fixture.workspace.id)).committedGeneration, 9)
})

function resolvedResponse(override = "") {
  return `({ workspaceIdentity, servedGeneration: 7, completeness: "ready",
    binding: { kind: "resolved", declarationUri: params.documentUris[1], name: "Base",
      nameRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 17 } },
      supportUris: params.documentUris, ...({ ${override} }) } })`
}

async function createFixture(t, resultExpression, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-class-binding-port-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspaceRoot = path.join(root, "workspace")
  const alias = path.join(root, "workspace-alias")
  fs.mkdirSync(workspaceRoot)
  fs.symlinkSync(workspaceRoot, alias, "dir")
  const auditPath = path.join(root, "audit.ndjson")
  const sidecarPath = options.sidecarPath ?? path.join(root, "sidecar.mjs")
  if (!options.sidecarPath) {
    buildSync({
      stdin: { contents: scriptedSidecar(auditPath, resultExpression), resolveDir: projectRoot },
      outfile: sidecarPath, bundle: true, platform: "node", format: "esm", target: "node20",
      banner: { js: "#!/usr/bin/env node" },
    })
    fs.chmodSync(sidecarPath, 0o755)
  }
  const adapterPath = path.join(root, "adapter.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src/index/sidecar-workspace-index.ts")],
    outfile: adapterPath, bundle: true, platform: "node", format: "cjs", target: "node20",
  })
  const { SidecarWorkspaceIndex } = require(adapterPath)
  const index = new SidecarWorkspaceIndex({ sidecarPath, requestTimeoutMs: 500 })
  const workspace = { id: "binding-workspace", rootUri: pathToFileURL(alias).href }
  t.after(() => index.close(workspace.id))
  const cacheDir = path.join(root, "cache")
  await index.open(workspace, cacheDir)
  return {
    index, workspace, cacheDir, identity: pathToFileURL(fs.realpathSync(workspaceRoot)).href,
    requests() { return fs.readFileSync(auditPath, "utf8").trim().split("\n").map(JSON.parse) },
    query() {
      const documentUris = ["Child.ets", "Base.ets"].map(name => pathToFileURL(path.join(alias, name)).href)
      return {
        expectedGeneration: 7, documentUris, documentUri: documentUris[0],
        classNamePosition: { line: 1, character: 6 },
        overlays: [{ uri: documentUris[0], workspaceId: workspace.id, version: 2,
          text: "import { Base } from './Base.ets';\nclass Child extends Base {}" }],
      }
    },
  }
}

function scriptedSidecar(auditPath, resultExpression = `({
  workspaceIdentity, servedGeneration: 7, completeness: "ready",
  binding: { kind: "resolved", declarationUri: params.documentUris[1], name: "Base",
    nameRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 17 } },
    supportUris: params.documentUris },
})`) {
  return `
    import fs from "node:fs";
    import { createInterface } from "node:readline";
    import { pathToFileURL } from "node:url";
    let workspaceIdentity;
    const status = { state: "ready", committedGeneration: 7 };
    createInterface({ input: process.stdin }).on("line", line => {
      const request = JSON.parse(line);
      fs.appendFileSync(${JSON.stringify(auditPath)}, line + "\\n");
      const params = request.params;
      let result;
      if (request.method === "initialize") {
        workspaceIdentity = pathToFileURL(params.workspaceRoot).href;
        result = { workspaceIdentity, status };
      } else if (request.method === "status") result = status;
      else if (request.method === "class-bindings/resolve") result = ${resultExpression};
      else result = {};
      process.stdout.write(JSON.stringify({ protocol: 1, id: request.id, ok: true, result }) + "\\n");
      if (request.method === "shutdown") process.exit(0);
    });
  `
}
