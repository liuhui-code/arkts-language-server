import { buildSync } from "esbuild"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { projectRoot } from "./lsp-process.mjs"

let currentBuild

export function buildBlockingSemanticTestServer() {
  if (currentBuild !== undefined) return currentBuild

  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-blocking-semantic-"))
  const serverPath = path.join(outputDirectory, "blocking-semantic-server.cjs")
  const workerPath = path.join(outputDirectory, "blocking-semantic-worker.cjs")
  let cleaned = false

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    process.removeListener("exit", cleanup)
    if (currentBuild?.outputDirectory === outputDirectory) currentBuild = undefined
    try {
      fs.rmSync(outputDirectory, { recursive: true, force: true })
    } catch {}
  }
  process.once("exit", cleanup)

  try {
    buildSync({
      entryPoints: {
        "blocking-semantic-server": path.join(
          projectRoot,
          "tests",
          "fixtures",
          "lsp",
          "blocking-semantic-server.ts",
        ),
        "blocking-semantic-worker": path.join(
          projectRoot,
          "tests",
          "fixtures",
          "lsp",
          "blocking-semantic-worker.ts",
        ),
      },
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      outdir: outputDirectory,
      outExtension: { ".js": ".cjs" },
    })
  } catch (error) {
    cleanup()
    throw error
  }

  currentBuild = Object.freeze({ outputDirectory, serverPath, workerPath, cleanup })
  return currentBuild
}
