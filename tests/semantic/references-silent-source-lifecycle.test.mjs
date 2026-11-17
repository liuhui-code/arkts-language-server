import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { auditFixture, until, rows, workerLifetime } from "../support/worker-recovery-audit.mjs"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

const evidence = process.env.ARKTS_TEST_NAMESPACE_EVIDENCE_DIR
const runtime = process.env.ARKTS_TEST_REFERENCE_SERVER ? { serverPath: process.env.ARKTS_TEST_REFERENCE_SERVER } : {}
if (evidence) fs.mkdirSync(evidence, { recursive: true })
const location = (uri, line, character) => ({ uri, range: {
  start: { line, character }, end: { line, character: character + 5 },
} })
const ordered = values => [...values].sort((a, b) => a.uri.localeCompare(b.uri)
  || a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character)

for (const mode of ["cached-resident", "uncached-indexed", "uncached-indexed-encoded-name"]) {
test(`complete references discover an unnotified caller: ${mode}`, async t => {
  const f = createReadinessFixture(t, { ARKTS_INDEX_CATALOG_TRACE: "1", ARKTS_MEMORY_BUDGET_MB: undefined,
    ...(mode !== "cached-resident" ? { ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0" } : {}) }, runtime)
  f.sources["Main.ets"] = 'import { Thing } from "./Unopened"\nexport const one = new Thing()\n'
  f.sources["Unopened.ets"] = "export class Thing {}\n"
  for (const [name, text] of Object.entries(f.sources)) fs.writeFileSync(path.join(f.workspace, name), text)
  const expected = [location(f.uri("Main.ets"), 0, 9), location(f.uri("Main.ets"), 1, 23),
    location(f.uri("Unopened.ets"), 0, 13)]
  const lateName = mode === "uncached-indexed-encoded-name" ? "Late 空间😀'!%.ets" : "Late.ets"
  const requests = []
  let character = 24
  const references = async () => {
    const response = await f.session.request("textDocument/references", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character },
      context: { includeDeclaration: true },
    }, { timeoutMs: 15_000 })
    requests.push(response)
    return response
  }
  try {
    await initializeReadinessFixture(f)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    const first = await references()
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.deepEqual(ordered(first.result), ordered(expected))
    const repeated = await references()
    assert.equal(repeated.error, undefined, JSON.stringify(repeated))
    assert.deepEqual(ordered(repeated.result), ordered(expected))
    const hot = await references()
    assert.equal(hot.error, undefined, JSON.stringify(hot))
    assert.deepEqual(ordered(hot.result), ordered(expected))
    if (mode === "cached-resident") assert.ok(f.events().some(e => e.event === "references.cache.hit"),
      "unchanged complete inputs must still allow an answer-cache hit")
    fs.writeFileSync(path.join(f.workspace, lateName), 'import { Thing } from "./Unopened"\nexport const two = new Thing()\n')
    if (mode !== "cached-resident") character = 25 // Same identifier, a different result-cache key.
    const complete = [...expected, location(f.uri(lateName), 0, 9), location(f.uri(lateName), 1, 23)]
    let recovered = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await references()
      if (response.error) { assert.equal(response.error.code, -32803); continue }
      assert.deepEqual(ordered(response.result), ordered(complete), "a complete answer must include the unnotified caller")
      recovered = true
      break
    }
    assert.ok(recovered, "the same session must recover without a watcher hint or restart")
    const deadline = performance.now() + 15_000
    while (!f.events().some(e => e.event === "index.maintenance.phase" && e.scope !== "file"
      && e.outcome === "qualified" && e.indexedDocuments === 3 && e.currentInput === true)) {
      assert.ok(performance.now() < deadline, "the existing Native owner must reconcile the discovered namespace")
      await delay(10)
    }
    if (mode !== "cached-resident") character = 26
    const afterReconcile = await references()
    assert.equal(afterReconcile.error, undefined, JSON.stringify(afterReconcile))
    assert.deepEqual(ordered(afterReconcile.result), ordered(complete))
    if (mode !== "cached-resident") assert.ok(f.events().some(e => e.event === "references.index.accepted"
      && e.candidateFiles === 3), "qualified Native narrowing must recover with the new caller included")
  } finally {
    if (evidence) {
      fs.mkdirSync(evidence, { recursive: true })
      fs.writeFileSync(path.join(evidence, `${mode}-responses.json`), JSON.stringify(requests, null, 2))
      fs.writeFileSync(path.join(evidence, `${mode}-events.json`), JSON.stringify(f.events(), null, 2))
    }
  }
})
}


test("rename includes a silently created caller without an earlier references request", async t => {
  const f = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: undefined }, runtime)
  f.session.capabilities.workspace = { workspaceEdit: { documentChanges: true } }
  f.sources["Main.ets"] = 'import { Thing } from "./Unopened"\nexport const one = new Thing()\n'
  f.sources["Unopened.ets"] = "export class Thing {}\n"
  for (const [name, text] of Object.entries(f.sources)) fs.writeFileSync(path.join(f.workspace, name), text)
  await initializeReadinessFixture(f)
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  fs.writeFileSync(path.join(f.workspace, "Late.ets"), 'import { Thing } from "./Unopened"\nexport const two = new Thing()\n')
  const response = await f.session.request("textDocument/rename", {
    textDocument: { uri: f.uri("Unopened.ets") }, position: { line: 0, character: 14 }, newName: "RenamedThing",
  }, { timeoutMs: 15_000 })
  assert.equal(response.error, undefined, JSON.stringify(response))
  if (evidence) fs.writeFileSync(path.join(evidence, "global-rename-response.json"), JSON.stringify(response, null, 2))
  const actual = response.result.documentChanges.flatMap(change => change.edits.map(edit => ({
    uri: change.textDocument.uri, range: edit.range, newText: edit.newText,
  })))
  const expected = [location(f.uri("Main.ets"), 0, 9), location(f.uri("Main.ets"), 1, 23),
    location(f.uri("Unopened.ets"), 0, 13), location(f.uri("Late.ets"), 0, 9), location(f.uri("Late.ets"), 1, 23)]
    .map(value => ({ ...value, newText: "RenamedThing" }))
  assert.deepEqual(ordered(actual), ordered(expected), "complete rename must include all current callers")
})

test("silent content-only caller change after Native narrowing recovers", async t => {
  const f = createReadinessFixture(t, { ARKTS_INDEX_CATALOG_TRACE: "1", ARKTS_MEMORY_BUDGET_MB: undefined,
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0" })
  f.sources["Main.ets"] = 'import { Thing } from "./Unopened"\nexport const one = new Thing()\n'
  f.sources["Unopened.ets"] = "export class Thing {}\n"
  for (const [name,text] of Object.entries(f.sources)) fs.writeFileSync(path.join(f.workspace,name),text)
  fs.writeFileSync(path.join(f.workspace,"Dormant.ets"),"export const unrelated = 0\n")
  const responses = []
  const query = async character => {
    const r = await f.session.request("textDocument/references", { textDocument:{uri:f.uri("Main.ets")},
      position:{line:1,character},context:{includeDeclaration:true} },{timeoutMs:15000})
    responses.push(r); return r
  }
  try {
    await initializeReadinessFixture(f,3)
    f.session.openDocument({uri:f.uri("Main.ets"),version:1,text:f.sources["Main.ets"]})
    const first = await query(24); assert.equal(first.error,undefined);assert.equal(first.result.length,3)
    const end=performance.now()+15000
    while (!f.events().some(e=>e.event==="index.maintenance.phase"&&e.outcome==="qualified"&&e.inputRevision>=f.initialIndexQualification.inputRevision&&e.currentInput)) {
      assert.ok(performance.now()<end); await delay(10)
    }
    const indexed=await query(25);assert.equal(indexed.error,undefined);assert.equal(indexed.result.length,3)
    assert.ok(f.events().some(e=>e.event==="references.index.accepted"&&e.candidateFiles===2))
    const previousHead = f.events().filter(e=>e.event==="index.maintenance.phase"&&e.outcome==="qualified"&&e.currentInput).at(-1).head
    fs.writeFileSync(path.join(f.workspace,"Dormant.ets"),'import { Thing } from "./Unopened"\nexport const two = new Thing()\n')
    const after=await query(26);assert.equal(after.error,undefined,JSON.stringify(after))
    assert.equal(after.result.length,5,"a current complete answer must include the changed existing caller")
    assert.equal(after.result.filter(x=>x.uri===f.uri("Dormant.ets")).length,2)
    const finish = performance.now()+15000
    let qualified
    while (!(qualified=f.events().find(e=>e.event==="index.maintenance.phase"&&e.outcome==="qualified"
      && e.currentInput&&e.head>previousHead))) {
      assert.ok(performance.now()<finish,"content discovery must restore a qualified Native head")
      await delay(10)
    }
    assert.equal(qualified.writtenDocuments,1,"content-only change must write one file's facts")
    assert.equal(qualified.reusedDocuments,2)
    assert.ok(f.events().some(e=>e.event==="references.namespace.reconcile"&&e.kind==="content"))
    const narrowed=await query(27);assert.equal(narrowed.error,undefined);assert.equal(narrowed.result.length,5)
    assert.ok(f.events().some(e=>e.event==="references.index.accepted"&&e.candidateFiles===3))
  } finally {
    if (evidence) {
      fs.writeFileSync(path.join(evidence,"silent-existing-caller-responses.json"),JSON.stringify(responses,null,2))
      fs.writeFileSync(path.join(evidence,"silent-existing-caller-events.json"),JSON.stringify(f.events(),null,2))
    }
  }
})

test("Native ignored caller must not narrow a complete semantic scope",async t=>{
 const f=createReadinessFixture(t,{ARKTS_MEMORY_BUDGET_MB:undefined,ARKTS_REFERENCES_RESIDENT_FAST_PATH:"0",ARKTS_INDEX_CATALOG_TRACE:"1"},runtime)
 f.sources["Main.ets"]='import { Thing } from "./Unopened"\nexport const one = new Thing()\n'
 f.sources["Unopened.ets"]='export class Thing {}\n'
 for(const [n,c]of Object.entries(f.sources))fs.writeFileSync(path.join(f.workspace,n),c)
 fs.writeFileSync(path.join(f.workspace,"Dormant.ets"),'import { Thing } from "./Unopened"\nexport const two = new Thing()\n')
 fs.writeFileSync(path.join(f.workspace,".gitignore"),"Dormant.ets\n")
 const responses=[]
 const query=async character=>{const r=await f.session.request("textDocument/references",{textDocument:{uri:f.uri("Main.ets")},position:{line:1,character},context:{includeDeclaration:true}},{timeoutMs:15000});responses.push(r);return r}
 try{
  await initializeReadinessFixture(f,2)
  f.session.openDocument({uri:f.uri("Main.ets"),version:1,text:f.sources["Main.ets"]})
  const first=await query(24);assert.equal(first.error,undefined,JSON.stringify(first));assert.equal(first.result.length,5)
  const end=performance.now()+15000
  while(!f.events().some(e=>e.event==="index.maintenance.phase"&&e.outcome==="qualified"&&e.inputRevision>=f.initialIndexQualification.inputRevision&&e.currentInput)){assert.ok(performance.now()<end);await delay(10)}
  const next=await query(25);assert.equal(next.error,undefined,JSON.stringify(next));assert.equal(next.result.length,5,"Native readiness is not proof that its ignored scope covers semantic callers")
 }finally{if(evidence){fs.writeFileSync(path.join(evidence,"semantic-native-scope-responses.json"),JSON.stringify(responses,null,2));fs.writeFileSync(path.join(evidence,"semantic-native-scope-events.json"),JSON.stringify(f.events(),null,2))}}
})


test("rename rejects a namespace changed after its Program was captured and recovers in-session",
  { timeout: 25_000 }, async t => {
    const f = await auditFixture(t, "rename-inflight-namespace", { env: {
      ARKTS_MEMORY_BUDGET_MB: undefined, ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "4000",
    } })
    f.sources["Main.ets"] = 'import { Thing } from "./Unopened"\nexport const one = new Thing()\n'
    f.sources["Unopened.ets"] = "export class Thing {}\n"
    for (const [name, text] of Object.entries(f.sources)) fs.writeFileSync(path.join(f.workspace, name), text)
    await f.initialize()
    f.session.openDocument({ uri: f.uri("Unopened.ets"), version: 1,
      text: "// changed declaration input\n" + f.sources["Unopened.ets"] })
    f.write("audit-controls.json", { gate: { stage: "checker", remaining: 1 } })
    const params = { textDocument: { uri: f.uri("Unopened.ets") },
      position: { line: 1, character: 14 }, newName: "RenamedThing" }
    const pending = f.request("textDocument/rename", params, { timeoutMs: 15_000 })
    await until(() => fs.existsSync(path.join(f.directory, "audit-gate-entered.json")), "rename checker after Program capture")
    f.report.observations.compilerGate = f.read("audit-gate-entered.json")
    const late = 'import { Thing } from "./Unopened"\nexport const two = new Thing()\n'
    fs.writeFileSync(path.join(f.workspace, "Late.ets"), late)
    f.report.observations.externalChange = { at: new Date().toISOString(), path: path.join(f.workspace, "Late.ets"),
      text: late, notification: "none" }
    f.release()
    const stale = await pending
    f.report.observations.staleRename = stale
    assert.ok([-32801, -32803].includes(stale.error?.code),
      "a rename captured before the new caller must not publish an incomplete edit set: " + JSON.stringify(stale))
    const current = await f.request("textDocument/rename", params, { timeoutMs: 15_000 })
    f.report.observations.currentRename = current
    assert.equal(current.error, undefined, JSON.stringify(current))
    const edits = current.result.documentChanges.flatMap(change => change.edits.map(edit => ({
      uri: change.textDocument.uri, range: edit.range, newText: edit.newText,
    })))
    const expected = [location(f.uri("Main.ets"), 0, 9), location(f.uri("Main.ets"), 1, 23),
      location(f.uri("Unopened.ets"), 1, 13), location(f.uri("Late.ets"), 0, 9), location(f.uri("Late.ets"), 1, 23)]
      .map(value => ({ ...value, newText: "RenamedThing" }))
    assert.deepEqual(ordered(edits), ordered(expected))
  })


for (const placement of ["nested", "source-root"]) {
test(`managed cache leaf is excluded without excluding source siblings: ${placement}`,
  { timeout: 25_000 }, async t => {
    const cacheRelative = placement === "source-root" ? "" : "Cache"
    const caseEvidence = evidence && path.join(evidence, "managed-" + placement)
    if (caseEvidence) fs.mkdirSync(caseEvidence, { recursive: true })
    const f = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_INDEX_CATALOG_TRACE: "1" },
    { ...runtime, indexCacheDirectory: workspace => path.join(workspace, cacheRelative) })
    const cacheRoot = path.join(f.workspace, cacheRelative)
    fs.mkdirSync(cacheRoot, { recursive: true })
    const siblingSpecifier = cacheRelative ? "../Unopened" : "./Unopened"
    const sibling = `import { neverQueried } from "${siblingSpecifier}"\nexport const sibling = neverQueried()\n`
    fs.writeFileSync(path.join(cacheRoot, "User.ets"), sibling)
    await initializeReadinessFixture(f, 3)
    const leaves = fs.readdirSync(path.join(cacheRoot, "workspaces")).filter(name => /^[a-f0-9]{64}$/.test(name))
    assert.equal(leaves.length, 1, "use the actual Native-created workspace cache, not a guessed directory")
    const leaf = path.join(cacheRoot, "workspaces", leaves[0])
    assert.ok(fs.existsSync(path.join(leaf, "cache-use.json")), "Native has acquired this managed cache")
    const leafRelative = path.relative(f.workspace, leaf)
    const specifier = path.relative(leaf, path.join(f.workspace, "Unopened")).split(path.sep).join("/")
    const artifact = `import { neverQueried } from "${specifier}"\nexport const generated = neverQueried()\n`
    fs.writeFileSync(path.join(leaf, "Generated.ets"), artifact)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    const response = await f.session.request("textDocument/references", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 },
      context: { includeDeclaration: true },
    }, { timeoutMs: 15_000 })
    if (caseEvidence) {
      fs.writeFileSync(path.join(caseEvidence, "managed-cache-source-tree-response.json"), JSON.stringify(response, null, 2))
      fs.writeFileSync(path.join(caseEvidence, "managed-cache-source-tree-events.json"), JSON.stringify(f.events(), null, 2))
    }
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.equal(response.result.length, 5, "the managed leaf is not a project source namespace")
    assert.equal(response.result.filter(location => location.uri === f.uri(path.join(cacheRelative, "User.ets"))).length, 2,
      "the cache-root sibling is still user source")
    assert.ok(response.result.every(location => !location.uri.includes(leaves[0])),
      "owned cache content must not become a semantic caller")
    const deadline = performance.now() + 15_000
    let qualified
    while (!(qualified = f.events().find(event => event.event === "index.maintenance.phase"
      && event.outcome === "qualified" && event.currentInput && event.inputRevision >= f.initialIndexQualification.inputRevision))) {
      assert.ok(performance.now() < deadline, "Native must finish its namespace reconciliation")
      await delay(10)
    }
    const symbols = await f.session.request("workspace/symbol", { query: "generated" })
    if (caseEvidence) fs.writeFileSync(path.join(caseEvidence, "managed-cache-native-reconcile.json"),
      JSON.stringify({ qualified, symbols, events: f.events() }, null, 2))
    assert.equal(qualified.indexedDocuments, 3, "Native must use the same owned-leaf exclusion as semantic membership")
    assert.equal(symbols.error, undefined, JSON.stringify(symbols))
    assert.deepEqual(symbols.result, [], "private cached content must not become a workspace symbol")
    const narrowedParams = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 26 },
      context: { includeDeclaration: true } }
    const narrowed = await f.session.request("textDocument/references", narrowedParams, { timeoutMs: 15_000 })
    assert.equal(narrowed.error, undefined, JSON.stringify(narrowed))
    assert.deepEqual(ordered(narrowed.result), ordered(response.result))
    assert.ok(f.events().some(event => event.event === "references.index.accepted" && event.candidateFiles === 3),
      "the reconciled Native scope must regain qualified narrowing, not perpetual fallback")
    await f.session.request("textDocument/references", narrowedParams, { timeoutMs: 15_000 })
    const hits = () => f.events().filter(event => event.event === "references.cache.hit").length
    const beforeHits = hits()
    const reconciles = f.events().filter(event => event.event === "references.namespace.reconcile").length
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes: [
      { uri: f.uri(path.join(leafRelative, "Generated.ets")), type: 2 },
      { uri: f.uri(leafRelative), type: 2 },
      { uri: f.uri(path.join(leafRelative, "symbols-v2.sqlite3-wal")), type: 3 },
    ] } })
    const afterWatch = await f.session.request("textDocument/references", narrowedParams, { timeoutMs: 15_000 })
    assert.equal(afterWatch.error, undefined, JSON.stringify(afterWatch))
    assert.deepEqual(ordered(afterWatch.result), ordered(response.result))
    assert.equal(hits(), beforeHits + 1, "owned cache watcher churn must not invalidate the source answer cache")
    assert.equal(f.events().filter(event => event.event === "references.namespace.reconcile").length, reconciles)
    if (caseEvidence) fs.writeFileSync(path.join(caseEvidence, "managed-cache-watch-and-candidates.json"),
      JSON.stringify({ narrowed, afterWatch, beforeHits, afterHits: hits(), events: f.events() }, null, 2))
  })
}

test("replacing an owned cache leaf revokes its source exclusion without stamping the replacement",
  { timeout: 25_000, skip: process.platform === "win32" }, async t => {
    const f = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_INDEX_CATALOG_TRACE: "1" },
    { ...runtime, indexCacheDirectory: workspace => path.join(workspace, "Cache") })
    await initializeReadinessFixture(f)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    const query = character => f.session.request("textDocument/references", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character },
      context: { includeDeclaration: true },
    }, { timeoutMs: 10_000 })
    const initial = await query(25)
    assert.equal(initial.error, undefined, JSON.stringify(initial))
    assert.equal(initial.result.length, 3)
    const deadline = performance.now() + 10_000
    while (!f.events().some(event => event.event === "index.maintenance.phase" && event.outcome === "qualified"
      && event.currentInput && event.inputRevision >= f.initialIndexQualification.inputRevision)) {
      assert.ok(performance.now() < deadline, "finish the previous Native reconciliation before replacing its directory")
      await delay(10)
    }
    const cache = path.join(f.workspace, "Cache/workspaces")
    const [key] = fs.readdirSync(cache).filter(name => /^[a-f0-9]{64}$/.test(name))
    const leaf = path.join(cache, key)
    fs.renameSync(leaf, path.join(f.directory, "retired-cache"))
    fs.mkdirSync(leaf)
    const relative = path.relative(f.workspace, leaf)
    const content = 'import { neverQueried } from "../../../Unopened"\nexport const recovered = neverQueried()\n'
    const recovered = path.join(leaf, "Recovered.ets")
    fs.writeFileSync(recovered, content)
    const responses = []
    try {
      let complete
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await query(26)
        responses.push(response)
        if (response.error) { assert.ok([-32801, -32803].includes(response.error.code), JSON.stringify(response)); continue }
        const extra = [0, 1].map(line => ({ uri: f.uri(path.join(relative, "Recovered.ets")), range: {
          start: { line, character: content.split("\n")[line].indexOf("neverQueried") },
          end: { line, character: content.split("\n")[line].indexOf("neverQueried") + 12 },
        } }))
        assert.deepEqual(ordered(response.result), ordered([...initial.result, ...extra]))
        complete = response
        break
      }
      assert.ok(complete, "current sources recover in the same LSP session")
      await f.session.request("workspace/symbol", { query: "recovered" })
      const closed = await f.session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.equal(fs.readFileSync(recovered, "utf8"), content)
      const entries = fs.readdirSync(leaf).sort()
      if (evidence) fs.writeFileSync(path.join(evidence, "replacement-leaf-entries.json"), JSON.stringify(entries, null, 2))
      assert.deepEqual(entries, ["Recovered.ets"], "the retired Native owner must not initialize or stamp this new source directory")
    } finally {
      if (evidence) {
        fs.writeFileSync(path.join(evidence, "replacement-responses.json"), JSON.stringify(responses, null, 2))
        fs.writeFileSync(path.join(evidence, "replacement-events.json"), JSON.stringify(f.events(), null, 2))
      }
    }
  })


test("a replacement semantic Worker restores the live managed namespace before serving references",
  { timeout: 30_000 }, async t => {
    const f = await auditFixture(t, "managed-namespace-worker-replay", {
      loader: "registry-release-audit.cjs",
      env: { ARKTS_MEMORY_BUDGET_MB: undefined, ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
        ARKTS_INDEX_CATALOG_TRACE: "1" },
      fixtureRuntime: { indexCacheDirectory: workspace => path.join(workspace, "Cache") },
    })
    fs.mkdirSync(path.join(f.workspace, "Cache"), { recursive: true })
    fs.writeFileSync(path.join(f.workspace, "Cache/User.ets"),
      'import { neverQueried } from "../Unopened"\nexport const use = neverQueried()\n')
    await initializeReadinessFixture(f, 3)
    const cache = path.join(f.workspace, "Cache/workspaces")
    const [key] = fs.readdirSync(cache).filter(name => /^[a-f0-9]{64}$/.test(name))
    fs.writeFileSync(path.join(cache, key, "Generated.ets"),
      'import { neverQueried } from "../../../Unopened"\nexport const generated = neverQueried()\n')
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 },
      context: { includeDeclaration: true } }
    const before = await f.request("textDocument/references", params, { timeoutMs: 10_000 })
    assert.equal(before.error, undefined, JSON.stringify(before))
    assert.equal(before.result.length, 5)
    await until(() => f.events().some(event => event.event === "index.maintenance.phase"
      && event.outcome === "qualified" && event.currentInput && event.inputRevision >= f.initialIndexQualification.inputRevision), "qualified managed scope")
    for (let attempt = 0; attempt < 3 && !f.events().some(event => event.event === "references.cache.hit"); attempt++) {
      const warm = await f.request("textDocument/references", params, { timeoutMs: 10_000 })
      assert.equal(warm.error, undefined, JSON.stringify(warm))
      assert.deepEqual(ordered(warm.result), ordered(before.result))
    }
    assert.ok(f.events().some(event => event.event === "references.cache.hit"))
    assert.equal(rows(f).filter(row => row.event === "created").length, 1)
    f.write("build-fault.json", { stage: "exit-idle", remaining: 1 })
    await until(() => f.events().filter(event => event.event === "semantic.worker.recovery.complete").length === 1,
      "one actual semantic Worker replacement")
    const after = await f.request("textDocument/references", params, { timeoutMs: 10_000 })
    assert.equal(after.error, undefined, JSON.stringify(after))
    assert.deepEqual(ordered(after.result), ordered(before.result))
    const readiness = await f.readiness(false)
    assert.equal(readiness.error, undefined, JSON.stringify(readiness))
    assert.equal(readiness.result.sourceNamespace.sources, 3, "new Worker membership excludes the managed leaf")
    assert.equal(rows(f).filter(row => row.event === "created").length, 2)
    assert.equal(workerLifetime(f).peak, 1)
    f.report.observations.references = { before, after }
    f.report.observations.readiness = readiness
  })
