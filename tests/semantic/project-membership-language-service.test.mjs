import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"
import { CompletionItemKind } from "vscode-languageserver/node.js"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("completes an unopened class outside the resident document window", async (t) => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-project-membership-lsp-"))
  const sourceRoot = path.join(workspaceRoot, "src", "main", "ets")
  await fs.promises.mkdir(sourceRoot, { recursive: true })
  const fillerPaths = Array.from({ length: 300 }, (_, index) => (
    path.join(sourceRoot, `A${String(index).padStart(3, "0")}Filler.ets`)
  ))
  await Promise.all(fillerPaths.map((filePath, index) => (
    fs.promises.writeFile(filePath, `export class Filler${index} {}\n`, "utf8")
  )))
  const targetName = "ZzzRemoteTarget"
  const targetPath = path.join(sourceRoot, `${targetName}.ets`)
  const targetSource = `const face = '😀'\nexport struct ${targetName} {}\n`
  await fs.promises.writeFile(targetPath, targetSource, "utf8")
  const prefix = "ZzzRemote"
  const mainSource = `const selected = ${prefix}\n`
  const mainPath = path.join(sourceRoot, "Main.ets")
  await fs.promises.writeFile(mainPath, mainSource, "utf8")

  const sortedPaths = [mainPath, targetPath, ...fillerPaths].sort()
  assert.ok(sortedPaths.indexOf(targetPath) >= 256, "target must be outside the resident 256-file window")
  const prefixStart = mainSource.indexOf(prefix)
  const replacementRange = {
    start: positionAt(mainSource, prefixStart),
    end: positionAt(mainSource, prefixStart + prefix.length),
  }
  const mainUri = pathToFileURL(mainPath).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(workspaceRoot, "missing-home"),
      DEVECO_SDK_HOME: path.join(workspaceRoot, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(workspaceRoot, "missing-sdk"),
    },
    rootUri: pathToFileURL(workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({ uri: mainUri, languageId: "arkts", version: 1, text: mainSource })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: mainUri },
    position: replacementRange.end,
  }, { timeoutMs: 10_000 })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const targets = items.filter((item) => item.label === targetName)
  assert.equal(targets.length, 1, `Expected one ${targetName} in ${JSON.stringify(items)}`)
  assert.equal(targets[0].kind, CompletionItemKind.Class)
  assert.deepEqual(targets[0].textEdit, {
    range: replacementRange,
    newText: targetName,
  })

  const definitionSource = `type Selected = import("./${targetName}.ets").${targetName}\n`
  session.changeDocument({ uri: mainUri, version: 2, text: definitionSource })
  const usageOffset = definitionSource.lastIndexOf(targetName)
  assert.notEqual(usageOffset, -1)
  const definitionResponse = await session.request("textDocument/definition", {
    textDocument: { uri: mainUri },
    position: positionAt(definitionSource, usageOffset + 1),
  })
  assert.equal(definitionResponse.error, undefined, JSON.stringify(definitionResponse.error))
  const locations = Array.isArray(definitionResponse.result)
    ? definitionResponse.result
    : [definitionResponse.result]
  const targetOffset = targetSource.indexOf(targetName)
  const targetRange = {
    start: positionAt(targetSource, targetOffset),
    end: positionAt(targetSource, targetOffset + targetName.length),
  }
  const targetPrefix = targetSource.slice(0, targetOffset)
  assert.equal(targetPrefix.length - Array.from(targetPrefix).length, 1)
  assert.deepEqual(locations, [{ uri: pathToFileURL(targetPath).href, range: targetRange }])
  assert.equal(textInRange(targetSource, targetRange), targetName)

  const renamedTarget = "ZzzRenamedTarget"
  await fs.promises.writeFile(
    targetPath,
    `const face = '😀'\nexport struct ${renamedTarget} {}\n`,
    "utf8",
  )
  session.transport.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(targetPath).href, type: 2 }] },
  })
  const changedMain = [
    `const renamed = ${renamedTarget.slice(0, -6)}`,
    `const stale = ${targetName.slice(0, -6)}`,
    "",
  ].join("\n")
  session.changeDocument({ uri: mainUri, version: 3, text: changedMain })
  const renamedResponse = await session.request("textDocument/completion", {
    textDocument: { uri: mainUri },
    position: positionAt(changedMain, changedMain.indexOf("\n")),
  })
  assert.equal(renamedResponse.error, undefined, JSON.stringify(renamedResponse.error))
  const renamedItems = Array.isArray(renamedResponse.result)
    ? renamedResponse.result
    : renamedResponse.result?.items ?? []
  assert.equal(renamedItems.filter((item) => item.label === renamedTarget).length, 1)
  assert.equal(renamedItems.some((item) => item.label === targetName), false)

  const stalePrefixEnd = changedMain.lastIndexOf(targetName.slice(0, -6))
    + targetName.slice(0, -6).length
  const staleResponse = await session.request("textDocument/completion", {
    textDocument: { uri: mainUri },
    position: positionAt(changedMain, stalePrefixEnd),
  })
  assert.equal(staleResponse.error, undefined, JSON.stringify(staleResponse.error))
  const staleItems = Array.isArray(staleResponse.result)
    ? staleResponse.result
    : staleResponse.result?.items ?? []
  assert.equal(staleItems.some((item) => item.label === targetName), false)
})

test("loads complete project membership lazily within hard snapshot bounds", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-project-membership-engine-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const targetName = "LazyTarget"
  const prefix = "LazyTa"
  const mainSource = `const selected = ${prefix}\n`
  const memberPaths = Array.from({ length: 6 }, (_, index) => (
    path.join(workspaceRoot, index === 5 ? `${targetName}.ets` : `Member${index}.ets`)
  ))
  fs.writeFileSync(mainPath, mainSource, "utf8")
  for (const [index, filePath] of memberPaths.entries()) {
    fs.writeFileSync(
      filePath,
      index === 5 ? `export class ${targetName} {}\n` : `export class Member${index} {}\n`,
      "utf8",
    )
  }
  const reads = []
  const { TypeScriptLanguageServiceEngine } = buildEngineDriver(t)
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    readSourceFile(filePath) {
      reads.push(filePath)
      return fs.readFileSync(filePath, "utf8")
    },
    lazySnapshotLimits: { maxFiles: 2, maxBytes: 256 },
  })
  t.after(() => engine.dispose())
  const completeView = workspaceView({
    rootPath: workspaceRoot,
    mainPath,
    mainSource,
    membership: {
      paths: [mainPath, ...memberPaths].sort(),
      status: "complete",
      revision: 7,
    },
  })
  engine.prepare(completeView)

  assert.deepEqual(reads, [], "prepare must not read unopened project members")
  const firstFileNames = engine.scriptFileNames()
  engine.prepare(completeView)
  assert.strictEqual(
    engine.scriptFileNames(),
    firstFileNames,
    "the same complete membership revision must reuse its stable host file-name array",
  )
  assert.deepEqual(reads, [], "repeated prepare must still not read unopened project members")
  const prefixEnd = mainSource.indexOf(prefix) + prefix.length
  const items = engine.complete({
    path: mainPath,
    line: 1,
    column: prefixEnd + 1,
    documentVersion: 1,
    workspaceRoot,
  })
  const state = engine.cacheState()

  assert.equal(items.filter((item) => item.label === targetName).length, 1)
  assert.ok(reads.length > 0, "TypeScript must request unopened snapshots on demand")
  assert.ok(state.lazySnapshots.files <= 2, JSON.stringify(state))
  assert.ok(state.lazySnapshots.bytes <= 256, JSON.stringify(state))
  assert.deepEqual(state.projectMembership, {
    status: "complete",
    revision: 7,
    paths: 7,
  })
})

test("drops resident scripts removed from a newer complete membership", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-replace-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const targetPath = path.join(workspaceRoot, "RemovedTarget.ets")
  const mainSource = "const selected = RemovedTa\n"
  const targetSource = "export class RemovedTarget {}\n"
  fs.writeFileSync(mainPath, mainSource, "utf8")
  fs.writeFileSync(targetPath, targetSource, "utf8")
  const { TypeScriptLanguageServiceEngine } = buildEngineDriver(t)
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot)
  t.after(() => engine.dispose())
  engine.prepare(workspaceView({
    rootPath: workspaceRoot,
    mainPath,
    mainSource,
    documents: [
      { path: mainPath, content: mainSource },
      { path: targetPath, content: targetSource },
    ],
    membership: undefined,
  }))
  const position = {
    path: mainPath,
    line: 1,
    column: mainSource.indexOf("\n") + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  assert.equal(engine.complete(position).filter((item) => item.label === "RemovedTarget").length, 1)

  engine.prepare(workspaceView({
    rootPath: workspaceRoot,
    mainPath,
    mainSource,
    membership: { paths: [mainPath], status: "complete", revision: 2 },
  }))
  const state = engine.cacheState()

  assert.equal(engine.complete(position).some((item) => item.label === "RemovedTarget"), false)
  assert.equal(state.residentScripts.files, 1)
  assert.equal(state.projectMembership.paths, 1)
})

test("removes a deleted path from the stable host file-name view without a membership refresh", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-remove-delta-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const targetPath = path.join(workspaceRoot, "DeletedTarget.ets")
  const mainSource = "const selected = true\n"
  fs.writeFileSync(mainPath, mainSource, "utf8")
  fs.writeFileSync(targetPath, "export class DeletedTarget {}\n", "utf8")
  const { TypeScriptLanguageServiceEngine } = buildEngineDriver(t)
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot)
  t.after(() => engine.dispose())

  engine.prepare(workspaceView({
    rootPath: workspaceRoot,
    mainPath,
    mainSource,
    membership: { paths: [mainPath, targetPath].sort(), status: "complete", revision: 1 },
  }))
  assert.equal(engine.scriptFileNames().includes(targetPath), true)

  fs.rmSync(targetPath)
  engine.prepare(workspaceView({
    rootPath: workspaceRoot,
    mainPath,
    mainSource,
    membership: undefined,
    removedPaths: [targetPath],
  }))

  assert.equal(engine.scriptFileNames().includes(targetPath), false)
  assert.equal(engine.cacheState().projectMembership.paths, 1)
})

test("discards the old complete project view when membership becomes partial", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-partial-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const targetPath = path.join(workspaceRoot, "GlobalTarget.ets")
  const mainSource = "const selected = GlobalTa\n"
  const targetSource = "export class GlobalTarget {}\n"
  fs.writeFileSync(mainPath, mainSource, "utf8")
  fs.writeFileSync(targetPath, targetSource, "utf8")
  const { TypeScriptLanguageServiceEngine } = buildEngineDriver(t)
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot)
  t.after(() => engine.dispose())
  const position = {
    path: mainPath,
    line: 1,
    column: mainSource.indexOf("\n") + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  engine.prepare(workspaceView({
    rootPath: workspaceRoot,
    mainPath,
    mainSource,
    membership: { paths: [mainPath, targetPath].sort(), status: "complete", revision: 1 },
  }))
  assert.equal(engine.complete(position).filter((item) => item.label === "GlobalTarget").length, 1)

  engine.prepare(workspaceView({
    rootPath: workspaceRoot,
    mainPath,
    mainSource,
    membership: {
      paths: [mainPath],
      status: "partial",
      reason: "path-count-limit",
      revision: 2,
    },
  }))
  const state = engine.cacheState()

  assert.equal(engine.complete(position).some((item) => item.label === "GlobalTarget"), false)
  assert.deepEqual(state.projectMembership, {
    status: "partial",
    reason: "path-count-limit",
    revision: 2,
    paths: 0,
  })
  assert.equal(state.lazySnapshots.files, 0)
})

function buildEngineDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-engine-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "typescript-language-service.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "types", "typescript-language-service.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function workspaceView({
  rootPath,
  mainPath,
  mainSource,
  membership,
  documents = [{ path: mainPath, content: mainSource }],
  removedPaths = [],
}) {
  return {
    rootPath,
    documents,
    projectMembership: membership,
    removedPaths,
    contentRevision: 0,
    resetTypeEngine: false,
    state: {
      path: mainPath,
      contentGeneration: 1,
      documentVersion: 1,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: 1,
      syntaxReady: true,
    },
  }
}

function positionAt(source, offset) {
  const lines = source.slice(0, offset).split("\n")
  return { line: lines.length - 1, character: lines.at(-1).length }
}

function textInRange(source, range) {
  const start = offsetAt(source, range.start)
  const end = offsetAt(source, range.end)
  return source.slice(start, end)
}

function offsetAt(source, position) {
  const lines = source.split("\n")
  return lines.slice(0, position.line).reduce((total, line) => total + line.length + 1, 0)
    + position.character
}
