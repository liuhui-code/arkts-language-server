import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"

test("resolves a local Harmony dependency name through its unopened main and ArkTS source", async (t) => {
  const fixture = await localPackageSession(t)
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: fixture.libraryUri,
    range: rangeOf(fixture.library, "LibraryThing"),
  }])
})

test("a relative ArkTS import prefers its source over same-name declaration files for definitions, members and diagnostics", async (t) => {
  const source = "// 😀 source implementation\nexport class Foo {\n  sourceOnly(): number { return 1 }\n  common(): number { return 7 }\n}\n"
  let sourcePath
  const fixture = await localPackageSession(t, { beforeStart: async ({ consumerPath }) => {
    sourcePath = path.join(path.dirname(consumerPath), "Foo.ets")
    await fs.writeFile(sourcePath, source)
    await fs.writeFile(path.join(path.dirname(consumerPath), "Foo.d.ets"),
      "export declare class Foo { declarationOnly(): string; common(): string }\n")
    await fs.writeFile(path.join(path.dirname(consumerPath), "Foo.d.ts"),
      "export declare class Foo { typescriptOnly(): boolean; common(): boolean }\n")
  } })
  // Relative source imports follow the ArkTS source-first extension order;
  // this does not change package typings/types/main entry selection.
  const consumer = "import { Foo } from './Foo'\nconst item = new Foo()\nconst value: number = item.common()\nitem.sourceOnly()\n"
  const diagnostics = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.consumerUri && message.params.version === 2)
  fixture.session.changeDocument({ uri: fixture.consumerUri, version: 2, text: consumer })
  const actualDiagnostics = (await diagnostics).params.diagnostics
  const query = (offset) => ({
    textDocument: { uri: fixture.consumerUri }, position: positionAt(consumer, offset),
  })
  const [definition, methodDefinition, completion] = await Promise.all([
    fixture.session.request("textDocument/definition", query(consumer.indexOf("new Foo") + 5)),
    fixture.session.request("textDocument/definition", query(consumer.indexOf("item.common") + "item.".length + 1)),
    fixture.session.request("textDocument/completion", query(consumer.indexOf("item.sourceOnly") + "item.".length)),
  ])
  for (const response of [definition, methodDefinition, completion]) assert.equal(response.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual({
    definition: definition.result,
    methodDefinition: methodDefinition.result,
    members: items.filter((item) => ["sourceOnly", "declarationOnly", "typescriptOnly", "common"].includes(item.label))
      .map(({ label, kind }) => ({ label, kind })).sort((a, b) => a.label.localeCompare(b.label)),
    diagnostics: actualDiagnostics,
  }, {
    definition: [{ uri: pathToFileURL(sourcePath).href, range: rangeOf(source, "Foo") }],
    methodDefinition: [{ uri: pathToFileURL(sourcePath).href, range: rangeOf(source, "common") }],
    members: [{ label: "common", kind: 2 }, { label: "sourceOnly", kind: 2 }],
    diagnostics: [],
  })
})

test("resolves a declared installed package through its unopened oh_modules entry", async (t) => {
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const installed = path.join(workspaceRoot, "entry", "oh_modules", "shared")
    await fs.mkdir(path.dirname(installed), { recursive: true })
    await fs.cp(path.join(workspaceRoot, "shared"), installed, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"),
      "{ dependencies: { shared: '^1.0.0' } }")
  } })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(path.join(fixture.workspaceRoot, "entry", "oh_modules", "shared", "LibraryThing.ets")).href,
    range: rangeOf(fixture.library, "LibraryThing"),
  }])
})

test("prefers an installed package declaration entry over its JavaScript runtime main", async (t) => {
  const declaration = "// 😀 declaration\nexport declare class LibraryThing { value: number; read(): number }\n"
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const installed = path.join(workspaceRoot, "entry", "oh_modules", "shared")
    await fs.mkdir(installed, { recursive: true })
    await fs.writeFile(path.join(installed, "oh-package.json5"), "{ types: 'Index.d.ets', main: 'Index.js' }")
    await fs.writeFile(path.join(installed, "Index.d.ets"), declaration)
    await fs.writeFile(path.join(installed, "Index.js"), "export class LibraryThing {}\n")
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"),
      "{ dependencies: { shared: '1.0.0' } }")
  } })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(path.join(fixture.workspaceRoot, "entry", "oh_modules", "shared", "Index.d.ets")).href,
    range: rangeOf(declaration, "LibraryThing"),
  }])
})

test("prefers typings over types when both declaration entry fields are present", async (t) => {
  const declaration = "export declare class LibraryThing { value: number; read(): number }\n"
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const installed = path.join(workspaceRoot, "entry", "oh_modules", "shared")
    await fs.mkdir(installed, { recursive: true })
    await fs.writeFile(path.join(installed, "oh-package.json5"),
      "{ typings: 'Preferred.d.ts', types: 'Other.d.ts', main: 'Index.ets' }")
    await fs.writeFile(path.join(installed, "Preferred.d.ts"), declaration)
    await fs.writeFile(path.join(installed, "Other.d.ts"), declaration)
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"),
      "{ dependencies: { shared: '1.0.0' } }")
  } })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(path.join(fixture.workspaceRoot, "entry", "oh_modules", "shared", "Preferred.d.ts")).href,
    range: rangeOf(declaration, "LibraryThing"),
  }])
})

test("resolves a root-installed scoped package through its existing store link", async (t) => {
  const dependencyName = "@example/shared"
  const fixture = await localPackageSession(t, { dependencyName, beforeStart: async ({ workspaceRoot }) => {
    const store = path.join(workspaceRoot, "oh_modules", ".ohpm", "opaque-install-id", "oh_modules", "@example", "shared")
    const installed = path.join(workspaceRoot, "oh_modules", "@example", "shared")
    await fs.mkdir(path.dirname(store), { recursive: true })
    await fs.cp(path.join(workspaceRoot, "shared"), store, { recursive: true })
    await fs.mkdir(path.dirname(installed), { recursive: true })
    await fs.symlink(store, installed, "dir")
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"),
      "{ dependencies: { '@example/shared': '^1.0.0' } }")
  } })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(path.join(fixture.workspaceRoot, "oh_modules", ".ohpm", "opaque-install-id", "oh_modules", "@example", "shared", "LibraryThing.ets")).href,
    range: rangeOf(fixture.library, "LibraryThing"),
  }])
})

test("a lockfile change refreshes a retargeted installation while retaining the unsaved consumer", async (t) => {
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const store = path.join(workspaceRoot, "oh_modules", ".ohpm", "first")
    const installed = path.join(workspaceRoot, "entry", "oh_modules", "shared")
    await fs.mkdir(path.dirname(store), { recursive: true })
    await fs.cp(path.join(workspaceRoot, "shared"), store, { recursive: true })
    await fs.mkdir(path.dirname(installed), { recursive: true })
    await fs.symlink(store, installed, "dir")
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"), "{ dependencies: { shared: '^1.0.0' } }")
    await fs.writeFile(path.join(workspaceRoot, "oh-package-lock.json5"), "{}")
  } })
  const overlay = `// unsaved consumer\n${fixture.consumer}`
  fixture.session.changeDocument({ uri: fixture.consumerUri, version: 2, text: overlay })
  const query = { textDocument: { uri: fixture.consumerUri }, position: positionAt(overlay, overlay.indexOf("new LibraryThing") + 5) }
  const installed = path.join(fixture.workspaceRoot, "entry", "oh_modules", "shared")
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result,
    [{ uri: pathToFileURL(path.join(fixture.workspaceRoot, "oh_modules", ".ohpm", "first", "LibraryThing.ets")).href, range: rangeOf(fixture.library, "LibraryThing") }])
  const replacement = "\nexport struct LibraryThing { read(): number { return 42 } }\n"
  const store = path.join(fixture.workspaceRoot, "oh_modules", ".ohpm", "second")
  await fs.mkdir(store)
  await fs.writeFile(path.join(store, "oh-package.json5"), "{ main: 'Replacement.ets' }")
  await fs.writeFile(path.join(store, "Replacement.ets"), replacement)
  await fs.unlink(installed)
  await fs.symlink(store, installed, "dir")
  const lockfile = path.join(fixture.workspaceRoot, "oh-package-lock.json5")
  await fs.writeFile(lockfile, "{ lockfileVersion: 3 }")
  watched(fixture.session, lockfile, 2)
  const response = await fixture.session.request("textDocument/definition", query)
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(path.join(store, "Replacement.ets")).href,
    range: rangeOf(replacement, "LibraryThing"),
  }])
  const fresh = await fixture.startSession(overlay)
  assert.deepEqual((await fresh.request("textDocument/definition", query)).result, response.result)
})

test("an installed package uses its private transitive dependency rather than the application's other version", async (t) => {
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const storeModules = path.join(workspaceRoot, "oh_modules", ".ohpm", "private-tree", "oh_modules")
    const packageRoot = path.join(storeModules, "shared")
    const privateDependency = path.join(storeModules, "dep")
    const appModules = path.join(workspaceRoot, "entry", "oh_modules")
    await fs.mkdir(packageRoot, { recursive: true })
    await fs.mkdir(privateDependency)
    await fs.mkdir(path.join(appModules, "dep"), { recursive: true })
    await fs.writeFile(path.join(packageRoot, "oh-package.json5"), "{ main: 'Index.ets', dependencies: { dep: '1.0.0' } }")
    await fs.writeFile(path.join(packageRoot, "Index.ets"), "export { LibraryThing } from 'dep'\n")
    await fs.writeFile(path.join(privateDependency, "oh-package.json5"), "{ main: 'PrivateV1.ets' }")
    await fs.cp(path.join(workspaceRoot, "shared", "LibraryThing.ets"), path.join(privateDependency, "PrivateV1.ets"))
    await fs.writeFile(path.join(appModules, "dep", "oh-package.json5"), "{ main: 'PublicV2.ets' }")
    await fs.writeFile(path.join(appModules, "dep", "PublicV2.ets"), "export class LibraryThing { read(): string { return 'wrong version' } }\n")
    await fs.symlink(packageRoot, path.join(appModules, "shared"), "dir")
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"), "{ dependencies: { shared: '1.0.0', dep: '2.0.0' } }")
  } })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(path.join(fixture.workspaceRoot, "oh_modules", ".ohpm", "private-tree", "oh_modules", "dep", "PrivateV1.ets")).href,
    range: rangeOf(fixture.library, "LibraryThing"),
  }])
})

test("two installation links to the same dependency preserve one private class identity", async (t) => {
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const packageRoot = path.join(workspaceRoot, "oh_modules", ".ohpm", "shared-store", "oh_modules", "shared")
    const dependencyRoot = path.join(workspaceRoot, "oh_modules", ".ohpm", "dep-store", "oh_modules", "dep")
    const appModules = path.join(workspaceRoot, "entry", "oh_modules")
    await fs.mkdir(path.join(packageRoot, "oh_modules"), { recursive: true })
    await fs.mkdir(dependencyRoot, { recursive: true })
    await fs.mkdir(appModules, { recursive: true })
    await fs.writeFile(path.join(packageRoot, "oh-package.json5"), "{ main: 'Index.ets', dependencies: { dep: '1.0.0' } }")
    await fs.writeFile(path.join(packageRoot, "Index.ets"), "import { Base } from 'dep'; export class LibraryThing extends Base { read(): number { return 1 } }\n")
    await fs.writeFile(path.join(dependencyRoot, "oh-package.json5"), "{ main: 'Index.ets' }")
    await fs.writeFile(path.join(dependencyRoot, "Index.ets"), "export class Base { private marker: number = 1 }\n")
    await fs.symlink(packageRoot, path.join(appModules, "shared"), "dir")
    await fs.symlink(dependencyRoot, path.join(appModules, "dep"), "dir")
    await fs.symlink(dependencyRoot, path.join(packageRoot, "oh_modules", "dep"), "dir")
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"), "{ dependencies: { shared: '1.0.0', dep: '1.0.0' } }")
  } })
  const consumer = "import { LibraryThing } from 'shared'\nimport { Base } from 'dep'\nconst value: Base = new LibraryThing()\n"
  const diagnostics = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.consumerUri && message.params.version === 2)
  fixture.session.changeDocument({ uri: fixture.consumerUri, version: 2, text: consumer })
  assert.deepEqual((await diagnostics).params.diagnostics, [])
})

test("an opened installation alias supplies its unsaved entry and closing restores the store source", async (t) => {
  const diskSource = "export class LibraryThing { read(): number { return 1 } }\n"
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const store = path.join(workspaceRoot, "oh_modules", ".ohpm", "overlay-store", "oh_modules", "shared")
    const installed = path.join(workspaceRoot, "entry", "oh_modules", "shared")
    await fs.mkdir(store, { recursive: true })
    await fs.mkdir(path.dirname(installed), { recursive: true })
    await fs.writeFile(path.join(store, "oh-package.json5"), "{ main: 'Index.ets' }")
    await fs.writeFile(path.join(store, "Index.ets"), diskSource)
    await fs.symlink(store, installed, "dir")
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
  } })
  const query = { textDocument: { uri: fixture.consumerUri }, position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5) }
  const storeUri = pathToFileURL(path.join(fixture.workspaceRoot, "oh_modules", ".ohpm", "overlay-store", "oh_modules", "shared", "Index.ets")).href
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result,
    [{ uri: storeUri, range: rangeOf(diskSource, "LibraryThing") }])
  const aliasUri = pathToFileURL(path.join(fixture.workspaceRoot, "entry", "oh_modules", "shared", "Index.ets")).href
  const overlaySource = `// unsaved declaration\n\n${diskSource}`
  fixture.session.openDocument({ uri: aliasUri, version: 1, text: overlaySource })
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result,
    [{ uri: aliasUri, range: rangeOf(overlaySource, "LibraryThing") }])
  fixture.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: aliasUri } } })
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result,
    [{ uri: storeUri, range: rangeOf(diskSource, "LibraryThing") }])
})

test("an installation barrel retains the unsaved overlay of its relative implementation", async (t) => {
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    const store = path.join(workspaceRoot, "oh_modules", ".ohpm", "barrel-store", "oh_modules", "shared")
    const installed = path.join(workspaceRoot, "entry", "oh_modules", "shared")
    await fs.mkdir(path.dirname(store), { recursive: true })
    await fs.cp(path.join(workspaceRoot, "shared"), store, { recursive: true })
    await fs.mkdir(path.dirname(installed), { recursive: true })
    await fs.symlink(store, installed, "dir")
    await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
  } })
  const query = { textDocument: { uri: fixture.consumerUri }, position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5) }
  const storeUri = pathToFileURL(path.join(fixture.workspaceRoot, "oh_modules", ".ohpm", "barrel-store", "oh_modules", "shared", "LibraryThing.ets")).href
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result,
    [{ uri: storeUri, range: rangeOf(fixture.library, "LibraryThing") }])
  const aliasUri = pathToFileURL(path.join(fixture.workspaceRoot, "entry", "oh_modules", "shared", "LibraryThing.ets")).href
  const overlay = `// unsaved implementation\n\n${fixture.library}`
  fixture.session.openDocument({ uri: aliasUri, version: 1, text: overlay })
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result,
    [{ uri: aliasUri, range: rangeOf(overlay, "LibraryThing") }])
  fixture.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: aliasUri } } })
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result,
    [{ uri: storeUri, range: rangeOf(fixture.library, "LibraryThing") }])
})

test("completes fields and methods from a named dependency and diagnoses the edited consumer", async (t) => {
  const fixture = await localPackageSession(t)
  const response = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.lastIndexOf("instance.") + "instance.".length),
  })
  assert.equal(response.error, undefined)
  const items = Array.isArray(response.result) ? response.result : response.result.items
  assert.equal(items.find((item) => item.label === "value")?.kind, 5)
  assert.equal(items.find((item) => item.label === "read")?.kind, 2)
  const diagnostics = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.consumerUri && message.params.version === 2)
  fixture.session.changeDocument({ uri: fixture.consumerUri, version: 2, text: `${fixture.consumer}\n` })
  assert.deepEqual((await diagnostics).params.diagnostics, [])
})

test("a watched package main change refreshes warm definitions while retaining the unsaved consumer", async (t) => {
  const fixture = await localPackageSession(t)
  const overlay = `// unsaved consumer\n${fixture.consumer}`
  fixture.session.changeDocument({ uri: fixture.consumerUri, version: 2, text: overlay })
  const query = { textDocument: { uri: fixture.consumerUri }, position: positionAt(overlay, overlay.indexOf("new LibraryThing") + 5) }
  assert.equal((await fixture.session.request("textDocument/definition", query)).result[0].uri, fixture.libraryUri)
  const replacementPath = path.join(fixture.workspaceRoot, "shared", "Replacement.ets")
  const replacement = "\nexport struct LibraryThing { read(): number { return 42 } }\n"
  await fs.writeFile(replacementPath, replacement)
  const manifestPath = path.join(fixture.workspaceRoot, "shared", "oh-package.json5")
  await fs.writeFile(manifestPath, "{ main: 'Replacement.ets' }")
  watched(fixture.session, manifestPath, 2)
  const response = await fixture.session.request("textDocument/definition", query)
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: pathToFileURL(replacementPath).href, range: rangeOf(replacement, "LibraryThing") }])
  const fresh = await fixture.startSession(overlay)
  assert.deepEqual((await fresh.request("textDocument/definition", query)).result, response.result)
})

test("creating and deleting the nearest package manifest changes a warm named import", async (t) => {
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    await fs.rm(path.join(workspaceRoot, "entry", "oh-package.json5"))
  } })
  const query = { textDocument: { uri: fixture.consumerUri }, position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5) }
  assert.notEqual((await fixture.session.request("textDocument/definition", query)).result?.[0]?.uri, fixture.libraryUri)
  const manifestPath = path.join(fixture.workspaceRoot, "entry", "oh-package.json5")
  await fs.writeFile(manifestPath, "{ dependencies: { shared: 'file:../shared' } }")
  watched(fixture.session, manifestPath, 1)
  assert.equal((await fixture.session.request("textDocument/definition", query)).result[0].uri, fixture.libraryUri)
  await fs.rm(manifestPath)
  watched(fixture.session, manifestPath, 3)
  assert.notEqual((await fixture.session.request("textDocument/definition", query)).result?.[0]?.uri, fixture.libraryUri)
})

for (const [label, manifest] of [
  ["undeclared dependency", "{ dependencies: {} }"],
  ["malformed manifest", "{ dependencies: { shared: 'file:../shared' }"],
  ["oversized manifest", `${" ".repeat(64 * 1024)}{ dependencies: { shared: 'file:../shared' } }`],
]) {
  test(`does not bind ${label} to an unrelated workspace symbol`, async (t) => {
    const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
      await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"), manifest)
    } })
    const diagnostics = fixture.session.transport.notification("textDocument/publishDiagnostics",
      (message) => message.params.uri === fixture.consumerUri && message.params.version === 2)
    fixture.session.changeDocument({ uri: fixture.consumerUri, version: 2, text: `${fixture.consumer}\n` })
    assert.ok((await diagnostics).params.diagnostics.some((diagnostic) => diagnostic.code === 2307))
  })
}

test("uses an unsaved package main without requiring that entry on disk", async (t) => {
  const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot }) => {
    await fs.rm(path.join(workspaceRoot, "shared", "Index.ets"))
  } })
  const entryUri = pathToFileURL(path.join(fixture.workspaceRoot, "shared", "Index.ets")).href
  const entry = "\nexport struct LibraryThing { read(): number { return 7 } }\n"
  fixture.session.openDocument({ uri: entryUri, version: 1, text: entry })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.consumerUri },
    position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: entryUri, range: rangeOf(entry, "LibraryThing") }])
})

test("a package manifest change republishes diagnostics without another source edit", async (t) => {
  const fixture = await localPackageSession(t)
  const initial = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.consumerUri && message.params.version === 1)
  assert.deepEqual(initial.params.diagnostics, [])
  const next = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.consumerUri && message.params.version === 1
      && message.params.diagnostics.some((diagnostic) => diagnostic.code === 2307))
  const manifestPath = path.join(fixture.workspaceRoot, "entry", "oh-package.json5")
  await fs.writeFile(manifestPath, "{ dependencies: {} }")
  watched(fixture.session, manifestPath, 2)
  await next
})

for (const escape of ["main-parent", "main-symlink", "main-symlink-overlay", "dependency-outside-workspace"]) {
  test(`rejects a package source escape (${escape})`, async (t) => {
    const fixture = await localPackageSession(t, { beforeStart: async ({ workspaceRoot, corpusRoot }) => {
      const source = "export class LibraryThing { read(): number { return 99 } }\n"
      if (escape === "dependency-outside-workspace") {
        const outside = path.join(corpusRoot, "outside")
        await fs.mkdir(outside)
        await fs.writeFile(path.join(outside, "oh-package.json5"), "{main:'Index.ets'}")
        await fs.writeFile(path.join(outside, "Index.ets"), source)
        await fs.writeFile(path.join(workspaceRoot, "entry", "oh-package.json5"), "{dependencies:{shared:'file:../../outside'}}")
      } else {
        const outside = path.join(workspaceRoot, "entry", "Outside.ets")
        await fs.writeFile(outside, source)
        if (escape === "main-parent") {
          await fs.writeFile(path.join(workspaceRoot, "shared", "oh-package.json5"), "{main:'../entry/Outside.ets'}")
        } else {
          const entry = path.join(workspaceRoot, "shared", "Index.ets")
          await fs.rm(entry)
          await fs.symlink(outside, entry)
        }
      }
    } })
    if (escape === "main-symlink-overlay") {
      fixture.session.openDocument({
        uri: pathToFileURL(path.join(fixture.workspaceRoot, "shared", "Index.ets")).href,
        version: 1,
        text: "export class LibraryThing { read(): number { return 99 } }\n",
      })
    }
    const response = await fixture.session.request("textDocument/definition", {
      textDocument: { uri: fixture.consumerUri },
      position: positionAt(fixture.consumer, fixture.consumer.indexOf("new LibraryThing") + 5),
    })
    assert.equal(response.error, undefined)
    assert.ok(response.result === null || response.result.every((location) => location.uri === fixture.consumerUri))
  })
}

function watched(session, filePath, type) {
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(filePath).href, type }] } })
}

async function localPackageSession(t, { beforeStart, dependencyName = "shared" } = {}) {
  const materialized = await materializeConformanceWorkspace()
  const sessions = []
  t.after(async () => {
    try { await Promise.all(sessions.map((session) => session.close())) }
    finally { await fs.rm(materialized.root, { recursive: true, force: true }) }
  })
  const libraryPath = path.join(materialized.workspaceRoot, "shared", "LibraryThing.ets")
  const library = "const banner = '😀'; export struct LibraryThing {\n  value: number = 7\n  read(): number { return this.value }\n}\n"
  const consumerPath = path.join(materialized.workspaceRoot, "entry", "src", "main", "ets", "PackageConsumer.ets")
  const consumer = `import { LibraryThing } from '${dependencyName}'\nconst instance = new LibraryThing()\ninstance.read()\n`
  await fs.writeFile(libraryPath, library)
  await fs.writeFile(path.join(materialized.workspaceRoot, "shared", "Index.ets"), "export { LibraryThing } from './LibraryThing'\n")
  await fs.writeFile(path.join(materialized.workspaceRoot, "shared", "oh-package.json5"), "{ name: 'shared', /* module entry */ main: 'Index.ets', }\n")
  await fs.writeFile(consumerPath, consumer)
  const consumerUri = pathToFileURL(consumerPath).href
  const libraryUri = pathToFileURL(libraryPath).href
  await beforeStart?.({ ...materialized, libraryPath, consumerPath })
  const startSession = async (text = consumer) => {
    const session = new LspSession({
      command: process.execPath,
      args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
      cwd: projectRoot,
      env: {
        ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
        ARKTS_LSP_LOG_DIR: path.join(materialized.root, "logs"),
        ARKTS_INDEX_CACHE_DIR: path.join(materialized.root, "cache"),
      },
      rootUri: pathToFileURL(materialized.workspaceRoot).href,
    })
    sessions.push(session)
    await session.initialize()
    session.openDocument({ uri: consumerUri, version: 1, text })
    return session
  }
  const session = await startSession()
  return { ...materialized, session, startSession, library, libraryPath, libraryUri, consumer, consumerUri }
}

function positionAt(source, offset) {
  const before = source.slice(0, offset)
  return { line: before.split("\n").length - 1, character: offset - before.lastIndexOf("\n") - 1 }
}

function rangeOf(source, name) {
  const offset = source.indexOf(name)
  assert.notEqual(offset, -1)
  return { start: positionAt(source, offset), end: positionAt(source, offset + name.length) }
}
