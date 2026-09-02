import { buildSync } from "esbuild"
import path from "node:path"
import { createRequire } from "node:module"

import { projectRoot } from "./lsp-process.mjs"

const driverPath = path.join(projectRoot, "dist", "workspace-service-driver.cjs")

export function buildWorkspaceServiceDriver() {
  buildSync({
    entryPoints: [path.join(
      projectRoot,
      "tests",
      "fixtures",
      "workspace",
      "default-workspace-symbol-service-driver.ts",
    )],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: driverPath,
  })
  return createRequire(import.meta.url)(driverPath)
}
