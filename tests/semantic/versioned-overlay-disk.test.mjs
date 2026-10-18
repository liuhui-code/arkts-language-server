import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { positionAt, canonicalCompletion } from "../support/resident-interactive-lsp.mjs"
import { startFixture, definition, diagnostic, readObservations } from "../support/versioned-overlay-lsp.mjs"

test("project target switches keep full current payloads and consecutive overlay edits correct",
  { timeout: 60_000 }, async t => {
    const payloads = []
    for (const enabled of ["0", "1"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\n"
      const main = "features/alpha/src/main/ets/Main.ets"
      const tablet = "features/alpha/src/tablet/Selected.ets", desktop = "features/alpha/src/desktop/Selected.ets"
      const targets = { [tablet]: "class TabletOnly { item: number = 1 }\n",
        [desktop]: '/* shifted 😀 */\nclass DesktopOnly { item: string = "updated" }\n' }
      const profile = { app: { products: [{ name: "default" }] }, modules: [{ name: "alpha",
        srcPath: "./features/alpha", targets: [{ name: "tablet", applyToProducts: ["default"] }] }] }
      const files = { ...targets, "build-profile.json5": JSON.stringify(profile),
        "features/alpha/build-profile.json5": JSON.stringify({ targets: [
          { name: "tablet", source: { sourceRoots: ["./src/tablet"] } },
          { name: "desktop", source: { sourceRoots: ["./src/desktop"] } },
        ] }) }
      const { fixture, session, uri } = await startFixture(t, source, enabled, { file: main, files })
      const partial = (text, active) => `${text}export const probe = ${active.slice(0, -3)}\n`
      const query = async (text, version, active, inactive) => {
        await definition(session, uri, text)
        const prefix = active.slice(0, -3)
        const response = await session.request("textDocument/completion", { textDocument: { uri },
          position: positionAt(text, text.lastIndexOf(prefix) + prefix.length) }, { timeoutMs: 10_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        assert.equal(response.result.isIncomplete, false)
        const item = response.result.items.find(item => item.label === active)
        assert.ok(item, `the current ${active} target must be present`)
        assert.equal(response.result.items.some(item => item.label === inactive), false)
        const resolved = await session.request("completionItem/resolve", item, { timeoutMs: 10_000 })
        assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
        assert.deepEqual(resolved.result.data, item.data, "protect the actual server-produced handle inside this session")
        assert.match(resolved.result.detail, new RegExp(`class ${active}`))
        const hover = await session.request("textDocument/hover", { textDocument: { uri },
          position: positionAt(text, text.lastIndexOf("value")) }, { timeoutMs: 10_000 })
        assert.equal(hover.error, undefined, JSON.stringify(hover.error))
        assert.deepEqual(hover.result, { contents: { kind: "markdown", value: "```arkts\nconst value: number\n```" },
          range: { start: positionAt(text, text.lastIndexOf("value")), end: positionAt(text, text.lastIndexOf("value") + 5) } })
        const diagnostics = await diagnostic(session, uri, version, null)
        assert.equal(diagnostics.length, 1, "the deliberately incomplete identifier must not lose its diagnostic")
        assert.ok([2304, 2552].includes(diagnostics[0].code), JSON.stringify(diagnostics))
        const start = text.lastIndexOf(prefix)
        assert.deepEqual(diagnostics[0].range, { start: positionAt(text, start), end: positionAt(text, start + prefix.length) })
        return { completion: { ...response.result, items: response.result.items.map(canonicalCompletion) },
          resolved: canonicalCompletion(resolved.result), hover: hover.result, diagnostics }
      }
      const initial = partial(source, "TabletOnly")
      session.changeDocument({ uri, version: 2, text: initial })
      const current = [await query(initial, 2, "TabletOnly", "DesktopOnly")]
      const switchTarget = target => {
        profile.modules[0].targets[0].name = target
        fs.writeFileSync(path.join(fixture.suite.workspace, "build-profile.json5"), JSON.stringify(profile))
        session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes: [
          { uri: pathToFileURL(path.join(fixture.suite.workspace, "build-profile.json5")).href, type: 2 },
        ] } })
      }
      switchTarget("desktop")
      const changed = partial(source.replace("= 0", "= 9")
        .replace("\nexport const value", "\n// new target 👩‍💻\nexport const value"), "DesktopOnly")
      session.changeDocument({ uri, version: 3, text: changed })
      current.push(await query(changed, 3, "DesktopOnly", "TabletOnly"))
      const seen = readObservations(fixture).length
      const next = changed.replace("= 9", "= 10")
      session.changeDocument({ uri, version: 4, text: next })
      current.push(await query(next, 4, "DesktopOnly", "TabletOnly"))
      const native = readObservations(fixture).slice(seen).filter(row => row.kind === "compiler-change-range")
      assert.ok(native.some(row => enabled === "0" ? row.change === null : row.reconstructsCurrentText === true))
      switchTarget("tablet")
      const restored = partial(source.replace("= 0", "= 9"), "TabletOnly")
      session.changeDocument({ uri, version: 5, text: restored })
      current.push(await query(restored, 5, "TabletOnly", "DesktopOnly"))
      t.diagnostic(JSON.stringify({ enabled, afterTargetSwitch: native }))
      payloads.push(current)
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
    assert.deepEqual(payloads[1], payloads[0], "both target-switch directions match full parsing")
  })

test("disk dependency changes cannot inherit overlay deltas and open overlays remain authoritative through close",
  { timeout: 60_000 }, async t => {
    const payloads = []
    for (const enabled of ["0", "1"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const file = path.join(fixture.suite.workspace, "Target.ets")
      const targetUri = pathToFileURL(file).href
      const original = "// op04-snapshot disk 😀\nexport class Target { item: number = 1 }\n"
      const changed = '// op04-snapshot disk 😀\n/* shifted 👩‍💻 */\nexport class Target { item: string = "updated" }\n'
      const notify = type => session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: targetUri, type }] } })
      fs.writeFileSync(file, original)
      notify(1)
      const imported = source.replace("export const value: number = 1",
        'import { Target } from "./Target"\nexport const value = new Target().item')
        + "export const broken: number = value\n"
      const current = []
      const query = async (text, version, type, target) => {
        session.changeDocument({ uri, version, text })
        await definition(session, uri, text)
        const response = await session.request("textDocument/definition", { textDocument: { uri },
          position: positionAt(text, text.lastIndexOf("Target") + 1) }, { timeoutMs: 10_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const offset = target.indexOf("Target")
        assert.deepEqual(response.result, [{ uri: targetUri, range: {
          start: positionAt(target, offset), end: positionAt(target, offset + 6),
        } }])
        const hover = await session.request("textDocument/hover", { textDocument: { uri },
          position: positionAt(text, text.lastIndexOf("value")) }, { timeoutMs: 10_000 })
        assert.equal(hover.error, undefined, JSON.stringify(hover.error))
        assert.deepEqual(hover.result, { contents: { kind: "markdown", value: `\`\`\`arkts\nconst value: ${type}\n\`\`\`` },
          range: { start: positionAt(text, text.lastIndexOf("value")),
            end: positionAt(text, text.lastIndexOf("value") + 5) } })
        const diagnostics = await diagnostic(session, uri, version, type === "number" ? [] : [2322])
        if (type === "string") {
          const start = text.indexOf("broken")
          assert.deepEqual(diagnostics[0].range, { start: positionAt(text, start), end: positionAt(text, start + 6) })
        }
        current.push({ version, hover: hover.result, diagnostics,
          definition: response.result.map(item => ({ ...item, uri: "Target.ets" })) })
      }
      await query(imported, 2, "number", original)
      const seen = readObservations(fixture).length
      fs.writeFileSync(file, changed)
      notify(2)
      await query(imported.replace("= 0", "= 9"), 3, "string", changed)
      const diskUpdates = readObservations(fixture).slice(seen).filter(row =>
        row.oldLength === original.length && row.newLength === changed.length)
      assert.ok(diskUpdates.every(row => row.change === null), "disk text is not a trusted overlay ancestor")
      session.openDocument({ uri: targetUri, version: 1, text: original })
      await diagnostic(session, targetUri, 1)
      await query(imported.replace("= 0", "= 10"), 4, "number", original)
      session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
        params: { textDocument: { uri: targetUri } } })
      session.documentVersions.delete(targetUri)
      await query(imported.replace("= 0", "= 11"), 5, "string", changed)
      t.diagnostic(JSON.stringify({ enabled, diskUpdates }))
      payloads.push(current)
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
    assert.deepEqual(payloads[1], payloads[0], "full current payloads match complete parsing at every disk/overlay transition")
  })
