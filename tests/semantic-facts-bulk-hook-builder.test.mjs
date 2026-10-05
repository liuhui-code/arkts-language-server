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
const builder = path.join(root, "scripts/semantic/semantic-facts-spike/build-bulk-hook.mjs")
const fixturePath = path.join(root, "tests/fixtures/semantic-facts/constructor-heritage-counterexample.json")
const require = createRequire(import.meta.url)

test("pinned bulk-hook artifact groups every fixture constructor using compiler references", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-bulk-hook-builder-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const artifact = path.join(directory, "typescript.cjs")
  const built = spawnSync(process.execPath, [builder, "--out", artifact], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)
  const metadata = JSON.parse(built.stdout)
  assert.equal(metadata.artifactPath, artifact)
  assert.equal(metadata.sourceSha256, "af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc")
  assert.match(metadata.artifactSha256, /^[0-9a-f]{64}$/)

  const compiler = require(artifact)
  const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
  const project = createSpikeProject(compiler, path.dirname(fixturePath), input.files)
  try {
    const program = project.program()
    const sourceFiles = Object.keys(input.files).map((file) => program.getSourceFile(project.fileName(file)))
    const bulk = compiler.FindAllReferences.Core.bulkConstructorReferenceGroups(program, sourceFiles, {
      throwIfCancellationRequested() {},
    })
    assert.equal(bulk.metrics.fullProgramPasses, 1)
    assert.equal(bulk.metrics.innerFindReferencesCalls, 0)
    assert.equal(bulk.metrics.constructorGroups, 1)
    assert.equal(bulk.metrics.internalGroupQueries, 1)
    assert.equal(bulk.groups.length, 1)
    assert.equal(bulk.groups[0].declaration.fileName, project.fileName("heritage.ets"))
    assert.equal(bulk.groups[0].references.length > 0, true)
    const position = input.files["heritage.ets"].indexOf("constructor") + 3
    const stock = project.referenceGroups("heritage.ets", position)
      .flatMap((group) => group.references)
      .map((reference) => JSON.stringify([reference.fileName, reference.textSpan.start,
        reference.textSpan.length, !!reference.isDefinition])).sort()
    const extracted = bulk.groups[0].references
      .map((reference) => JSON.stringify([reference.fileName, reference.textSpan.start,
        reference.textSpan.length, !!reference.isDefinition])).sort()
    assert.deepEqual(extracted, stock)
  } finally {
    project.dispose()
  }
})

test("builder rejects altered compiler bytes before writing an artifact", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-bulk-hook-mismatch-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const changedSource = path.join(directory, "typescript.js")
  fs.writeFileSync(changedSource,
    fs.readFileSync(path.join(root, "node_modules/typescript/lib/typescript.js"), "utf8") + "\n")
  const artifact = path.join(directory, "typescript.cjs")
  const built = spawnSync(process.execPath, [builder, "--out", artifact, "--source", changedSource], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
  assert.equal(built.status, 2)
  assert.match(built.stderr, /PINNED_COMPILER_MISMATCH/u)
  assert.equal(fs.existsSync(artifact), false)
})

test("bulk hook enumerates constructor overloads without a query list", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-bulk-hook-overloads-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const artifact = path.join(directory, "typescript.cjs")
  const built = spawnSync(process.execPath, [builder, "--out", artifact], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
  assert.equal(built.status, 0, built.stderr)
  const compiler = require(artifact)
  const input = JSON.parse(fs.readFileSync(path.join(root,
    "tests/fixtures/semantic-facts/constructor-edges.json"), "utf8"))
  const project = createSpikeProject(compiler, directory, input.files)
  try {
    const source = project.program().getSourceFile(project.fileName("edges.ets"))
    const bulk = compiler.FindAllReferences.Core.bulkConstructorReferenceGroups(project.program(), [source], {
      throwIfCancellationRequested() {},
    })
    assert.equal(bulk.groups.length, 4)
    assert.equal(bulk.metrics.constructorGroups, 4)
    assert.equal(bulk.metrics.internalGroupQueries, 4)
    assert.equal(bulk.metrics.fullProgramPasses, 1)
    assert.equal(bulk.metrics.innerFindReferencesCalls, 0)
    assert.equal(Number.isInteger(bulk.metrics.candidateFileSearches), true)
    assert.equal(bulk.metrics.containerSearches > 0, true)
    assert.equal(bulk.metrics.bulkIndexEntries > 0, true)
    for (const group of bulk.groups) {
      const stock = project.referenceGroups("edges.ets", group.declaration.textSpan.start + 3)
        .flatMap((item) => item.references)
        .map((item) => JSON.stringify([item.fileName, item.textSpan.start,
          item.textSpan.length, !!item.isDefinition])).sort()
      const extracted = group.references.map((item) => JSON.stringify([item.fileName,
        item.textSpan.start, item.textSpan.length, !!item.isDefinition])).sort()
      assert.deepEqual(extracted, stock)
    }
  } finally {
    project.dispose()
  }
})
