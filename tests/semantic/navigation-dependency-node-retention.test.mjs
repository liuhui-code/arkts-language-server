import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("saving one body in a dependency cycle retains unrelated node bindings and fresh semantic content",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const body${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const query = () => f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    const exact = async () => {
      const response = await query()
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    }
    await exact(); await exact()
    const file = path.join(sourceRoot, "Unused350.ts"), original = fs.readFileSync(file, "utf8")
    for (const text of [original.replace("= 350", "= 350 + 1"), original]) {
      fs.writeFileSync(file, text)
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
        changes: [{ uri: f.uri(`${folder}/Unused350.ts`), type: 2 }] } })
      await exact()
      const rows = fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
      const observed = rows.filter(row => row.method === "typeDefinitions").at(-1)
      t.diagnostic(JSON.stringify({ changed: "Unused350.ts", observed }))
      assert.deepEqual(observed.replacements, ["Unused349.ts", "Unused350.ts"],
        "only the changed source and its resolution-proof consumer require replacement")
      assert.equal(observed.resolutions.length, 2)
      assert.equal(observed.topologyScans, 0, "unchanged topology must not rescan all graph entries")
      assert.equal(observed.inputInfluenceBuilds, 0, "a body-only save must not recompute influence sets")
      const hover = await f.session.request("textDocument/hover", { textDocument: {
        uri: f.uri(`${folder}/Unused350.ts`) }, position: positionAt(text, text.indexOf("body350") + 1) })
      assert.equal(hover.error, undefined, JSON.stringify(hover))
      assert.match(JSON.stringify(hover.result), text === original ? /body350: 350/ : /body350: number/)
      assert.deepEqual(observed.roleDirectoryInputs, [], "unchanged immutable role catalog must not be projected again for a local body delta")
      assert.equal(observed.ownerRetentionVisits, 0, "a local repair must not mark every unchanged binding owner used again")
    }
    assert.equal(fs.readFileSync(file, "utf8"), original)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


for (const changeKind of ["topology", "body"]) test(changeKind === "topology"
  ? "cancellation after an actual changed node commit preserves pending topology until the retry publishes it"
  : "cancellation during same-role local repair releases drafts and retries on the same Worker",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const body${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text: main })
    const baseline = await f.session.request("textDocument/typeDefinition", { textDocument: { uri },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(baseline.error, undefined, JSON.stringify(baseline))
    const file = path.join(sourceRoot, "Unused350.ts"), name = changeKind === "body" ? "GlobalThing" : "AfterCancelledGraph"
    const declaration = changeKind === "body" ? fs.readFileSync(file, "utf8").replace("= 350", "= 350 + 1") : `class ${name} {}\n`
    const text = changeKind === "body" ? main : main + `\nexport const changed = new ${name}()\n`
    fs.writeFileSync(file, declaration)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
      changes: [{ uri: f.uri(`${folder}/Unused350.ts`), type: 2 }] } })
    f.session.changeDocument({ uri, version: 2, text })
    const signals = path.join(f.directory, "logs")
    fs.writeFileSync(path.join(signals, "arm-node-catalog.json"), JSON.stringify({ file }))
    const params = { textDocument: { uri }, position: positionAt(text, text.indexOf(name) + 1) }
    const waitFor = async name => {
      const deadline = Date.now() + 5000
      while (!fs.existsSync(path.join(signals, name))) {
        assert.ok(Date.now() < deadline, `actual ${name} boundary must be reached`)
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    }
    f.session.transport.send({ jsonrpc: "2.0", id: 81, method: "textDocument/typeDefinition", params })
    try {
      await waitFor("node-catalog-paused")
      const paused = JSON.parse(fs.readFileSync(path.join(signals, "node-catalog-paused"), "utf8"))
      f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 81 } })
      const acknowledgement = `node-cancel-${paused.workerRequestId}-1.json`
      await waitFor(acknowledgement)
      const cancellation = JSON.parse(fs.readFileSync(path.join(signals, acknowledgement), "utf8"))
      t.diagnostic(JSON.stringify({ cancellation }))
      assert.equal(cancellation.method, "typeDefinitions")
      assert.equal(cancellation.winner, 1)
    } finally { fs.writeFileSync(path.join(signals, "resume-node-catalog"), "resume") }
    const cancelled = await f.session.transport.response(81, 10_000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    const retry = await f.session.request("textDocument/typeDefinition", params)
    const rows = fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    const paused = JSON.parse(fs.readFileSync(path.join(signals, "node-catalog-paused"), "utf8"))
    assert.ok(paused.threadId > 0)
    const cancelledObservation = rows.find(row => row.id === paused.workerRequestId)
    assert.ok(cancelledObservation)
    assert.ok(cancelledObservation.graphStates.some(state => state.graphId === paused.graphId && state.rebuilding))
    assert.ok(rows.at(-1).graphStates.some(state => state.graphId === paused.graphId && !state.rebuilding))
    const evidence = { publicCancelledId: 81, paused, params, source: { declaration, main: text },
      cancelledResponse: cancelled, retryResponse: retry,
      cancelled: cancelledObservation, retried: rows.at(-1) }
    t.diagnostic(JSON.stringify(evidence))
    if (process.env.ARKTS_NODE_RETENTION_EVIDENCE_DIR) {
      const output = path.join(process.env.ARKTS_NODE_RETENTION_EVIDENCE_DIR, path.basename(f.directory))
      fs.mkdirSync(output, { recursive: true })
      fs.cpSync(path.join(f.directory, "logs"), path.join(output, "logs"), { recursive: true })
      fs.copyFileSync(path.join(f.directory, "graph-node-retention.jsonl"), path.join(output, "graph-node-retention.jsonl"))
      fs.writeFileSync(path.join(output, "input-results.json"), JSON.stringify(evidence, null, 2) + "\n")
      await f.session.transport.writeFailureEvidence(output, { name: "lsp" })
    }
    assert.equal(retry.error, undefined, JSON.stringify(retry))
    assert.deepEqual(retry.result, [{ uri: f.uri(`${folder}/${changeKind === "body" ? "Global.ets" : "Unused350.ts"}`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 6 + name.length } } }])
    if (changeKind === "body") {
      assert.deepEqual(cancelledObservation.roleDirectoryInputs, [], "actual cancellation occurred in local repair")
      assert.equal(cancelledObservation.ownerRetentionVisits, 0)
      assert.ok(cancelledObservation.graphStates.every(state => state.draftOwners === 0))
      assert.equal(rows.at(-1).graphStates.at(-1).bindingReferences, 402)
      const hover = await f.session.request("textDocument/hover", { textDocument: {
        uri: f.uri(`${folder}/Unused350.ts`) }, position: positionAt(declaration, declaration.indexOf("body350") + 1) })
      assert.equal(hover.error, undefined, JSON.stringify(hover))
      assert.match(JSON.stringify(hover.result), /body350: number/)
    }
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("opening one unchanged overlay retains unrelated dependency-cycle binding owners",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const body${i} = ${i}\n`)
    // A whole-root alias exercises actual physical/logical spelling on every OS.
    const physical = f.workspace + "-physical"
    fs.renameSync(f.workspace, physical)
    fs.symlinkSync(physical, f.workspace, process.platform === "win32" ? "junction" : "dir")
    const rows = () => fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const exact = async () => {
      const result = await f.session.request("textDocument/typeDefinition", { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
        position: positionAt(main, main.indexOf("GlobalThing") + 1) })
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.deepEqual(result.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    await exact(); await exact()
    const before = rows().length, uri = f.uri(`${folder}/Unused350.ts`)
    const text = fs.readFileSync(path.join(sourceRoot, "Unused350.ts"), "utf8")
    const diagnosed = f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === uri && m.params.version === 1, 20_000)
    f.session.openDocument({ uri, version: 1, text })
    await diagnosed; await exact()
    const observed = rows().slice(before)
    t.diagnostic(JSON.stringify({ observed }))
    assert.ok(observed.some(row => row.aliasTransitions.some(change => change.beforeOwners >= 400)),
      "exercise a real populated physical/logical alias transition")
    assert.deepEqual(observed.flatMap(row => row.resolutions)
      .filter(([file]) => !["Unused349.ts", "Unused350.ts"].includes(file)), [],
    "one overlay must not re-resolve unchanged unrelated dependency owners, including in diagnostics")
    for (const action of ["edit", "undo", "close", "reopen"]) {
      const start = rows().length
      const changed = action === "edit" ? text.replace("= 350", "= 350 + 1") : text
      if (action === "close") f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
        params: { textDocument: { uri } } })
      else {
        const version = action === "edit" ? 2 : action === "undo" ? 3 : 1
        const ready = f.session.transport.notification("textDocument/publishDiagnostics",
          m => m.params.uri === uri && m.params.version === version, 20_000)
        if (action === "reopen") f.session.openDocument({ uri, version, text: changed })
        else f.session.changeDocument({ uri, version, text: changed })
        await ready
      }
      await exact()
      const after = rows().slice(start)
      t.diagnostic(JSON.stringify({ action, observed: after }))
      assert.deepEqual(after.flatMap(row => row.resolutions)
        .filter(([file]) => !["Unused349.ts", "Unused350.ts"].includes(file)), [],
      `${action} cannot invalidate unrelated resolution owners`)
      const hover = await f.session.request("textDocument/hover", { textDocument: { uri },
        position: positionAt(changed, changed.indexOf("body350") + 1) })
      assert.equal(hover.error, undefined, JSON.stringify(hover))
      assert.match(JSON.stringify(hover.result), action === "edit" ? /body350: number/ : /body350: 350/)
    }
    assert.equal(fs.readFileSync(path.join(sourceRoot, "Unused350.ts"), "utf8"), text)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("topology changes maintain reverse edges without rebuilding an unchanged graph's entire edge index",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const body${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const name = "IncrementalGraphGlobal", uri = f.uri(`${folder}/Main.ets`)
    const text = main + `\nexport const topologyProbe = new ${name}()\n`
    f.session.openDocument({ uri, version: 1, text })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === uri && m.params.version === 1, 10_000)
    const query = () => f.session.request("textDocument/typeDefinition", {
      textDocument: { uri }, position: positionAt(text, text.indexOf(name) + 1) })
    const warm = await query()
    assert.equal(warm.error, undefined, JSON.stringify(warm))
    assert.deepEqual(warm.result, [])
    const file = path.join(sourceRoot, "Unused350.ts"), original = fs.readFileSync(file, "utf8")
    for (const content of [`class ${name} {}\n`, original, `class ${name} {}\n`, null, original]) {
      const type = content === null ? 3 : fs.existsSync(file) ? 2 : 1
      if (content === null) fs.unlinkSync(file)
      else fs.writeFileSync(file, content)
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
        changes: [{ uri: f.uri(`${folder}/Unused350.ts`), type }] } })
      const result = await query()
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.deepEqual(result.result, !content || content === original ? [] : [{ uri: f.uri(`${folder}/Unused350.ts`),
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 6 + name.length } } }])
      const rows = fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      const observed = rows.filter(row => row.method === "typeDefinitions").at(-1)
      t.diagnostic(JSON.stringify({ topologyChanged: true, observed }))
      assert.ok(observed.inputInfluenceBuilds > 0, "a real topology change must update influence")
      assert.equal(observed.topologyScans, 0,
        "changed edges must update their reverse index without enumerating every node again")
      if (type === 2) {
        assert.deepEqual(observed.roleDirectoryInputs, [], "a complete existing-member role delta must not reconstruct the entire role directory")
        assert.equal(observed.ownerRetentionVisits, 0)
      } else {
        assert.deepEqual(observed.roleDirectoryInputs, [type === 3 ? 403 : 404],
          "actual source removal/recreation retains the explicit complete-membership fallback")
      }
    }
    assert.equal(fs.readFileSync(file, "utf8"), original)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("shared resolution ownership stays bounded across repeated saved bodies and duplicate import requests",
  { timeout: 60_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
    for (let i = 0; i < 64; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), 'import "./Box"\nexport {}\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const read = () => fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    const first = read().flatMap(row => row.resolutions).find(([, name]) => name === "./Box")
    assert.ok(first, "select the actual shared owner's original containing source")
    const file = path.join(sourceRoot, first[0]), original = fs.readFileSync(file, "utf8")
    const query = async () => {
      const response = await f.session.request("textDocument/typeDefinition", { textDocument: {
        uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
      return read().filter(row => row.method === "typeDefinitions").at(-1)
    }
    await query()
    try {
      for (let round = 0; round < 8; round++) {
        fs.writeFileSync(file, original + `\n// saved body revision ${round}\n`)
        f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
          changes: [{ uri: f.uri(`${folder}/${first[0]}`), type: 2 }] } })
        const row = await query(), state = row.graphStates.at(-1)
        assert.deepEqual(row.roleDirectoryInputs, [])
        assert.equal(row.ownerRetentionVisits, 0)
        assert.equal(state.bindingOwners, 1)
        assert.equal(state.liveBindingOwners, 1)
        assert.equal(state.bindingReferences, 66, "64 importers plus Main and Augment; duplicate declarations do not double-acquire")
        assert.equal(state.sourceReferences, 66)
        assert.equal(state.draftOwners, 0)
      }
    } finally { fs.writeFileSync(file, original) }
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
      changes: [{ uri: f.uri(`${folder}/${first[0]}`), type: 2 }] } })
    await query()
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
