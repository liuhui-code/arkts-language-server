import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

test("anchor seed position crosses worker transport only with a complete admitted anchor", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-anchor-protocol-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outfile = path.join(root, "protocol.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/semantic/worker-protocol.ts")],
    bundle: true, platform: "node", format: "cjs", target: "node20", outfile })
  const protocol = createRequire(import.meta.url)(outfile)
  const uri = "file:///workspace/Target.ets"
  const args = { position: { line: 1, character: 24 }, includeDeclaration: false,
    candidateUris: [uri], candidateIdentityComplete: true, candidateAnchorUri: uri,
    candidateAnchorPosition: { line: 0, character: 13 } }
  const decode = args => protocol.decodeSemanticWorkerRequest({
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1,
    requiredRevision: 1, method: "references", uri, expectedDocumentVersion: 1, args,
    cancelCell: protocol.createSemanticWorkerCancellationCell(),
  })
  const request = decode(args)
  assert.deepEqual(request.args.candidateAnchorPosition, { line: 0, character: 13 })
  assert.ok(Object.isFrozen(request.args.candidateAnchorPosition))
  args.candidateAnchorPosition.line = 8
  assert.equal(request.args.candidateAnchorPosition.line, 0)
  for (const candidate of [
    { ...args, candidateAnchorUri: undefined },
    { ...args, candidateIdentityComplete: false },
    { ...args, candidateUris: [] },
    { ...args, candidateAnchorPosition: { line: -1, character: 0 } },
    { ...args, candidateAnchorPosition: { line: 0, character: 0, ignored: true } },
  ]) assert.throws(() => decode(candidate), /Invalid semantic worker request/)
  let getterCalled = false
  const hostile = { ...args }
  Object.defineProperty(hostile, "candidateAnchorPosition", {
    enumerable: true, get() { getterCalled = true; return { line: 0, character: 0 } },
  })
  assert.throws(() => decode(hostile), /Invalid semantic worker request/)
  assert.equal(getterCalled, false)
})
