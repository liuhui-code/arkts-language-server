import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("opening unchanged compiler-loaded source preserves exact navigation without rebuilding the Program", async t => {
  const control = await replay(t, { enabled: false })
  const experiment = await replay(t, { enabled: true })
  assert.deepEqual(experiment.definitions, control.definitions)
  assert.deepEqual(experiment.diagnostics, control.diagnostics)
  assert.ok(control.promotions.length > 0, "the fixture must actually promote a lazy-loaded source")
  assert.ok(experiment.promotions.length > 0, "the experiment must exercise the same promotion")
  assert.notEqual(control.promoted.programSequence, control.warm.programSequence,
    "the baseline must demonstrate the unnecessary rebuild")
  assert.equal(experiment.promoted.programSequence, experiment.warm.programSequence,
    "identical compiler input must preserve the prepared Program under the experiment")
  assert.ok(experiment.promotions.every(entry => entry.generationAfter === entry.generationBefore),
    "a same-content promotion must not invalidate the compiler generation")
})

test("same-content promotion stays active without the benchmark control switch", async t => {
  const guarded = await replay(t, { enabled: true, benchmark: false })
  assert.ok(guarded.promotions.length > 0)
  assert.equal(guarded.promoted.programSequence, guarded.warm.programSequence)
  assert.ok(guarded.promotions.every(entry => entry.generationAfter === entry.generationBefore))
})

test("opening a compiler-loaded file with different unsaved text invalidates its lazy version", async t => {
  const changed = await replay(t, { enabled: true, editOnOpen: true })
  assert.notEqual(changed.promoted.programSequence, changed.warm.programSequence,
    "different authoritative overlay bytes require a fresh Program")
})

test("ordinary unsaved edits after promotion rebuild current input and preserve complete references and diagnostics", async t => {
  const edited = await replay(t, { enabled: true, edit: true })
  assert.equal(edited.edited.length, 2)
  assert.ok(edited.edited.every(query => query.programSequence !== edited.promoted.programSequence),
    "actual source edits must not retain the old Program")
  for (const query of edited.edited) {
    assert.ok(edited.sourceIdentities.some(observation => observation.programSequence === query.programSequence
      && observation.projectSourceFilesReused > 0 && observation.projectSourceFilesFirstObserved > 0),
    "post-edit observations must refresh changed source and reuse unchanged SourceFiles")
  }
})

test("public API edits refresh imported member types after same-content promotion", async t => {
  const changed = await replay(t, {
    enabled: true,
    sourceOverrides: { "Use.ets": 'import { TargetThing } from "./Target"\n'
      + "export const selected = new TargetThing()\nexport const readValue: number = selected.value\n" },
    async afterPromotion({ session, sources, uri }) {
      const target = '// changed public API 😀\nexport class TargetThing { value: string = "updated" }\n'
      const publication = session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Target.ets") && message.params.version === 2, 20_000)
      session.changeDocument({ uri: uri("Target.ets"), version: 2, text: target })
      const position = positionAt(sources["Use.ets"], sources["Use.ets"].lastIndexOf("value") + 1)
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri: uri("Use.ets") }, position,
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [{ uri: uri("Target.ets"),
        range: rangeAt(target, target.indexOf("value"), "value") }])
      const hover = await session.request("textDocument/hover", {
        textDocument: { uri: uri("Use.ets") }, position,
      }, { timeoutMs: 20_000 })
      assert.equal(hover.error, undefined, JSON.stringify(hover.error))
      assert.match(hover.result.contents.value, /TargetThing\.value: string/)
      assert.deepEqual(hover.result.range,
        rangeAt(sources["Use.ets"], sources["Use.ets"].lastIndexOf("value"), "value"))
      assert.deepEqual((await publication).params.diagnostics, [])
      const consumerDiagnostics = session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 20_000)
      session.changeDocument({ uri: uri("Use.ets"), version: 2, text: sources["Use.ets"] })
      const diagnostics = (await consumerDiagnostics).params.diagnostics
      assert.deepEqual(diagnostics.map(value => value.code), [2322])
      assert.deepEqual(diagnostics[0].range,
        rangeAt(sources["Use.ets"], sources["Use.ets"].indexOf("readValue"), "readValue"))
      return 1
    },
  })
  assert.ok(changed.promotions.length > 0)
  assert.equal(changed.promoted.programSequence, changed.warm.programSequence)
  assert.notEqual(changed.edited[0].programSequence, changed.promoted.programSequence)
})

test("an import replacement after promotion cannot retain the old definition or reference set", async t => {
  const changed = await replay(t, {
    enabled: true,
    async afterPromotion({ session, sources, uri }) {
      const source = '// changed import 😀\nimport { OtherThing as TargetThing } from "./Other"\n'
        + "export const selected = new TargetThing()\n"
      const publication = session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 20_000)
      session.changeDocument({ uri: uri("Use.ets"), version: 2, text: source })
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri: uri("Use.ets") }, position: positionAt(source, source.lastIndexOf("TargetThing") + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [{ uri: uri("Other.ets"),
        range: rangeAt(sources["Other.ets"], sources["Other.ets"].indexOf("OtherThing"), "OtherThing") }])
      assert.deepEqual((await publication).params.diagnostics, [])
      for (const includeDeclaration of [false, true]) {
        const references = await session.request("textDocument/references", {
          textDocument: { uri: uri("Target.ets") },
          position: positionAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing") + 1),
          context: { includeDeclaration },
        }, { timeoutMs: 20_000 })
        assert.equal(references.error, undefined, JSON.stringify(references.error))
        assert.deepEqual(references.result, includeDeclaration ? [{ uri: uri("Target.ets"),
          range: rangeAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing"), "TargetThing") }] : [])
      }
      return 1
    },
  })
  assert.ok(changed.promotions.length > 0)
  assert.equal(changed.promoted.programSequence, changed.warm.programSequence)
  assert.notEqual(changed.edited[0].programSequence, changed.promoted.programSequence)
})

test("created and deleted unopened members refresh both complete reference policies after promotion", async t => {
  const changed = await replay(t, {
    enabled: true,
    async afterPromotion({ session, sources, uri, workspace }) {
      const created = '// new unopened member 😀\nimport { TargetThing } from "./Target"\n'
        + "export const created = new TargetThing()\n"
      const filePath = path.join(workspace, "Created.ets")
      for (const present of [true, false]) {
        if (present) fs.writeFileSync(filePath, created)
        else fs.unlinkSync(filePath)
        session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
          params: { changes: [{ uri: uri("Created.ets"), type: present ? 1 : 3 }] } })
        for (const includeDeclaration of [false, true]) {
          const references = await session.request("textDocument/references", {
            textDocument: { uri: uri("Target.ets") },
            position: positionAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing") + 1),
            context: { includeDeclaration },
          }, { timeoutMs: 20_000 })
          assert.equal(references.error, undefined, JSON.stringify(references.error))
          const expected = (includeDeclaration ? [{ uri: uri("Target.ets"),
            range: rangeAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing"), "TargetThing") }] : [])
          for (const [name, source] of [["Use.ets", sources["Use.ets"]],
            ...(present ? [["Created.ets", created]] : [])]) {
            expected.push(...[...source.matchAll(/TargetThing/g)].map(match => ({ uri: uri(name),
              range: rangeAt(source, match.index, "TargetThing") })))
          }
          assert.deepEqual(references.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
        }
      }
      return 0
    },
  })
  assert.ok(changed.promotions.length > 0)
  assert.equal(changed.promoted.programSequence, changed.warm.programSequence)
})

test("disk deletion retains an open declaration but closing it cannot resurrect a promoted dependency", async t => {
  for (const enabled of [false, true]) {
    const changed = await replay(t, {
      enabled,
      async afterPromotion({ session, sources, uri, workspace }) {
        fs.unlinkSync(path.join(workspace, "Target.ets"))
        session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
          params: { changes: [{ uri: uri("Target.ets"), type: 3 }] } })
        const query = { textDocument: { uri: uri("Use.ets") },
          position: positionAt(sources["Use.ets"], sources["Use.ets"].lastIndexOf("TargetThing") + 1) }
        const open = await session.request("textDocument/definition", query, { timeoutMs: 20_000 })
        assert.equal(open.error, undefined, JSON.stringify(open.error))
        assert.deepEqual(open.result, [{ uri: uri("Target.ets"),
          range: rangeAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing"), "TargetThing") }])
        session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
          params: { textDocument: { uri: uri("Target.ets") } } })
        const closed = await session.request("textDocument/definition", query, { timeoutMs: 20_000 })
        assert.equal(closed.error, undefined, JSON.stringify(closed.error))
        assert.deepEqual(closed.result, [{ uri: uri("Use.ets"),
          range: rangeAt(sources["Use.ets"], sources["Use.ets"].indexOf("TargetThing"), "TargetThing") }],
        "an unresolved import falls back to its local alias, never the missing declaration")
        const publication = session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === uri("Use.ets") && message.params.version === 2, 20_000)
        session.changeDocument({ uri: uri("Use.ets"), version: 2, text: sources["Use.ets"] })
        assert.deepEqual((await publication).params.diagnostics.map(value => value.code), [2307])
        return 2
      },
    })
    assert.ok(changed.promotions.length > 0)
    if (enabled) assert.equal(changed.promoted.programSequence, changed.warm.programSequence)
  }
})

test("switching SDK selection after promotion refreshes external types without losing open overlays", async t => {
  const sdks = []
  const changed = await replay(t, {
    enabled: true,
    sourceOverrides: { "Use.ets": 'import { TargetThing } from "./Target"\n'
      + 'import { SdkThing } from "@ohos.promotion"\nexport const selected = new TargetThing()\n'
      + "const api = new SdkThing()\nconst sdkValue: number = api.value\n" },
    beforeStart({ root }) {
      for (const [name, type] of [["first", "number"], ["second", "string"]]) {
        const sdkRoot = path.join(root, `sdk-${name}`)
        const module = path.join(sdkRoot, "ets", "api", "@ohos.promotion.d.ts")
        const text = `/* SDK ${name} 😀 */ export declare class SdkThing { value: ${type} }\n`
        fs.mkdirSync(path.dirname(module), { recursive: true })
        fs.mkdirSync(path.join(sdkRoot, "toolchains"))
        fs.writeFileSync(module, text)
        sdks.push({ root: sdkRoot, module, text })
      }
      return { initializationOptions: { sdk: { path: sdks[0].root } } }
    },
    async afterPromotion({ session, sources, uri }) {
      const publication = session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 1
          && message.params.diagnostics.some(value => value.code === 2322), 20_000)
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: sdks[1].root } } } } })
      for (const [name, targetUri, targetSource, token] of [
        ["SdkThing", pathToFileURL(sdks[1].module).href, sdks[1].text, "SdkThing"],
        ["TargetThing", uri("Target.ets"), sources["Target.ets"], "TargetThing"],
      ]) {
        const definition = await session.request("textDocument/definition", {
          textDocument: { uri: uri("Use.ets") },
          position: positionAt(sources["Use.ets"], sources["Use.ets"].lastIndexOf(name) + 1),
        }, { timeoutMs: 20_000 })
        assert.equal(definition.error, undefined, JSON.stringify(definition.error))
        assert.deepEqual(definition.result, [{ uri: targetUri,
          range: rangeAt(targetSource, targetSource.indexOf(token), token) }])
      }
      const diagnostics = (await publication).params.diagnostics
      assert.deepEqual(diagnostics.map(value => value.code), [2322])
      assert.deepEqual(diagnostics[0].range,
        rangeAt(sources["Use.ets"], sources["Use.ets"].indexOf("sdkValue"), "sdkValue"))
      return 2
    },
  })
  assert.ok(changed.promotions.length > 0)
  assert.equal(changed.promoted.programSequence, changed.warm.programSequence)
})

test("a package main change refreshes a promoted consumer without replacing its unsaved text", async t => {
  let packageRoot
  const texts = ["/* first 😀 */ export class PackageThing { value: number = 1 }\n",
    '/* second 😀 */ export class PackageThing { value: string = "updated" }\n']
  const changed = await replay(t, {
    enabled: true,
    sourceOverrides: { "Use.ets": 'import { TargetThing } from "./Target"\n'
      + 'import { PackageThing } from "shared"\nexport const selected = new TargetThing()\n'
      + "const packaged = new PackageThing()\nconst packageValue: number = packaged.value\n" },
    beforeStart({ workspace }) {
      packageRoot = path.join(workspace, "shared")
      fs.mkdirSync(packageRoot)
      fs.writeFileSync(path.join(workspace, "oh-package.json5"), "{ dependencies: { shared: 'file:./shared' } }")
      fs.writeFileSync(path.join(packageRoot, "oh-package.json5"), "{ main: 'First.ets' }")
      for (const [index, name] of ["First.ets", "Second.ets"].entries()) {
        fs.writeFileSync(path.join(packageRoot, name), texts[index])
      }
    },
    async afterPromotion({ session, sources, uri, workspace }) {
      const overlay = sources["Use.ets"]
      // Keep the promoted compiler bytes unchanged while the open buffer now
      // differs from disk; a configuration rebuild must replay that authority.
      fs.writeFileSync(path.join(workspace, "Use.ets"), 'export const diskOnly = "not the open buffer"\n')
      const query = { textDocument: { uri: uri("Use.ets") },
        position: positionAt(overlay, overlay.lastIndexOf("PackageThing") + 1) }
      const first = await session.request("textDocument/definition", query, { timeoutMs: 20_000 })
      assert.equal(first.error, undefined, JSON.stringify(first.error))
      assert.deepEqual(first.result, [{ uri: pathToFileURL(path.join(packageRoot, "First.ets")).href,
        range: rangeAt(texts[0], texts[0].indexOf("PackageThing"), "PackageThing") }])
      const manifest = path.join(packageRoot, "oh-package.json5")
      fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: pathToFileURL(manifest).href, type: 2 }] } })
      const second = await session.request("textDocument/definition", query, { timeoutMs: 20_000 })
      assert.equal(second.error, undefined, JSON.stringify(second.error))
      assert.deepEqual(second.result, [{ uri: pathToFileURL(path.join(packageRoot, "Second.ets")).href,
        range: rangeAt(texts[1], texts[1].indexOf("PackageThing"), "PackageThing") }])
      const publication = session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 20_000)
      session.changeDocument({ uri: uri("Use.ets"), version: 2, text: overlay })
      const diagnostics = (await publication).params.diagnostics
      assert.deepEqual(diagnostics.map(value => value.code), [2322])
      assert.deepEqual(diagnostics[0].range, rangeAt(overlay, overlay.indexOf("packageValue"), "packageValue"))
      return 2
    },
  })
  assert.ok(changed.promotions.length > 0)
  assert.equal(changed.promoted.programSequence, changed.warm.programSequence)
})

test("a selected target change replaces promoted global bindings without merging inactive roots", async t => {
  for (const enabled of [false, true]) {
    let profilePath, profile, targetRoot
    const texts = ["/* tablet 😀 */ class PlatformThing { value: number = 1 }\n",
      '/* desktop 😀 */ class PlatformThing { value: string = "updated" }\n']
    const changed = await replay(t, {
      enabled, sourceRoot: "entry/src/main/ets",
      sourceOverrides: { "Use.ets": 'import { TargetThing } from "./Target"\n'
        + "export const selected = new TargetThing()\nconst platform = new PlatformThing()\n"
        + "const platformValue: number = platform.value\n" },
      beforeStart({ workspace }) {
        targetRoot = path.join(workspace, "entry")
        profilePath = path.join(workspace, "build-profile.json5")
        profile = { app: { products: [{ name: "default" }] }, modules: [{ name: "entry", srcPath: "./entry",
          targets: [{ name: "tablet", applyToProducts: ["default"] }] }] }
        fs.writeFileSync(profilePath, JSON.stringify(profile))
        fs.writeFileSync(path.join(targetRoot, "build-profile.json5"), JSON.stringify({ targets:
          ["tablet", "desktop"].map(name => ({ name, source: { sourceRoots: [`./src/${name}`] } })) }))
        for (const [index, name] of ["tablet", "desktop"].entries()) {
          const file = path.join(targetRoot, "src", name, "Platform.ets")
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.writeFileSync(file, texts[index])
        }
      },
      async afterPromotion({ session, sources, uri }) {
        const query = { textDocument: { uri: uri("Use.ets") },
          position: positionAt(sources["Use.ets"], sources["Use.ets"].indexOf("PlatformThing") + 1) }
        for (const [index, name] of ["tablet", "desktop"].entries()) {
          if (index === 1) {
            profile.modules[0].targets[0].name = "desktop"
            fs.writeFileSync(profilePath, JSON.stringify(profile))
            session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
              params: { changes: [{ uri: pathToFileURL(profilePath).href, type: 2 }] } })
          }
          const definition = await session.request("textDocument/definition", query, { timeoutMs: 20_000 })
          assert.equal(definition.error, undefined, JSON.stringify(definition.error))
          assert.deepEqual(definition.result, [{ uri: pathToFileURL(path.join(targetRoot, "src", name, "Platform.ets")).href,
            range: rangeAt(texts[index], texts[index].indexOf("PlatformThing"), "PlatformThing") }])
        }
        const publication = session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === uri("Use.ets") && message.params.version === 2, 20_000)
        session.changeDocument({ uri: uri("Use.ets"), version: 2, text: sources["Use.ets"] })
        const diagnostics = (await publication).params.diagnostics
        assert.deepEqual(diagnostics.map(value => value.code), [2322])
        assert.deepEqual(diagnostics[0].range,
          rangeAt(sources["Use.ets"], sources["Use.ets"].indexOf("platformValue"), "platformValue"))
        return 2
      },
    })
    assert.ok(changed.promotions.length > 0)
    if (enabled) assert.equal(changed.promoted.programSequence, changed.warm.programSequence)
  }
})

async function replay(t, { enabled, benchmark = true, edit = false, editOnOpen = false,
  sourceOverrides = {}, sourceRoot = ".", beforeStart, afterPromotion } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-same-content-promotion-"))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const sourceDirectory = path.join(workspace, sourceRoot)
  fs.mkdirSync(sourceDirectory, { recursive: true })
  const sources = {
    "Target.ets": "export class TargetThing { value: number = 1 }\n",
    "Use.ets": 'import { TargetThing } from "./Target"\n'
      + "export const selected = new TargetThing()\n",
    "Other.ets": "export class OtherThing {}\n",
    ...sourceOverrides,
  }
  // Exceed the bounded 256-document preparation closure. Full references must
  // still compile the remaining member roots through the lazy host.
  for (let index = 0; index < 270; index++) {
    sources[`Filler${String(index).padStart(3, "0")}.ets`] = `export const filler${index} = ${index}\n`
  }
  for (const [name, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(sourceDirectory, name), source)
  }
  const initialization = await beforeStart?.({ root, workspace, sources }) ?? {}
  const uri = name => pathToFileURL(path.join(sourceDirectory, name)).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_BENCHMARK_CONTROL: benchmark ? "1" : "0",
      ARKTS_L02_SAME_CONTENT_PROMOTION: enabled ? "1" : "0",
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ ...initialization, timeoutMs: 10_000 })
  const diagnostics = []
  const definitions = []
  for (const name of ["Target.ets", "Use.ets"]) {
    if (name === "Use.ets" && editOnOpen) sources[name] = "// changed on open 😀\n" + sources[name]
    const publication = session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri(name) && message.params.version === 1, 20_000)
    session.openDocument({ uri: uri(name), version: 1, text: sources[name] })
    const message = await publication
    diagnostics.push({ name, version: message.params.version, values: message.params.diagnostics })
    assert.deepEqual(message.params.diagnostics, [], "normal v1 diagnostics must remain exact")
    const source = sources[name]
    if (name === "Target.ets") {
      const response = await session.request("textDocument/references", {
        textDocument: { uri: uri(name) },
        position: positionAt(source, source.indexOf("TargetThing") + 1),
        context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const expected = [{ uri: uri("Target.ets"), range: rangeAt(source, source.indexOf("TargetThing"), "TargetThing") },
        ...[sources["Use.ets"].indexOf("TargetThing"), sources["Use.ets"].lastIndexOf("TargetThing")]
          .map(offset => ({ uri: uri("Use.ets"), range: rangeAt(sources["Use.ets"], offset, "TargetThing") }))]
      assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
    }
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: uri(name) },
      position: positionAt(source, source.lastIndexOf("TargetThing") + 1),
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual(response.result, [{ uri: uri("Target.ets"),
      range: rangeAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing"), "TargetThing") }])
    definitions.push(response.result.map(location => ({ name: "Target.ets", range: location.range })))
  }
  if (edit) {
    const original = sources["Use.ets"]
    for (const [version, source] of [
      [2, "// unsaved 😀\n" + original + 'export const again = new TargetThing()\nconst broken: number = "wrong"\n'],
      [3, "// removed reference 😀\n" + original],
    ]) {
      const publication = session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === version, 20_000)
      session.changeDocument({ uri: uri("Use.ets"), version, text: source })
      const position = positionAt(source, source.lastIndexOf("TargetThing") + 1)
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri: uri("Use.ets") }, position,
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [{ uri: uri("Target.ets"),
        range: rangeAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing"), "TargetThing") }])
      const message = await publication
      assert.deepEqual(message.params.diagnostics.map(value => value.code), version === 2 ? [2322] : [])
      const references = await session.request("textDocument/references", {
        textDocument: { uri: uri("Use.ets") }, position, context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.equal(references.error, undefined, JSON.stringify(references.error))
      const expected = [{ uri: uri("Target.ets"),
        range: rangeAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing"), "TargetThing") },
      ...[...source.matchAll(/TargetThing/g)].map(match => ({ uri: uri("Use.ets"),
        range: rangeAt(source, match.index, "TargetThing") }))]
      assert.deepEqual(references.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
    }
  }
  const additionalDefinitions = await afterPromotion?.({ session, sources, uri, workspace, root }) ?? 0
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  const queries = events.filter(entry => entry.event === "semantic.definition.complete")
  const minimumQueries = (edit ? 4 : 2) + additionalDefinitions
  if (afterPromotion) assert.ok(queries.length >= minimumQueries,
    "all public definition requests must have compiler observations; a scope fallback may add observations")
  else assert.equal(queries.length, minimumQueries)
  const promotions = events.filter(entry => entry.event === "semantic.prepare.script-admission"
    && entry.promotedWithMatchingFingerprint > 0)
  const sourceIdentities = events.filter(entry => Number.isSafeInteger(entry.programSequence))
  return { definitions, diagnostics, warm: queries[0], promoted: queries[1], promotions,
    edited: queries.slice(2), sourceIdentities }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1,
    character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeAt(source, offset, name) {
  return { start: positionAt(source, offset), end: positionAt(source, offset + name.length) }
}
