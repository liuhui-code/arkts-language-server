import assert from "node:assert/strict"
import test from "node:test"

import { applyTextEdits } from "../support/lsp-edits.mjs"
import {
  assertNavigation, canonicalCompletion, createFixture, diagnostic, location,
  positionAt, readEvents, selectedL03Policy, startSession, waitForEvent, warmAndPromote,
} from "../support/resident-interactive-lsp.mjs"


test("L06 selected policy reuses the complete compiler for previously unqueried navigation and completion",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    const warm = readEvents(fixture).find(event => event.event === "semantic.implementation.complete")
    await assertNavigation(session, fixture)
    const source = fixture.sources["ZConsumer.ets"]
    const completion = await session.request("textDocument/completion", {
      textDocument: { uri: fixture.uri("ZConsumer.ets") },
      position: positionAt(source, source.lastIndexOf("value")),
    }, { timeoutMs: 20_000 })
    assert.equal(completion.error, undefined, JSON.stringify(completion.error))
    assert.equal(completion.result.isIncomplete, false)
    assert.deepEqual(completion.result.items.map(item => item.label).sort(), ["run", "value"])
    const events = readEvents(fixture)
    const definition = events.find(event => event.event === "semantic.definition.complete")
    const completed = events.findLast(event => event.event === "completion.program.complete")
    assert.ok(warm.programProjectFiles >= 276 && definition.programProjectFiles >= 276)
    assert.equal(definition.programSequence, warm.programSequence)
    assert.equal(definition.createProgramEvents, 0)
    assert.equal(completed.programSequence, definition.programSequence)
    assert.ok(!events.some(event => ["references.cache.hit", "references.batch.start"].includes(event.event)))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })


test("promoted interactive navigation preserves complete definition, type, hover and signature payloads",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const observations = []
    for (const enabled of [false, true]) {
      const session = await startSession(t, fixture, enabled)
      const diagnostics = await warmAndPromote(session, fixture)
      const navigation = await assertNavigation(session, fixture)
      observations.push({ navigation, diagnostics })
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      if (enabled) {
        const admissions = readEvents(fixture).filter(event => event.event === "semantic.prepare.script-admission"
          && event.promotedWithMatchingFingerprint > 0)
        assert.ok(admissions.length > 0, "actually exercise matching lazy-to-resident admission")
        assert.ok(admissions.every(event => event.generationAfter === event.generationBefore))
      }
    }
    assert.deepEqual(observations[1], observations[0])
  })

test("interactive requests immediately observe public API edits and current caller diagnostics",
  { timeout: 60_000 }, async t => {
    for (const env of [{}, selectedL03Policy, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }]) {
      const fixture = createFixture(t)
      const session = await startSession(t, fixture, true, env)
      await warmAndPromote(session, fixture)
      await assertNavigation(session, fixture)
      session.openDocument({ uri: fixture.uri("ZTarget.ets"), version: 1, text: fixture.sources["ZTarget.ets"] })
      assert.deepEqual((await diagnostic(session, fixture.uri("ZTarget.ets"), 1)).params.diagnostics, [])
      const target = '/* changed 😀 */ export class ValueTarget {\n  value: string = "updated"\n'
        + "  run(count: boolean, label: string): string { return label + count }\n}\n"
      session.changeDocument({ uri: fixture.uri("ZTarget.ets"), version: 2, text: target })
      await assertNavigation(session, fixture, { target, valueType: "string", countType: "boolean" })
      assert.deepEqual((await diagnostic(session, fixture.uri("ZTarget.ets"), 2)).params.diagnostics, [])
      const consumer = "// changed caller 😀\n"
        + fixture.sources["ZConsumer.ets"].replace("run(1,", "run(true,")
        + "export const broken: number = selected.value\n"
      session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 2, text: consumer })
      await assertNavigation(session, fixture, { consumer, target, valueType: "string", countType: "boolean" })
      const errors = (await diagnostic(session, fixture.uri("ZConsumer.ets"), 2)).params.diagnostics
      assert.deepEqual(errors.map(item => item.code), [2322])
      assert.deepEqual(errors[0].range,
        location(fixture, "ZConsumer.ets", consumer, consumer.indexOf("broken"), "broken").range)
      const restoredTarget = `// restored target 😀\n${fixture.sources["ZTarget.ets"]}`
      const restoredConsumer = `// restored caller 😀\n${fixture.sources["ZConsumer.ets"]}`
      session.changeDocument({ uri: fixture.uri("ZTarget.ets"), version: 3, text: restoredTarget })
      session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 3, text: restoredConsumer })
      await assertNavigation(session, fixture, { consumer: restoredConsumer, target: restoredTarget })
      for (const name of ["ZTarget.ets", "ZConsumer.ets"]) {
        assert.deepEqual((await diagnostic(session, fixture.uri(name), 3)).params.diagnostics, [])
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("interactive navigation recovers current overlays after a real post-L3 Worker replacement",
  { timeout: 60_000 }, async t => {
    // The 64 MiB profile qualifies physical replacement, not the normal policy budget.
    for (const env of [{ ARKTS_MEMORY_BUDGET_MB: "64" }, { ...selectedL03Policy, ARKTS_MEMORY_BUDGET_MB: "64" }]) {
      const fixture = createFixture(t)
      const session = await startSession(t, fixture, true, { ...env, ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1" })
      await warmAndPromote(session, fixture)
      await assertNavigation(session, fixture)
      const consumer = `// kept across recycle 😀\n${fixture.sources["ZConsumer.ets"]}`
        + 'export const broken: number = "wrong"\n'
      session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 2, text: consumer })
      const errors = (await diagnostic(session, fixture.uri("ZConsumer.ets"), 2)).params.diagnostics
      assert.deepEqual(errors.map(item => item.code), [2322])
      assert.deepEqual(errors[0].range,
        location(fixture, "ZConsumer.ets", consumer, consumer.indexOf("broken"), "broken").range)
      const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
      await waitForEvent(fixture, event => event.event === "semantic.context.evict"
        && event.reason === "memory-level3")
      const recycle = await session.request("arkts/benchmark/recycleSemanticWorker", {}, { timeoutMs: 20_000 })
      assert.equal(recycle.error, undefined, JSON.stringify(recycle.error))
      assert.equal(recycle.result.recycled, true)
      assert.ok(recycle.result.oldThreadId > 0 && recycle.result.newThreadId > 0)
      assert.notEqual(recycle.result.oldThreadId, recycle.result.newThreadId)
      await assertNavigation(session, fixture, { consumer })
      const restored = `// latest after recycle 😀\n${fixture.sources["ZConsumer.ets"]}`
      session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 3, text: restored })
      await assertNavigation(session, fixture, { consumer: restored })
      assert.deepEqual((await diagnostic(session, fixture.uri("ZConsumer.ets"), 3)).params.diagnostics, [])
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
    }
  })

test("promoted member completions preserve full edits, ordering, resolution and client metadata",
  { timeout: 60_000 }, async t => {
    for (const env of [{}, selectedL03Policy, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }]) {
      const fixture = createFixture(t)
      const observations = []
      for (const enabled of [false, true]) {
        const session = await startSession(t, fixture, enabled, env)
        await warmAndPromote(session, fixture)
        const source = fixture.sources["ZConsumer.ets"]
        const offset = source.lastIndexOf("value")
        const response = await session.request("textDocument/completion", {
          textDocument: { uri: fixture.uri("ZConsumer.ets") }, position: positionAt(source, offset),
        }, { timeoutMs: 20_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        assert.equal(response.result.isIncomplete, false)
        assert.deepEqual(response.result.items.map(item => item.label).sort(), ["run", "value"])
        const resolutions = []
        for (const item of response.result.items) {
          assert.deepEqual(item.textEdit, {
            range: location(fixture, "ZConsumer.ets", source, offset, "value").range,
            newText: item.label,
          })
          assert.equal(item.kind, item.label === "run" ? 2 : 5)
          assert.equal(item.insertText, item.label)
          assert.equal(typeof item.sortText, "string")
          assert.equal(item.insertTextFormat, undefined)
          const resolved = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
          assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
          assert.deepEqual(resolved.result.data, item.data)
          assert.deepEqual(resolved.result.textEdit, item.textEdit)
          resolutions.push(canonicalCompletion(resolved.result))
        }
        observations.push({ completion: { ...response.result,
          items: response.result.items.map(canonicalCompletion) }, resolutions })
        assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      }
      assert.deepEqual(observations[1], observations[0])
    }
  })

test("early interactive cancellations publish one error each and navigation recovers",
  { timeout: 60_000 }, async t => {
    for (const env of [{}, selectedL03Policy, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }]) {
      const fixture = createFixture(t)
      const session = await startSession(t, fixture, true, env)
      await warmAndPromote(session, fixture)
      const consumer = fixture.sources["ZConsumer.ets"]
      const completion = await session.request("textDocument/completion", {
        textDocument: { uri: fixture.uri("ZConsumer.ets") },
        position: positionAt(consumer, consumer.lastIndexOf("value")),
      }, { timeoutMs: 20_000 })
      assert.equal(completion.error, undefined, JSON.stringify(completion.error))
      assert.equal(completion.result.isIncomplete, false)
      const item = completion.result.items.find(entry => entry.label === "value")
      assert.ok(item)
      canonicalCompletion(item)
      const ids = new Set()
      for (const [method, offset, extra] of [
        ["definition", consumer.lastIndexOf("value") + 1, {}],
        ["typeDefinition", consumer.lastIndexOf("selected") + 1, {}],
        ["hover", consumer.lastIndexOf("value") + 1, {}],
        ["signatureHelp", consumer.indexOf(', "label"') + 1,
          { context: { triggerKind: 2, triggerCharacter: ",", isRetrigger: false } }],
        ["completion", consumer.lastIndexOf("value"), {}],
      ]) {
        const id = session.nextRequestId
        ids.add(id)
        const pending = session.request(`textDocument/${method}`, {
          textDocument: { uri: fixture.uri("ZConsumer.ets") }, position: positionAt(consumer, offset), ...extra,
        }, { timeoutMs: 20_000 })
        session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
        const response = await pending
        assert.equal(response.error?.code, -32800, `${method}: ${JSON.stringify(response)}`)
        assert.equal(response.result, undefined)
      }
      const resolveId = session.nextRequestId
      ids.add(resolveId)
      const pendingResolve = session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: resolveId } })
      const cancelledResolve = await pendingResolve
      assert.equal(cancelledResolve.error?.code, -32800, JSON.stringify(cancelledResolve))
      assert.equal(cancelledResolve.result, undefined)
      const recoveredResolve = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
      assert.equal(recoveredResolve.error, undefined, JSON.stringify(recoveredResolve.error))
      assert.deepEqual(recoveredResolve.result.data, item.data)
      assert.deepEqual(canonicalCompletion(recoveredResolve.result), { ...canonicalCompletion(item),
        detail: "(property) ValueTarget.value: number" })
      await assertNavigation(session, fixture)
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      assert.ok(!session.transport.messages.some(message => ids.has(message.id)), "no duplicate terminal response")
    }
  })

test("all interactive queries finish during detached verification and edits fence the old references snapshot",
  { timeout: 60_000 }, async t => {
    for (const env of [{}, selectedL03Policy]) {
      const fixture = createFixture(t)
      const session = await startSession(t, fixture, true, {
        ...env,
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "2000",
      })
      await warmAndPromote(session, fixture)
      const target = fixture.sources["ZTarget.ets"]
      session.openDocument({ uri: fixture.uri("ZTarget.ets"), version: 1, text: target })
      assert.deepEqual((await diagnostic(session, fixture.uri("ZTarget.ets"), 1)).params.diagnostics, [])
      const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
      await waitForEvent(fixture, event => event.event === "semantic.context.evict"
        && event.reason === "memory-level3")
      const params = { textDocument: { uri: fixture.uri("ZTarget.ets") },
        position: positionAt(target, target.indexOf("ValueTarget") + 1) }
      const references = session.request("textDocument/references", {
        ...params, context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      let settled = false
      void references.then(() => { settled = true }, () => { settled = true })
      await waitForEvent(fixture, event => event.event === "references.batch.start")
      await assertNavigation(session, fixture)
      assert.equal(settled, false, "navigation must not wait for the global references response")
      const original = fixture.sources["ZConsumer.ets"]
      const completion = await session.request("textDocument/completion", {
        textDocument: { uri: fixture.uri("ZConsumer.ets") },
        position: positionAt(original, original.lastIndexOf("value")),
      }, { timeoutMs: 20_000 })
      assert.equal(completion.error, undefined, JSON.stringify(completion.error))
      assert.deepEqual(completion.result.items.map(item => item.label).sort(), ["run", "value"])
      assert.equal(settled, false, "completion must also bypass active global verification")
      const consumer = `// edited during global query 😀\n${original}`
      session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 2, text: consumer })
      const stale = await references
      assert.deepEqual(stale.error, { code: -32801, message: "References request is stale" })
      assert.equal(stale.result, undefined)
      await assertNavigation(session, fixture, { consumer })
      assert.deepEqual((await diagnostic(session, fixture.uri("ZConsumer.ets"), 2)).params.diagnostics, [])
      for (const includeDeclaration of [false, true]) {
        const response = await session.request("textDocument/references", {
          ...params, context: { includeDeclaration },
        }, { timeoutMs: 20_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const expected = includeDeclaration
          ? [location(fixture, "ZTarget.ets", target, target.indexOf("ValueTarget"), "ValueTarget")] : []
        for (const [name, source] of [["ZConsumer.ets", consumer], ["ZSnippet.ets", fixture.sources["ZSnippet.ets"]]]) {
          expected.push(...[...source.matchAll(/ValueTarget/g)].map(match =>
            location(fixture, name, source, match.index, "ValueTarget")))
        }
        assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      const batches = readEvents(fixture).filter(event => event.event === "references.batch.complete")
      assert.ok(batches.length >= 2, "both recovery policies must actually execute complete fallback")
      assert.ok(batches.some(event => Number.isFinite(event.workerStartupMs) && event.workerStartupMs > 0),
        "observe an actual verifier runtime-ready receipt, not just a batch plan")
    }
  })

test("promoted method stubs retain snippets only for capable clients across resolution",
  { timeout: 60_000 }, async t => {
    for (const env of [{}, selectedL03Policy, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }]) {
      const fixture = createFixture(t)
      for (const snippets of [false, true]) {
        const session = await startSession(t, fixture, true, env, {
          completion: { completionItem: { snippetSupport: snippets } },
        })
        await warmAndPromote(session, fixture)
        const source = fixture.sources["ZSnippet.ets"]
        const uri = fixture.uri("ZSnippet.ets")
        session.openDocument({ uri, version: 1, text: source })
        await diagnostic(session, uri, 1)
        const response = await session.request("textDocument/completion", {
          textDocument: { uri }, position: positionAt(source, source.lastIndexOf("ru") + 2),
        }, { timeoutMs: 20_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        assert.equal(response.result.isIncomplete, false)
        const stubs = response.result.items.filter(item => item.label === "run")
        assert.equal(stubs.length, 1, JSON.stringify(response.result))
        const item = stubs[0]
        canonicalCompletion(item)
        assert.equal(item.kind, 2)
        assert.deepEqual(item.textEdit.range,
          location(fixture, "ZSnippet.ets", source, source.lastIndexOf("ru"), "ru").range)
        assert.equal(item.textEdit.newText, item.insertText)
        const resolved = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
        assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
        assert.deepEqual(resolved.result.data, item.data)
        for (const entry of [item, resolved.result]) {
          assert.equal(entry.insertTextFormat, snippets ? 2 : undefined)
          if (snippets) {
            assert.match(entry.insertText, /run\(count: number, label: string\): string/)
            assert.match(entry.insertText, /\$0/)
          } else assert.equal(entry.insertText, "run")
        }
        assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      }
    }
  })

test("promoted auto-imports preserve distinct same-name sources, apply complete edits and reject stale handles",
  { timeout: 60_000 }, async t => {
    for (const env of [{}, selectedL03Policy, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }]) {
      const fixture = createFixture(t)
      const session = await startSession(t, fixture, true, env)
      await warmAndPromote(session, fixture)
      const source = fixture.sources["ZAutoConsumer.ets"]
      const uri = fixture.uri("ZAutoConsumer.ets")
      session.openDocument({ uri, version: 1, text: source })
      const before = (await diagnostic(session, uri, 1)).params.diagnostics
      assert.deepEqual(before.map(item => item.code), [2304])
      assert.deepEqual(before[0].range,
        location(fixture, "ZAutoConsumer.ets", source, source.indexOf("ValueTar"), "ValueTar").range)
      const response = await session.request("textDocument/completion", {
        textDocument: { uri }, position: positionAt(source, source.indexOf("ValueTar") + "ValueTar".length),
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.equal(response.result.isIncomplete, false)
      const items = response.result.items.filter(item => item.label === "ValueTarget")
      assert.equal(items.length, 2, JSON.stringify(response.result))
      const resolved = []
      for (const item of items) {
        canonicalCompletion(item)
        assert.equal(item.kind, 7)
        assert.deepEqual(item.textEdit, { range: before[0].range, newText: "ValueTarget" })
        const result = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
        assert.equal(result.error, undefined, JSON.stringify(result.error))
        assert.deepEqual(result.result.data, item.data)
        assert.deepEqual(result.result.textEdit, item.textEdit)
        assert.equal(result.result.additionalTextEdits.length, 1)
        resolved.push(result.result)
      }
      const imports = resolved.map(item => item.additionalTextEdits[0].newText).sort()
      assert.deepEqual(imports, ['import { ValueTarget } from "./ZHomonym.ets";\n\n',
        'import { ValueTarget } from "./ZTarget.ets";\n\n'])
      const chosen = resolved.find(item => item.additionalTextEdits[0].newText.includes('"./ZTarget.ets"'))
      const updated = applyTextEdits(source, [chosen.textEdit, ...chosen.additionalTextEdits])
      assert.equal(updated, 'import { ValueTarget } from "./ZTarget.ets";\n\n'
        + source.replace("ValueTar", "ValueTarget"))
      session.changeDocument({ uri, version: 2, text: updated })
      assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics, [])
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri }, position: positionAt(updated, updated.lastIndexOf("ValueTarget") + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      const target = fixture.sources["ZTarget.ets"]
      assert.deepEqual(definition.result, [location(fixture, "ZTarget.ets", target,
        target.indexOf("ValueTarget"), "ValueTarget")])
      for (const item of items) {
        const stale = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
        assert.equal(stale.error?.code, -32602, JSON.stringify(stale))
        assert.equal(stale.result, undefined)
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })
