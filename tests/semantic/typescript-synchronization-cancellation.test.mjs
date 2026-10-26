import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildDriver, prepareSingleDocument } from "../support/typescript-cancellation-engine.mjs"

test("finishes in-place SDK graph synchronization before cancelling the caller", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-sdk-graph-cancel-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspaceRoot = path.join(root, "workspace")
  const sdkRoot = path.join(root, "sdk")
  const graphRoot = path.join(sdkRoot, "ets", "graph")
  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = [
    "import type { Step0 } from '@ohos.cancellationGraph'",
    "declare const selected: Step0",
    "selected.te",
    "",
  ].join("\n")
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "api"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "toolchains"), { recursive: true })
  fs.mkdirSync(graphRoot, { recursive: true })
  fs.writeFileSync(path.join(workspaceRoot, "local.properties"), `sdk.dir=${sdkRoot.replaceAll("\\", "/")}\n`)
  fs.writeFileSync(mainPath, mainSource)
  fs.writeFileSync(
    path.join(sdkRoot, "ets", "api", "@ohos.cancellationGraph.d.ts"),
    "export type { Step0 } from '../graph/Edge0'\n",
  )
  for (let index = 0; index < 64; index += 1) {
    fs.writeFileSync(
      path.join(graphRoot, `Edge${index}.d.ts`),
      `import type { Step${index + 1} } from './Edge${index + 1}'\n`
        + `export type Step${index} = Step${index + 1}\n`,
    )
  }
  fs.writeFileSync(
    path.join(graphRoot, "Edge64.d.ts"),
    "export interface Step64 { terminal: number }\n",
  )

  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptLanguageServiceEngine,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let checkpointCount = 0
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    checkpoint() {
      checkpointCount += 1
      scope.checkpoint()
    },
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const sixtyFourthTarget = path.join(graphRoot, "Edge63.d.ts")
  const sixtyFifthTargetBase = path.join(graphRoot, "Edge64")
  let sixtyFourthTargetAccessed = false
  let sixtyFifthTargetAccessed = false
  const realStatSync = fs.statSync
  fs.statSync = function instrumentSdkGraphAccess(filePath, ...args) {
    if (typeof filePath === "string") {
      const resolvedPath = path.resolve(filePath)
      if (resolvedPath === sixtyFourthTarget) {
        sixtyFourthTargetAccessed = true
        Atomics.store(
          cancellationView,
          0,
          SemanticWorkerCancelState.clientCancelled,
        )
      }
      if (
        resolvedPath === sixtyFifthTargetBase
        || resolvedPath.startsWith(`${sixtyFifthTargetBase}.`)
      ) sixtyFifthTargetAccessed = true
    }
    return Reflect.apply(realStatSync, this, [filePath, ...args])
  }
  t.after(() => { fs.statSync = realStatSync })

  await assert.rejects(
    scope.run(cancellationCell, () => engine.complete({
      path: mainPath,
      line: 3,
      column: "selected.te".length + 1,
      documentVersion: 1,
      workspaceRoot,
    })),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(sixtyFourthTargetAccessed, true, "the fixture must reach the 64th relative edge")
  assert.equal(sixtyFifthTargetAccessed, true, "the mutating compiler synchronization must finish")
  assert.equal(checkpointCount, 6, "cancellation resumes at the first boundary outside synchronization")
  const fresh = await scope.run(new SharedArrayBuffer(4), () => engine.complete({
    path: mainPath, line: 3, column: "selected.te".length + 1, documentVersion: 1, workspaceRoot,
  }))
  assert.ok(fresh.items.some(item => item.label === "terminal"))
})
