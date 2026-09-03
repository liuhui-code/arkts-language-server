import { createRequire } from "node:module"
import path from "node:path"

import { buildSync } from "esbuild"

import { projectRoot } from "./lsp-process.mjs"

export function buildDocumentStoreDriver(outputDirectory) {
  const driverPath = path.join(outputDirectory, "document-store-driver.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "workspace", "document-store.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: driverPath,
  })
  return createRequire(import.meta.url)(driverPath)
}
