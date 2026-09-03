import { buildSync } from "esbuild"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { projectRoot } from "./lsp-process.mjs"

let scriptedServerPath

export function buildScriptedSemanticServer() {
  if (scriptedServerPath !== undefined) return scriptedServerPath

  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-scripted-server-"))
  const outputPath = path.join(outputDirectory, "scripted-semantic-server.cjs")
  const cleanup = () => fs.rmSync(outputDirectory, { recursive: true, force: true })
  process.once("exit", cleanup)

  try {
    buildSync({
      entryPoints: [path.join(projectRoot, "tests", "fixtures", "lsp", "scripted-semantic-server.ts")],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      outfile: outputPath,
    })
  } catch (error) {
    process.removeListener("exit", cleanup)
    cleanup()
    throw error
  }

  scriptedServerPath = outputPath
  return scriptedServerPath
}
