import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { projectRoot } from "../support/lsp-process.mjs"

import { assertPackageEntryFreshness } from "../support/resident-interactive-package.mjs"
import { assertNavigation, canonicalCompletion, createFixture, diagnostic, location, positionAt,
  selectedL03Policy, startSession, warmAndPromote } from "../support/resident-interactive-lsp.mjs"

test("L06 absent type roots survive sibling creation during a real directory-existence lookup",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const preload = path.join(projectRoot, "tests/fixtures/semantic-directory-presence.cjs")
    const session = await startSession(t, fixture, true, { ...selectedL03Policy,
      NODE_OPTIONS: `--require=${JSON.stringify(preload)}` })
    const uri = fixture.uri("ZConsumer.ets")
    session.openDocument({ uri, version: 1, text: fixture.sources["ZConsumer.ets"] })
    await assertNavigation(session, fixture)
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    const markers = fs.readdirSync(fixture.directory).filter(name => name.startsWith("presence-sibling-"))
      .map(name => JSON.parse(fs.readFileSync(path.join(fixture.directory, name), "utf8")))
    assert.ok(markers.some(marker => marker.pid === session.transport.child.pid && marker.threadId > 0),
      "the genuine semantic Worker directory lookup must create the unrelated private sibling")
    assert.equal(fs.existsSync(path.join(fixture.directory, "node_modules")), false)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L06 a true transient type-root lookup cannot certify absence and notified recovery stays exact",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    fs.writeFileSync(path.join(fixture.directory, "presence-window.json"), "{}")
    const preload = path.join(projectRoot, "tests/fixtures/semantic-directory-presence.cjs")
    const session = await startSession(t, fixture, true, { ...selectedL03Policy,
      NODE_OPTIONS: `--require=${JSON.stringify(preload)}` })
    const uri = fixture.uri("ZConsumer.ets"), source = fixture.sources["ZConsumer.ets"]
    session.openDocument({ uri, version: 1, text: source })
    const result = await session.request("textDocument/definition", { textDocument: { uri },
      position: positionAt(source, source.lastIndexOf("value") + 1) }, { timeoutMs: 20_000 })
    assert.equal(result.error?.code, -32803, JSON.stringify(result))
    assert.equal(result.result, undefined)
    assert.equal(fs.existsSync(path.join(fixture.directory, "node_modules")), false)
    const markers = fs.readdirSync(fixture.directory).filter(name => name.startsWith("presence-sibling-"))
      .map(name => JSON.parse(fs.readFileSync(path.join(fixture.directory, name), "utf8")))
    assert.ok(markers.some(marker => marker.pid === session.transport.child.pid && marker.transient))
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: fixture.uri("build-profile.json5"), type: 2 }] } })
    session.changeDocument({ uri, version: 2, text: source })
    await assertNavigation(session, fixture)
    assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L06 selected policy refreshes every interactive payload and current diagnostics after SDK configuration switches",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const nextSdk = path.join(fixture.directory, "sdk-second")
    const declarations = new Map()
    for (const [sdk, type, member] of [[fixture.sdk, "number", "firstOnly"], [nextSdk, "string", "secondOnly"]]) {
      fs.mkdirSync(path.join(sdk, "ets", "api"), { recursive: true })
      if (sdk === nextSdk) {
        fs.mkdirSync(path.join(sdk, "toolchains"))
        fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
      }
      const text = `/* SDK 😀 */ export declare class SdkValue {\n  value: ${type}\n`
        + `  run(count: ${type}): ${type}\n  ${member}: boolean\n}\n`
      const module = path.join(sdk, "ets", "api", "@ohos.interactive.d.ts")
      fs.writeFileSync(module, text)
      declarations.set(sdk, { text, uri: pathToFileURL(module).href, type, member })
    }
    const source = 'import { SdkValue } from "@ohos.interactive"\nexport const selected = new SdkValue()\n'
      + "export const called = selected.run(undefined)\nexport const broken: number = selected.value\n"
    const uri = fixture.uri("ZSdk.ets")
    fs.writeFileSync(path.join(fixture.workspace, "ZSdk.ets"), source)
    const queryAll = async (session, text, sdk) => {
      const declaration = declarations.get(sdk)
      const target = symbol => ({ uri: declaration.uri, range: {
        start: positionAt(declaration.text, declaration.text.indexOf(symbol)),
        end: positionAt(declaration.text, declaration.text.indexOf(symbol) + symbol.length),
      } })
      const ask = async (method, offset) => {
        const result = await session.request(`textDocument/${method}`, {
          textDocument: { uri }, position: positionAt(text, offset),
        }, { timeoutMs: 20_000 })
        assert.equal(result.error, undefined, JSON.stringify(result.error))
        return result.result
      }
      const definition = await ask("definition", text.lastIndexOf("value") + 1)
      assert.deepEqual(definition, [target("value")])
      const typeDefinition = await ask("typeDefinition", text.lastIndexOf("selected") + 1)
      assert.deepEqual(typeDefinition, [target("SdkValue")])
      const hover = await ask("hover", text.lastIndexOf("value") + 1)
      assert.deepEqual(hover, { contents: { kind: "markdown",
        value: `\`\`\`arkts\n(property) SdkValue.value: ${declaration.type}\n\`\`\`` },
      range: location(fixture, "ZSdk.ets", text, text.lastIndexOf("value"), "value").range })
      const signature = await ask("signatureHelp", text.lastIndexOf("undefined") + 1)
      assert.deepEqual(signature, { signatures: [{ label: `run(count: ${declaration.type}): ${declaration.type}`,
        parameters: [{ label: `count: ${declaration.type}` }] }], activeSignature: 0, activeParameter: 0 })
      const completion = await ask("completion", text.lastIndexOf("value"))
      assert.deepEqual({ ...completion, items: completion.items.map(canonicalCompletion) }, {
        isIncomplete: false, items: [declaration.member, "run", "value"].sort().map(label => ({
          label, detail: `TypeScript ${label === "run" ? "method" : "property"} declare`, kind: label === "run" ? 2 : 5,
          insertText: label, sortText: "11", textEdit: { range: location(fixture, "ZSdk.ets", text,
            text.lastIndexOf("value"), "value").range, newText: label },
        })),
      })
      const resolutions = []
      for (const item of completion.items) {
        const resolved = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
        assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
        assert.deepEqual(resolved.result.data, item.data)
        const detail = item.label === "run" ? `(method) SdkValue.run(count: ${declaration.type}): ${declaration.type}`
          : `(property) SdkValue.${item.label}: ${item.label === "value" ? declaration.type : "boolean"}`
        assert.deepEqual(canonicalCompletion(resolved.result), { ...canonicalCompletion(item), detail })
        resolutions.push(canonicalCompletion(resolved.result))
      }
      return { definition, typeDefinition, hover, signature,
        completion: { ...completion, items: completion.items.map(canonicalCompletion) }, resolutions }
    }
    const overlay = `// authoritative SDK switch 😀\n${source}`
    const coldFixture = { ...fixture, sdk: nextSdk }
    const cold = await startSession(t, coldFixture, false, selectedL03Policy)
    cold.openDocument({ uri, version: 1, text: overlay })
    const coldErrors = (await diagnostic(cold, uri, 1)).params.diagnostics
    assert.deepEqual(coldErrors.map(item => item.code), [2322])
    assert.deepEqual(coldErrors[0].range,
      location(fixture, "ZSdk.ets", overlay, overlay.indexOf("broken"), "broken").range)
    const oracle = await queryAll(cold, overlay, nextSdk)
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fixture.runCount = coldFixture.runCount
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    await queryAll(session, source, fixture.sdk)
    fs.writeFileSync(path.join(fixture.workspace, "ZSdk.ets"), "export const diskOnly = 1\n")
    for (const [version, sdk] of [[2, nextSdk], [3, fixture.sdk]]) {
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: sdk } } } } })
      session.changeDocument({ uri, version, text: overlay })
      const current = await queryAll(session, overlay, sdk)
      if (sdk === nextSdk) assert.deepEqual(current, oracle)
      assert.deepEqual((await diagnostic(session, uri, version)).params.diagnostics, sdk === nextSdk ? coldErrors : [])
    }
    await assertNavigation(session, fixture)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L06 unnotified package diagnostics cannot publish a stale successful empty current version",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const root = path.join(fixture.workspace, "shared")
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(fixture.workspace, "oh-package.json5"), "{ dependencies: { shared: 'file:./shared' } }")
    const manifest = path.join(root, "oh-package.json5")
    for (const [name, type, value] of [["First", "number", "1"], ["Second", "string", '\"updated\"']]) {
      fs.writeFileSync(path.join(root, `${name}.ets`), `export class ValueTarget { value: ${type} = ${value} }\n`)
    }
    const source = 'import { ValueTarget } from "shared"\nexport const selected = new ValueTarget()\n'
      + "export const broken: number = selected.value\n"
    const overlay = `// latest diagnostic 😀\n${source}`
    const uri = fixture.uri("ZDiagnosticPackage.ets")
    fs.writeFileSync(path.join(fixture.workspace, "ZDiagnosticPackage.ets"), source)
    fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
    const coldFixture = { ...fixture }
    const cold = await startSession(t, coldFixture, false, selectedL03Policy)
    cold.openDocument({ uri, version: 1, text: overlay })
    const expected = (await diagnostic(cold, uri, 1)).params.diagnostics
    assert.deepEqual(expected.map(item => item.code), [2322])
    assert.deepEqual(expected[0].range,
      location(fixture, "ZDiagnosticPackage.ets", overlay, overlay.indexOf("broken"), "broken").range)
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fixture.runCount = coldFixture.runCount
    fs.writeFileSync(manifest, "{ main: 'First.ets' }")
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
    const terminal = session.transport.waitFor(message =>
      (message.method === "textDocument/publishDiagnostics" && message.params.uri === uri && message.params.version === 2)
      || (message.method === "window/logMessage" && message.params.message.startsWith("ArkTS diagnostics failed:")),
    "current package diagnostic result or explicit failure", 20_000)
    session.changeDocument({ uri, version: 2, text: overlay })
    const observed = await terminal
    if (observed.method === "textDocument/publishDiagnostics") assert.deepEqual(observed.params.diagnostics, expected)
    else assert.match(observed.params.message, /workspace.*incomplete|current workspace inputs/iu)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(manifest).href, type: 2 }] } })
    session.changeDocument({ uri, version: 3, text: overlay })
    assert.deepEqual((await diagnostic(session, uri, 3)).params.diagnostics, expected)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"
      && message.params.uri === uri && message.params.version === 2 && message.params.diagnostics.length === 0))
  })

test("L06 unnotified package entry changes cannot publish an old definition as current",
  { timeout: 60_000 }, async t => {
    await assertPackageEntryFreshness(t, selectedL03Policy, {
      method: "definition", offset: source => source.lastIndexOf("value") + 1,
      expected: ({ fixture, target, name }) =>
        [location(fixture, name, target, target.indexOf("value:"), "value")],
    })
  })

test("L06 unnotified package entry changes cannot publish an old type definition as current",
  { timeout: 60_000 }, async t => {
    await assertPackageEntryFreshness(t, selectedL03Policy, {
      method: "typeDefinition", offset: source => source.lastIndexOf("selected") + 1,
      expected: ({ fixture, target, name }) =>
        [location(fixture, name, target, target.indexOf("ValueTarget"), "ValueTarget")],
    })
  })

test("L06 unnotified package entry changes cannot publish an old hover as current",
  { timeout: 60_000 }, async t => {
    await assertPackageEntryFreshness(t, selectedL03Policy, {
      method: "hover", offset: source => source.lastIndexOf("value") + 1,
      expected: ({ fixture, target, source }) => ({
        contents: { kind: "markdown", value: `\`\`\`arkts\n(property) ValueTarget.value: ${target.includes("string") ? "string" : "number"}\n\`\`\`` },
        range: location(fixture, "ZPackage.ets", source, source.lastIndexOf("value"), "value").range,
      }),
    })
  })

test("L06 unnotified package entry changes cannot publish an old signature as current",
  { timeout: 60_000 }, async t => {
    await assertPackageEntryFreshness(t, selectedL03Policy, {
      method: "signatureHelp", offset: source => source.lastIndexOf("undefined") + 1,
      members: type => `; run(count: ${type}): ${type} { return this.value }`,
      suffix: "export const called = selected.run(undefined)\n",
      expected: ({ target }) => {
        const type = target.includes("string") ? "string" : "number"
        return { signatures: [{ label: `run(count: ${type}): ${type}`,
          parameters: [{ label: `count: ${type}` }] }], activeSignature: 0, activeParameter: 0 }
      },
    })
  })

test("L06 unnotified package entry changes cannot publish old completion members as current",
  { timeout: 60_000 }, async t => {
    await assertPackageEntryFreshness(t, selectedL03Policy, {
      method: "completion", offset: source => source.lastIndexOf("value"),
      members: type => `; ${type === "string" ? "secondOnly" : "firstOnly"} = true`,
      normalize: list => ({ ...list, items: list.items.map(canonicalCompletion) }),
      expected: ({ fixture, target, source }) => ({ isIncomplete: false,
        items: [target.includes("string") ? "secondOnly" : "firstOnly", "value"].map(label => ({
          label, detail: "TypeScript property", kind: 5, insertText: label, sortText: "11",
          textEdit: { range: location(fixture, "ZPackage.ets", source,
            source.lastIndexOf("value"), "value").range, newText: label },
        })),
      }),
    })
  })

test("L06 package changes reject an unresolved completion handle even without a document version change",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const root = path.join(fixture.workspace, "shared")
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(fixture.workspace, "oh-package.json5"), "{ dependencies: { shared: 'file:./shared' } }")
    const manifest = path.join(root, "oh-package.json5")
    for (const [name, type, value] of [["First", "number", "1"], ["Second", "string", '\"updated\"']]) {
      fs.writeFileSync(path.join(root, `${name}.ets`), `export class ValueTarget { value: ${type} = ${value} }\n`)
    }
    const source = '/* authoritative 😀 */ import { ValueTarget } from "shared"\n'
      + "export const selected = new ValueTarget()\nexport const broken: number = selected.value\n"
    const uri = fixture.uri("ZResolvePackage.ets")
    fs.writeFileSync(path.join(fixture.workspace, "ZResolvePackage.ets"), source)
    const query = { textDocument: { uri }, position: positionAt(source, source.lastIndexOf("value")) }
    const completion = async session => {
      const result = await session.request("textDocument/completion", query, { timeoutMs: 20_000 })
      assert.equal(result.error, undefined, JSON.stringify(result.error))
      assert.equal(result.result.isIncomplete, false)
      assert.equal(result.result.items.length, 1)
      const item = result.result.items[0]
      assert.deepEqual(canonicalCompletion(item), { label: "value", detail: "TypeScript property", kind: 5,
        insertText: "value", sortText: "11", textEdit: { range: location(fixture, "ZResolvePackage.ets",
          source, source.lastIndexOf("value"), "value").range, newText: "value" } })
      return item
    }
    const resolve = async (session, item, type) => {
      const result = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
      assert.equal(result.error, undefined, JSON.stringify(result.error))
      assert.deepEqual(result.result.data, item.data)
      assert.deepEqual(canonicalCompletion(result.result), { ...canonicalCompletion(item),
        detail: `(property) ValueTarget.value: ${type}` })
      return result.result
    }
    fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
    const coldFixture = { ...fixture }
    const cold = await startSession(t, coldFixture, false, selectedL03Policy)
    cold.openDocument({ uri, version: 1, text: source })
    const coldErrors = (await diagnostic(cold, uri, 1)).params.diagnostics
    assert.deepEqual(coldErrors.map(item => item.code), [2322])
    const oracle = await resolve(cold, await completion(cold), "string")
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fixture.runCount = coldFixture.runCount
    fs.writeFileSync(manifest, "{ main: 'First.ets' }")
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    const item = await completion(session)
    await resolve(session, item, "number")
    fs.writeFileSync(path.join(fixture.workspace, "ZResolvePackage.ets"), "export const diskOnly = 1\n")
    fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
    const stale = await session.request("completionItem/resolve", item, { timeoutMs: 20_000 })
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    assert.equal(stale.result, undefined)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(manifest).href, type: 2 }] } })
    session.changeDocument({ uri, version: 2, text: source })
    const restored = await resolve(session, await completion(session), "string")
    assert.deepEqual(canonicalCompletion(restored), canonicalCompletion(oracle))
    assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics, coldErrors)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
