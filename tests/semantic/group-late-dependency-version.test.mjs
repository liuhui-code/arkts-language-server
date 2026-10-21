import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { groupInputWorkspace } from "../fixtures/semantic-group-input-workspace.mjs"

for (const [targetModule, initiallyPreloaded, recreated, cacheDisabled] of [
  ["c", false, false, false], ["aa", true, false, false], ["c", false, true, false], ["c", false, true, true],
]) {
test(`a group first loading a deep dependency after its filtered edit receives the current registry source (preloaded=${initiallyPreloaded}, recreated=${recreated}, cacheDisabled=${cacheDisabled})`,
  { timeout: 45_000 }, async t => {
    const a = "a/src/main/ets/Query.ets", b = "b/src/main/ets/Query.ets", c = `${targetModule}/src/main/ets/Query.ets`
    const originalA = "export class LocalA {}\nexport const result = new LocalA()\n"
    const originalC = "export class DeepLeaf { marker: number = 1 }\n"
    const files = { [a]: originalA, [b]: 'export { DeepLeaf } from "./Chain000"\n', [c]: originalC }
    const d = "d/src/main/ets/Query.ets", sourceD = "export class LocalD {}\nexport const result = new LocalD()\n"
    if (recreated) files[d] = sourceD
    const chainLength = 270
    for (let index = 0; index < chainLength; index++) files[`b/src/main/ets/Chain${String(index).padStart(3, "0")}.ets`] =
      `export { DeepLeaf } from "${index === chainLength - 1 ? `../../../../${targetModule}/src/main/ets/Query`
        : `./Chain${String(index + 1).padStart(3, "0")}`}"\n`
    const { session, directory, workspace, rootUri, uri, write, watch, define, events, preparation } = await groupInputWorkspace(t, files, {
      ARKTS_BENCHMARK_CONTROL: recreated ? "1" : "0",
      ...(recreated ? { ARKTS_TEST_LATE_TOKEN_COLLISION_FILE: c } : {}),
      ...(cacheDisabled ? { ARKTS_TEST_LATE_DISABLE_LAZY_CACHE: "1" } : {}),
      NODE_OPTIONS: `--require=${fileURLToPath(new URL("../fixtures/group-late-dependency-inputs-counter.cjs", import.meta.url))}` })
    assert.equal(preparation.semanticState, "ready", JSON.stringify(preparation))
    const inputs = () => fs.readFileSync(path.join(directory, "group-late-inputs.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse).filter(row => row.roots.length === 1
        && row.roots[0] === path.join(workspace, a))
    const initialInput = inputs()[0]
    assert.equal(initialInput.documents.includes(path.join(workspace, c)), initiallyPreloaded,
      "the test distinguishes an unprepared lazy source from a resident raw snapshot outside A's actual Program")
    const expected = (file, line, length) => [{ uri: uri(file), range: {
      start: { line, character: 13 }, end: { line, character: 13 + length } } }]
    const queryA = async () => {
      const response = await define(a, originalA, "LocalA")
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, expected(a, 0, 6))
    }
    await queryA()
    const before = events().filter(row => row.event === "semantic.definition.complete").at(-1)
    assert.equal(before.programProjectRootFiles, 1, "A starts as an independent semantic group")
    assert.equal(before.programProjectFiles, 1, "A has not loaded the future C dependency")
    if (recreated) {
      assert.deepEqual((await define(b, files[b], "DeepLeaf")).result, expected(c, 0, 8))
      assert.deepEqual((await define(c, originalC, "DeepLeaf")).result, expected(c, 0, 8))
      assert.deepEqual((await define(d, sourceD, "LocalD")).result, expected(d, 0, 6))
      const rootPressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(rootPressure.result, { applied: "level3" }, JSON.stringify(rootPressure))
      const coldRoot = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
      assert.equal(coldRoot.error, undefined, JSON.stringify(coldRoot))
      assert.notEqual(coldRoot.result?.semanticState, "ready", "the first pressure action releases the global scan owner")
      const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure))
    }
    const changedC = `// changed before the first import from A\n${originalC}`
    write(c, changedC)
    watch(c)
    if (recreated) assert.deepEqual((await define(d, sourceD, "LocalD")).result, expected(d, 0, 6),
      "a different unrelated owner consumes the source event before the new A owner is created")
    await queryA()
    if (recreated) assert.notEqual(inputs().at(-1).owner, initialInput.owner, "pressure actually replaced A's owner")
    const consumed = events().filter(row => row.event === "semantic.definition.complete").at(-1)
    assert.equal(consumed.programProjectFiles, 1, "A consumes the unrelated event without loading C")
    const currentA = 'import { DeepLeaf } from "../../../../b/src/main/ets/Query"\n'
      + "export const result = new DeepLeaf().marker\n"
    session.openDocument({ uri: uri(a), version: 1, text: originalA })
    session.changeDocument({ uri: uri(a), version: 2, text: currentA })
    const response = await define(a, currentA, "DeepLeaf")
    const loaded = events().filter(row => row.event === "semantic.definition.complete").at(-1)
    const loadedInput = inputs().at(-1)
    t.diagnostic(JSON.stringify({ chainLength, rawTextWindowLimit: 256, initiallyPreloaded, recreated, cacheDisabled, response,
      initialOwner: initialInput.owner, loadedOwner: loadedInput.owner, tokenCollisionReads: loadedInput.tokenCollisionReads,
      initialDocuments: initialInput.documents.length, loadedDocuments: loadedInput.documents.length,
      beforeProjectFiles: before.programProjectFiles, consumedProjectFiles: consumed.programProjectFiles,
      loadedProjectFiles: loaded?.programProjectFiles, loadedProjectRoots: loaded?.programProjectRootFiles }))
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.ok(!loadedInput.documents.includes(path.join(workspace, c)), "C is beyond the current raw delivery window")
    if (recreated) assert.ok(loadedInput.tokenCollisionReads > 0,
      "the cold-owner test actually preserves the old admission token while current physical metadata and bytes change")
    assert.equal(loaded.programProjectRootFiles, 1, "adding a relative import does not merge real module roots")
    assert.equal(loaded.programProjectFiles, chainLength + 3,
      "the compiler actually traverses the chain beyond the 256-document delivery window")
    assert.deepEqual(response.result, expected(c, 1, 8),
      "a same-version shared registry entry cannot replace newly read current dependency text with its old AST")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}
