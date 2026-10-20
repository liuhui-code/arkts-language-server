import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"

for (const degraded of [true, false]) {
  test(`a retained edited ${degraded ? "degraded" : "READY"} Program reuses validated unchanged SDK SourceFiles without reading their text again`,
    { timeout: 30_000 }, t => sourceEvidenceCase(t, degraded))
}

test("degraded initialization validates loaded SDK text before any reference query", { timeout: 30_000 },
  t => sourceEvidenceCase(t, true, false))

async function sourceEvidenceCase(t, degraded, warmReferences = true) {
  const { session, workspace, sdk, directory, rootUri, uri } = createReadinessFixture(t, {
    ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/resident-source-read-counter.cjs")}` })
  const api = path.join(sdk, "ets/api")
  fs.mkdirSync(api)
  for (let index = 0; index < 96; index++) fs.writeFileSync(path.join(api, `@ohos.sourceevidence${index}.d.ts`),
    `export declare class Evidence${index} { value: number }\n`)
  const source = Array.from({ length: 96 }, (_, index) =>
    `import { Evidence${index} } from '@ohos.sourceevidence${index}'`).join("\n")
    + "\nexport class Target { value: number = 1; read(): number { return this.value } }\nexport const result = new Target().value\n"
  fs.writeFileSync(path.join(workspace, "Main.ets"), source)
  if (degraded) fs.writeFileSync(path.join(workspace, "Broken.ets"), 'import missing from "@ohos.missing"\nexport { missing }\n')
  await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
  const prepared = await session.transport.notification("arkts/semanticPreparation",
    message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
  assert.equal(prepared.params.report.semanticState, degraded ? "degraded" : "ready",
    "preserve the actual input and initialization state")
  const sourceReads = () => fs.readdirSync(directory).filter(file => /^resident-source-reads-\d+\.json$/.test(file))
    .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")))
  if (!warmReferences) assert.equal(new Set(sourceReads().flatMap(row => Object.keys(row.phases.unarmed ?? {}))).size,
    96, "initialization must actually validate loaded SDK text before any target query")
  const target = uri("Main.ets"), position = positionAt(source, source.indexOf("value:") + 1)
  session.openDocument({ uri: target, version: 1, text: source })
  if (warmReferences) {
    const warm = await session.request("textDocument/references", {
      textDocument: { uri: target }, position, context: { includeDeclaration: true } })
    assert.equal(warm.error, undefined, JSON.stringify(warm))
    assert.equal(warm.result.length, 3)
  }
  const rename = await session.request("textDocument/rename", {
    textDocument: { uri: target }, position, newName: "probe" })
  assert.equal(rename.error, undefined, JSON.stringify(rename))
  const updated = applyWorkspaceEdit(new Map([[target, source]]), rename.result,
    { documentVersions: new Map([[target, 1]]) }).get(target)
  fs.writeFileSync(path.join(directory, "source-read-phase"), "edited")
  session.changeDocument({ uri: target, version: 2, text: updated })
  const response = await session.request("textDocument/references", {
    textDocument: { uri: target }, position, context: { includeDeclaration: true } })
  assert.equal(response.error, undefined, JSON.stringify(response))
  const expected = [...updated.matchAll(/\bprobe\b/g)].map(match => ({ uri: target, range: {
    start: positionAt(updated, match.index), end: positionAt(updated, match.index + 5) } }))
  assert.deepEqual(response.result, expected)
  const observations = sourceReads()
    .filter(row => Object.keys(row.phases.unarmed ?? {}).length > 0)
  assert.equal(observations.length, 1, "use the actual initialized owner")
  assert.equal(Object.keys(observations[0].phases.unarmed).length, 96,
    "each SDK file was actually validated against disk before arming")
  const reads = Object.values(observations[0].phases.edited ?? {}).reduce((sum, value) => sum + value, 0)
  t.diagnostic(JSON.stringify({ sdkInputs: 96, repeatedSourceTextReads: reads }))
  assert.equal(reads, 0, "unchanged SourceFile identity plus its still-current validated disk stamp needs no new text read")
  const hostReads = Object.values(observations[0].hostPhases.edited ?? {})
  const hostCount = hostReads.reduce((sum, row) => sum + row.reads, 0)
  t.diagnostic(JSON.stringify({ repeatedHostSdkTextReads: hostCount,
    repeatedHostSdkTextBytes: hostReads.reduce((sum, row) => sum + row.bytes, 0) }))
  assert.equal(hostCount, 0, "the compiler-held SDK snapshot already has a validated read fact; Host must reuse it")
  const identities = observations[0].identityPhases.edited
  assert.equal(Object.keys(identities.before).length, 96, "every reused SDK SourceFile still gets a current observation identity")
  assert.ok(Object.values(identities.before).every(count => count >= 1))
  const afterReads = Object.values(identities.after).reduce((sum, value) => sum + value, 0)
  t.diagnostic(JSON.stringify({ beforeIdentities: Object.values(identities.before).reduce((a, b) => a + b, 0), afterReadIdentities: afterReads }))
  assert.equal(afterReads, 0, "a reused actual text fact performs no read, so it needs no duplicate post-read identity check")
  const rawIdentities = Object.values(observations[0].rawIdentityPhases.edited)
  assert.equal(rawIdentities.length, 96)
  t.diagnostic(JSON.stringify({ actualSdkIdentityReads: rawIdentities.reduce((a, b) => a + b, 0), perInput: [...new Set(rawIdentities)] }))
  assert.ok(rawIdentities.every(count => count === 2),
    "each SDK input needs one fresh query-phase identity and one independent fresh final-union identity")
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
}
