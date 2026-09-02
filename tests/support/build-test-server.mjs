import { buildSync } from "esbuild"
import path from "node:path"

import { projectRoot } from "./lsp-process.mjs"

export const scriptedServerPath = path.join(
  projectRoot,
  "dist",
  "scripted-semantic-server.cjs",
)

export function buildScriptedSemanticServer() {
  buildSync({
    entryPoints: [path.join(projectRoot, "tests", "fixtures", "lsp", "scripted-semantic-server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: scriptedServerPath,
  })
}
