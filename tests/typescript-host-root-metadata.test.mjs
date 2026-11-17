import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-host-root-metadata-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outfile = path.join(root, "entry.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/core/types/typescript-host-file-names.ts")],
    outfile, bundle: true, platform: "node", format: "cjs", target: "node20" })
  const { TypeScriptHostRoots } = createRequire(import.meta.url)(outfile)
  const sdk = path.join(root, "sdk.d.ts"), a = path.join(root, "Z.ets"), b = path.join(root, "A.ets")
  return { host: new TypeScriptHostRoots(root, [sdk]), sdk, a, b }
}

test("host metadata keeps a frozen normalized list while preserving the compiler's original root order", t => {
  const { host, sdk, a, b } = fixture(t)
  host.updateMembership(true, new Set([a, b]))
  const first = host.metadataNames()
  assert.ok(Object.isFrozen(first))
  assert.deepEqual(first, [a, b, sdk].sort())
  assert.deepEqual(host.names(), [a, b, sdk], "metadata sorting must not change script binding order")
  assert.equal(host.metadataNames(), first)
  host.updateSemantic([b])
  assert.deepEqual(host.metadataNames(), [b, sdk].sort())
  assert.deepEqual(first, [a, b, sdk].sort(), "earlier metadata is immutable")
  host.clear()
  assert.deepEqual(host.metadataNames(), [sdk])
})

test("inferred roots and removal invalidate metadata without mutating previous receipts", t => {
  const { host, sdk, a, b } = fixture(t)
  const empty = host.metadataNames()
  host.admit(a, false, true)
  const first = host.metadataNames()
  assert.notEqual(first, empty)
  assert.deepEqual(first, [a, sdk].sort())
  host.admit(b, false, true)
  assert.deepEqual(host.metadataNames(), [a, b, sdk].sort())
  host.remove(a)
  assert.deepEqual(host.metadataNames(), [b, sdk].sort())
  assert.deepEqual(first, [a, sdk].sort())
})
