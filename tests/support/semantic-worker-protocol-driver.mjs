import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { projectRoot } from "./lsp-process.mjs"

export function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-protocol-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "semantic-worker-protocol.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "semantic", "worker-protocol.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
