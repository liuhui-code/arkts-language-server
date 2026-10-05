import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { createSpikeProject } from "../scripts/semantic/ohos-typescript-spike/backend-host.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const builder = path.join(root, "scripts/semantic/semantic-facts-spike/build-worklist-hook.mjs")
const require = createRequire(import.meta.url)

test("origin-v5 builder exposes ordered compiler origins and pins current default v4 bytes", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-origin-hook-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const v4Artifact = path.join(directory, "v4.cjs")
  const v4Build = spawnSync(process.execPath, [builder, "--out", v4Artifact], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
  assert.equal(v4Build.status, 0, `${v4Build.stderr}\n${v4Build.stdout}`)
  assert.equal(JSON.parse(v4Build.stdout).artifactSha256,
    "c19048bf7f87160c9293e903b9dd16079b9bcb7944b069e57f71a36a49518555")

  const artifact = path.join(directory, "v5.cjs")
  const built = spawnSync(process.execPath, [builder, "--variant", "origin-v5", "--out", artifact], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)
  const metadata = JSON.parse(built.stdout)
  assert.equal(metadata.hypothesis, "compiler-origin-reference-groups-v5")
  assert.equal(metadata.hook, "FindAllReferences.Core.bulkConstructorOriginGroups")
  assert.equal(metadata.productionApproved, false)

  const compiler = require(artifact)
  const input = JSON.parse(fs.readFileSync(path.join(root,
    "tests/fixtures/semantic-facts/constructor-edges.json"), "utf8"))
  const project = createSpikeProject(compiler, directory, input.files, { forbidReferenceQueries: true })
  try {
    const program = project.program()
    const sourceFiles = Object.keys(input.files).map((file) => program.getSourceFile(project.fileName(file)))
    const result = compiler.FindAllReferences.Core.bulkConstructorOriginGroups(program, sourceFiles, {
      throwIfCancellationRequested() {},
    })
    assert.equal(result.selections.length, 4)
    assert.ok(result.origins.length >= 1)
    assert.ok(result.selections.every((selection) => selection.originIds.length >= 1))
    assert.ok(result.selections.every((selection) => selection.originIds.every((id) =>
      Number.isInteger(id) && result.origins[id])))
    assert.equal(result.metrics.internalGroupQueries, 0)
    assert.equal(result.metrics.perTargetFullFileScans, 0)
    assert.equal(result.metrics.sharedWorklistPasses, 1)
    assert.equal(result.metrics.originStateCount, result.origins.length)
    assert.equal(result.metrics.definitionCalls, result.selections.length)
    assert.equal(project.stats().referenceSearchCalls, 0)
  } finally {
    project.dispose()
  }
})

test("origin-v5 preserves public-constructor origin roles from stock definition then references", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-origin-role-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const artifact = path.join(directory, "v5.cjs")
  const built = spawnSync(process.execPath, [builder, "--variant", "origin-v5", "--out", artifact], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)
  const input = JSON.parse(fs.readFileSync(path.join(root,
    "tests/fixtures/semantic-facts/constructor-edges.json"), "utf8"))
  const fileName = "edges.ets"
  const selectionStart = input.files[fileName].indexOf("constructor")
  const experimental = createSpikeProject(require(artifact), directory, input.files,
    { forbidReferenceQueries: true })
  const stock = createSpikeProject(require("typescript"), directory, input.files)
  try {
    const program = experimental.program()
    const source = program.getSourceFile(experimental.fileName(fileName))
    const result = require(artifact).FindAllReferences.Core.bulkConstructorOriginGroups(
      program, [source], { throwIfCancellationRequested() {} })
    const selection = result.selections.find((item) => item.textSpan.start === selectionStart)
    assert.ok(selection)
    const definitions = stock.definitions(fileName, selectionStart)
    assert.deepEqual(selection.originIds.map((id) => result.origins[id].definition),
      definitions.map(({ fileName: originFile, textSpan }) => ({ fileName: originFile, textSpan })))
    for (const [index, definition] of definitions.entries()) {
      const expected = stock.referenceGroups(fileName, definition.textSpan.start)
        .flatMap(({ references }) => references).map(referenceIdentity).sort()
      const actual = result.origins[selection.originIds[index]].references
        .map(referenceIdentity).sort()
      assert.deepEqual(actual, expected)
    }
  } finally {
    experimental.dispose()
    stock.dispose()
  }
})

test("usage-v6 yields ordered constructor and inherited class origins for new expressions", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-usage-origin-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const artifact = path.join(directory, "v6.cjs")
  const built = spawnSync(process.execPath, [builder, "--variant", "usage-v6", "--out", artifact], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)
  const metadata = JSON.parse(built.stdout)
  assert.equal(metadata.hypothesis, "compiler-origin-reference-groups-v6")
  assert.equal(metadata.hook, "FindAllReferences.Core.bulkConstructorOriginGroups")
  assert.equal(metadata.productionApproved, false)

  const input = JSON.parse(fs.readFileSync(path.join(root,
    "tests/fixtures/semantic-facts/constructor.json"), "utf8"))
  const fileName = "model.ets"
  const experimental = createSpikeProject(require(artifact), directory, input.files,
    { forbidReferenceQueries: true })
  const stock = createSpikeProject(require("typescript"), directory, input.files)
  try {
    const program = experimental.program()
    const source = program.getSourceFile(experimental.fileName(fileName))
    const result = require(artifact).FindAllReferences.Core.bulkConstructorOriginGroups(
      program, [source], { throwIfCancellationRequested() {} })
    for (const expression of ["new Base", "new Derived"]) {
      const position = input.files[fileName].indexOf(expression) + "new ".length
      const selection = result.selections.find(({ textSpan }) => textSpan.start === position)
      assert.ok(selection, `${expression} selection missing`)
      const definitions = stock.definitions(fileName, position)
      assert.deepEqual(selection.originIds.map((id) => result.origins[id].definition),
        definitions.map(({ fileName: originFile, textSpan }) => ({ fileName: originFile, textSpan })))
      for (const [index, definition] of definitions.entries()) {
        const expected = stock.referenceGroups(fileName, definition.textSpan.start)
          .flatMap(({ references }) => references).map(referenceIdentity).sort()
        const actual = result.origins[selection.originIds[index]].references
          .map(referenceIdentity).sort()
        assert.deepEqual(actual, expected, `${expression} origin ${index}`)
      }
    }
    assert.equal(result.metrics.internalGroupQueries, 0)
    assert.equal(result.metrics.perTargetFullFileScans, 0)
    assert.equal(result.metrics.sharedWorklistPasses, 1)
    assert.equal(result.metrics.originStateCount, result.origins.length)
    assert.equal(result.metrics.definitionCalls, result.selections.length)
    assert.equal(experimental.stats().referenceSearchCalls, 0)
  } finally {
    experimental.dispose()
    stock.dispose()
  }
})

function referenceIdentity(reference) {
  return JSON.stringify([reference.fileName, reference.textSpan.start,
    reference.textSpan.length, reference.isDefinition ?? null])
}
