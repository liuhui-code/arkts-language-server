import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"
import { createFixture, diagnostic, selectedL03Policy, warmAndPromote } from "./resident-interactive-lsp.mjs"
import { positionAt } from "./resident-interactive-lsp.mjs"

export { diagnostic, positionAt, readEvents, selectedL03Policy } from "./resident-interactive-lsp.mjs"

export function createEditCallFixture(t) {
  const fixture = createFixture(t)
  const root = path.join(fixture.workspace, "shared")
  fs.mkdirSync(root)
  fs.writeFileSync(path.join(fixture.workspace, "oh-package.json5"),
    "{ dependencies: { shared: 'file:./shared' } }")
  fixture.manifest = path.join(root, "oh-package.json5")
  fixture.entries = ["number", "string"].map((type, index) =>
    `// package entry ${index} 😀\nexport class PackageTarget { value: ${type} = ${index ? '\"new\"' : "1"} }\n`
      + `export function work(): number { return ${index + 1} }\n`)
  for (const [index, name] of ["First.ets", "Second.ets"].entries()) {
    fs.writeFileSync(path.join(root, name), fixture.entries[index])
  }
  fs.writeFileSync(fixture.manifest, "{ main: 'First.ets' }")
  fixture.caller = 'import { PackageTarget, work } from "shared"\n'
    + "export function caller(): number { /* 😀 */ return work() }\n"
    + "export const selected = new PackageTarget()\nexport const broken: number = selected.value\n"
  fs.writeFileSync(path.join(fixture.workspace, "ZPackageCaller.ets"), fixture.caller)
  return fixture
}

export async function startEditCallSession(t, fixture, enabled = true, env = {}, sdkSelection = { path: fixture.sdk }) {
  fixture.runCount = (fixture.runCount ?? 0) + 1
  fixture.logs = path.join(fixture.directory, `logs-${fixture.runCount}`)
  const session = new LspSession({ command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"], cwd: projectRoot,
    rootUri: pathToFileURL(fixture.workspace).href,
    capabilities: { workspace: { workspaceEdit: { documentChanges: true, failureHandling: "transactional" } },
      textDocument: { publishDiagnostics: { versionSupport: true }, rename: { prepareSupport: true }, callHierarchy: {} } },
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.sdk, DEVECO_SDK_HOME: fixture.sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, `cache-${fixture.runCount}`), ARKTS_LSP_LOG_DIR: fixture.logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched", ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
      ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L02_SAME_CONTENT_PROMOTION: enabled ? "1" : "0", ARKTS_MEMORY_BUDGET_MB: "1024",
      ...selectedL03Policy, ...env } })
  t.after(() => session.close().catch(() => {}))
  const initialized = await session.initialize({ timeoutMs: 10_000,
    initializationOptions: { sdk: sdkSelection } })
  assert.deepEqual(initialized.result.capabilities.renameProvider, { prepareProvider: true })
  assert.equal(initialized.result.capabilities.callHierarchyProvider, true)
  return session
}

export async function warmEditCallSession(session, fixture) {
  await warmAndPromote(session, fixture)
  const uri = fixture.uri("ZPackageCaller.ets")
  session.openDocument({ uri, version: 1, text: fixture.caller })
  assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
}

export function packageWorkItem(fixture, index) {
  const source = fixture.entries[index], offset = source.indexOf("function work") + "function ".length
  return { name: "work", kind: 12, uri: fixture.uri(`shared/${index ? "Second" : "First"}.ets`),
    range: { start: positionAt(source, source.indexOf("export function")),
      end: positionAt(source, source.lastIndexOf("}") + 1) },
    selectionRange: { start: positionAt(source, offset), end: positionAt(source, offset + "work".length) },
    data: { arktsCallHierarchy: { protocol: 1, rootUri: pathToFileURL(fixture.workspace).href } } }
}

export function packageCallerItem(fixture, source = fixture.caller) {
  const offset = source.indexOf("function caller") + "function ".length
  const start = source.indexOf("export function caller")
  return { name: "caller", kind: 12, uri: fixture.uri("ZPackageCaller.ets"),
    range: { start: positionAt(source, start), end: positionAt(source, source.indexOf("}", start) + 1) },
    selectionRange: { start: positionAt(source, offset), end: positionAt(source, offset + "caller".length) },
    data: { arktsCallHierarchy: { protocol: 1, rootUri: pathToFileURL(fixture.workspace).href } } }
}
