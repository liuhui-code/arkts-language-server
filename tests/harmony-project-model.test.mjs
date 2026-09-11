import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

test("resolves immutable default source and resource scopes for non-default module paths", (t) => {
  const fixture = modelFixture(t)
  const moduleRoot = path.join(fixture.root, "features", "alpha")
  fs.mkdirSync(path.join(moduleRoot, "src", "main", "ets"), { recursive: true })
  fs.writeFileSync(fixture.profilePath, `{
    app: { products: [{ name: 'default' }] },
    modules: [{ name: 'alpha', srcPath: './features/alpha',
      targets: [{ name: 'default', applyToProducts: ['default'] }] }],
  }`)
  fs.writeFileSync(path.join(moduleRoot, "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
  const sourcePath = path.join(moduleRoot, "src", "main", "ets", "NewPage.ets")
  const scope = fixture.model.scopeFor(sourcePath)
  assert.deepEqual(scope, {
    status: "ready",
    moduleRoot,
    targetName: "default",
    sourceRoots: [path.join(moduleRoot, "src", "main")],
    resourceRoots: [path.join(moduleRoot, "src", "main", "resources")],
  })
  assert.throws(() => scope.resourceRoots.push(fixture.root), TypeError)
  assert.throws(() => { scope.moduleRoot = fixture.root }, TypeError)
  assert.deepEqual(fixture.model.scopeFor(sourcePath), scope)
})

test("preserves an unconfigured workspace root without inventing a module", (t) => {
  const fixture = modelFixture(t)
  assert.deepEqual(fixture.model.scopeFor(path.join(fixture.root, "Page.ets")), {
    status: "unconfigured", sourceRoots: [fixture.root], resourceRoots: [fixture.root],
  })
})

test("exposes declared module dependency and reverse-dependency semantic units", (t) => {
  const fixture = modelFixture(t)
  const entryRoot = path.join(fixture.root, "entry")
  const sharedRoot = path.join(fixture.root, "shared")
  for (const moduleRoot of [entryRoot, sharedRoot]) {
    fs.mkdirSync(path.join(moduleRoot, "src", "main", "ets"), { recursive: true })
    fs.writeFileSync(path.join(moduleRoot, "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
  }
  fs.writeFileSync(fixture.profilePath, JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: [
      { name: "entry", srcPath: "./entry", targets: [{ name: "default", applyToProducts: ["default"] }] },
      { name: "shared", srcPath: "./shared", targets: [{ name: "default", applyToProducts: ["default"] }] },
    ],
  }))
  fs.writeFileSync(path.join(entryRoot, "oh-package.json5"), "{ name: 'entry', dependencies: { shared: 'file:../shared' } }")
  fs.writeFileSync(path.join(sharedRoot, "oh-package.json5"), "{ name: 'shared', dependencies: {} }")

  const graph = fixture.model.semanticGraph()
  assert.equal(graph.status, "ready")
  assert.equal(graph.complete, true)
  assert.deepEqual(graph.units.map((unit) => ({
    module: unit.identity.module,
    target: unit.identity.target,
    dependencies: unit.dependencies.map((dependency) => dependency.module),
    reverseDependencies: unit.reverseDependencies.map((dependency) => dependency.module),
  })), [
    { module: "entry", target: "default", dependencies: ["shared"], reverseDependencies: [] },
    { module: "shared", target: "default", dependencies: [], reverseDependencies: ["entry"] },
  ])
  assert.throws(() => graph.units.push(graph.units[0]), TypeError)
  assert.throws(() => graph.units[0].dependencies.push(graph.units[1].identity), TypeError)
})

test("marks the semantic graph incomplete when a local dependency is not a declared module", (t) => {
  const fixture = declaredModule(t)
  fs.writeFileSync(path.join(fixture.moduleRoot, "oh-package.json5"),
    "{ name: 'alpha', dependencies: { ghost: 'file:../ghost' } }")
  fs.mkdirSync(path.join(fixture.root, "ghost"))

  const graph = fixture.model.semanticGraph()
  assert.equal(graph.status, "ready")
  assert.equal(graph.complete, false)
  assert.equal(graph.units.length, 1)
  assert.deepEqual(graph.units[0].dependencies, [])
})

test("keeps a local package nested inside its owning module in the same semantic unit", (t) => {
  const fixture = declaredModule(t)
  const privatePackage = path.join(fixture.moduleRoot, "src", "main", "native", "private")
  fs.mkdirSync(privatePackage, { recursive: true })
  fs.writeFileSync(path.join(fixture.moduleRoot, "oh-package.json5"),
    "{ name: 'alpha', dependencies: { native: 'file:./src/main/native/private' } }")

  const graph = fixture.model.semanticGraph()
  assert.equal(graph.status, "ready")
  assert.equal(graph.complete, true)
  assert.deepEqual(graph.units[0].dependencies, [])
})

test("marks non-empty dynamic module dependencies incomplete instead of guessing edges", (t) => {
  const fixture = declaredModule(t)
  fs.writeFileSync(path.join(fixture.moduleRoot, "oh-package.json5"),
    "{ name: 'alpha', dependencies: {}, dynamicDependencies: { shared: 'file:../shared' } }")

  const graph = fixture.model.semanticGraph()
  assert.equal(graph.status, "ready")
  assert.equal(graph.complete, false)
  assert.deepEqual(graph.units[0].dependencies, [])
})

test("does not infer a project edge from a versioned package with the same module name", (t) => {
  const fixture = modelFixture(t)
  for (const name of ["entry", "shared"]) {
    const moduleRoot = path.join(fixture.root, name)
    fs.mkdirSync(path.join(moduleRoot, "src", "main", "ets"), { recursive: true })
    fs.writeFileSync(path.join(moduleRoot, "build-profile.json5"),
      "{ targets: [{ name: 'default' }] }")
    fs.writeFileSync(path.join(moduleRoot, "oh-package.json5"), name === "entry"
      ? "{ name: 'entry', dependencies: { shared: '^1.0.0' } }"
      : "{ name: 'shared', dependencies: {} }")
  }
  fs.writeFileSync(fixture.profilePath, JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: ["entry", "shared"].map(name => ({
      name,
      srcPath: `./${name}`,
      targets: [{ name: "default", applyToProducts: ["default"] }],
    })),
  }))

  const graph = fixture.model.semanticGraph()
  assert.equal(graph.complete, true)
  assert.deepEqual(graph.units.map(unit => unit.dependencies), [[], []])
})

test("provides selected target source roots before the retained main source root", (t) => {
  const fixture = declaredModule(t)
  const tablet = path.join(fixture.moduleRoot, "src", "tablet")
  fs.mkdirSync(tablet)
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default', source: { sourceRoots: ['./src/tablet'] } }] }")
  assert.deepEqual(fixture.model.scopeFor(fixture.sourcePath).sourceRoots, [
    tablet, path.join(fixture.moduleRoot, "src", "main"),
  ])
})

test("retains a declared source root before its directory materializes", (t) => {
  const fixture = declaredModule(t)
  const tablet = path.join(fixture.moduleRoot, "src", "tablet")
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default', source: { sourceRoots: ['./src/tablet'] } }] }")
  assert.equal(fs.existsSync(tablet), false)
  assert.deepEqual(fixture.model.scopeFor(fixture.sourcePath).sourceRoots, [
    tablet, path.join(fixture.moduleRoot, "src", "main"),
  ])
})

test("rejects a dangling declared source-root symlink", (t) => {
  const fixture = declaredModule(t)
  const tablet = path.join(fixture.moduleRoot, "src", "tablet")
  fs.symlinkSync(path.join(fixture.root, "missing-outside"), tablet, "dir")
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default', source: { sourceRoots: ['./src/tablet'] } }] }")
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
})

test("does not admit target source roots nested beneath main", (t) => {
  const fixture = declaredModule(t)
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default', source: { sourceRoots: ['./src/main/ets'] } }] }")
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
})

test("an empty target resource directory list retains the default main resource directory", (t) => {
  const fixture = declaredModule(t)
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default', resource: { directories: [] } }] }")
  const scope = fixture.model.scopeFor(fixture.sourcePath)
  assert.equal(scope.status, "ready")
  assert.deepEqual(scope.resourceRoots, [path.join(fixture.moduleRoot, "src", "main", "resources")])
})

test("invalid configuration never falls back to resources from the entire workspace", (t) => {
  const fixture = declaredModule(t)
  fs.writeFileSync(fixture.profilePath, "{ modules:")
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
  assert.deepEqual(fixture.model.scopeFor(fixture.sourcePath).resourceRoots, [])
})

test("rejects multiple module targets mapped to the default product", (t) => {
  const fixture = declaredModule(t)
  fixture.profile.modules[0].targets.push({ name: "tablet", applyToProducts: ["default"] })
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  const scope = fixture.model.scopeFor(fixture.sourcePath)
  assert.equal(scope.status, "unavailable")
  assert.equal(scope.moduleRoot, fixture.moduleRoot)
  assert.deepEqual(scope.sourceRoots, [])
  assert.deepEqual(scope.resourceRoots, [])
})

test("rejects a target that is absent from the module profile", (t) => {
  const fixture = declaredModule(t)
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'unrelated' }] }")
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
})

test("does not admit resource directories outside the physical module", (t) => {
  const fixture = declaredModule(t)
  const outside = path.join(fixture.root, "outside-resources")
  fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(fixture.moduleRoot, "resources-link"), "dir")
  fs.writeFileSync(fixture.moduleProfilePath, `{
    targets: [{ name: 'default', resource: { directories: ['./resources-link'] } }],
  }`)
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
})

test("invalidating the project snapshot observes changed module ownership", (t) => {
  const fixture = declaredModule(t)
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "ready")
  fixture.profile.modules = []
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "ready")
  fixture.model.invalidate()
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
})

test("an explicit module target disambiguates valid targets without choosing the first", (t) => {
  const fixture = declaredModule(t)
  fixture.profile.modules[0].targets.push({ name: "tablet", applyToProducts: ["default"] })
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default' }, { name: 'tablet' }] }")
  const model = fixture.createModel({ product: "default", targets: { alpha: "tablet" } })
  assert.equal(model.scopeFor(fixture.sourcePath).targetName, "tablet")
})

test("an explicit product must exist and the overridden module target must belong to it", (t) => {
  const fixture = declaredModule(t)
  fixture.profile.app.products.push({ name: "release" })
  fixture.profile.modules[0].targets.push({ name: "device", applyToProducts: ["release"] })
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default' }, { name: 'device' }] }")
  assert.equal(fixture.createModel({ product: "release" }).scopeFor(fixture.sourcePath).targetName, "device")
  assert.equal(fixture.createModel({ product: "missing" }).scopeFor(fixture.sourcePath).status, "unavailable")
  assert.equal(fixture.createModel({ product: "release", targets: { alpha: "default" } }).scopeFor(fixture.sourcePath).status, "unavailable")
  assert.equal(fixture.createModel({ targets: { missing: "default" } }).scopeFor(fixture.sourcePath).status, "unavailable")
})

test("malformed server project selections fail closed without defaulting", (t) => {
  const fixture = declaredModule(t)
  for (const selection of [
    null, true, "default", [], { product: null }, { product: " " },
    { targets: [] }, { targets: { alpha: 1 } }, { target: "default" },
    { targets: Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`module${index}`, "default"])) },
    Object.create({ product: "default" }),
  ]) {
    assert.equal(fixture.createModel(selection).scopeFor(fixture.sourcePath).status, "unavailable")
  }
})

test("the model captures selection values instead of retaining mutable caller objects", (t) => {
  const fixture = declaredModule(t)
  const selection = { targets: { alpha: "default" } }
  const model = fixture.createModel(selection)
  selection.targets.alpha = "missing"
  assert.equal(model.scopeFor(fixture.sourcePath).targetName, "default")
})

test("an omitted applyToProducts maps a non-ohosTest target to the default product", (t) => {
  const fixture = declaredModule(t)
  delete fixture.profile.modules[0].targets[0].applyToProducts
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  const scope = fixture.model.scopeFor(fixture.sourcePath)
  assert.equal(scope.status, "ready")
  assert.equal(scope.targetName, "default")
})

test("an omitted root targets list uses the sole module-profile target", (t) => {
  const fixture = declaredModule(t)
  delete fixture.profile.modules[0].targets
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default' }] }")
  const scope = fixture.model.scopeFor(fixture.sourcePath)
  assert.equal(scope.status, "ready")
  assert.equal(scope.targetName, "default")
  assert.equal(fixture.model.semanticGraph().status, "ready")
})

test("an omitted module-profile targets list provides the default target", (t) => {
  const fixture = declaredModule(t)
  fs.writeFileSync(fixture.moduleProfilePath, "{ apiType: 'stageMode', buildOption: {} }")
  const scope = fixture.model.scopeFor(fixture.sourcePath)
  assert.equal(scope.status, "ready")
  assert.equal(scope.targetName, "default")
})

test("implicit default mapping excludes ohosTest and does not replace an explicit empty mapping", (t) => {
  const fixture = declaredModule(t)
  fixture.profile.modules[0].targets = [{ name: "ohosTest" }]
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'ohosTest' }] }")
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
  fixture.profile.modules[0].targets = [{ name: "default", applyToProducts: [] }]
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  fs.writeFileSync(fixture.moduleProfilePath, "{ targets: [{ name: 'default' }] }")
  fixture.model.invalidate()
  assert.equal(fixture.model.scopeFor(fixture.sourcePath).status, "unavailable")
})

function declaredModule(t) {
  const fixture = modelFixture(t)
  const moduleRoot = path.join(fixture.root, "alpha")
  const sourceRoot = path.join(moduleRoot, "src", "main", "ets")
  fs.mkdirSync(sourceRoot, { recursive: true })
  const profile = {
    app: { products: [{ name: "default" }] },
    modules: [{ name: "alpha", srcPath: "./alpha", targets: [{ name: "default", applyToProducts: ["default"] }] }],
  }
  const moduleProfilePath = path.join(moduleRoot, "build-profile.json5")
  fs.writeFileSync(fixture.profilePath, JSON.stringify(profile))
  fs.writeFileSync(moduleProfilePath, "{ targets: [{ name: 'default' }] }")
  return { ...fixture, moduleRoot, profile, moduleProfilePath, sourcePath: path.join(sourceRoot, "NewPage.ets") }
}

function modelFixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-project-model-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const root = path.join(temporary, "workspace")
  fs.mkdirSync(root)
  const output = path.join(temporary, "model.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "project", "harmony-project-model.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: output,
  })
  const { HarmonyProjectModel } = createRequire(import.meta.url)(output)
  const createModel = (selection) => new HarmonyProjectModel(root, selection)
  return { root, profilePath: path.join(root, "build-profile.json5"), model: createModel(), createModel }
}
