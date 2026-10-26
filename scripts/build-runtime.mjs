#!/usr/bin/env node

import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import path from "node:path"

import { build } from "esbuild"
import { compilerObservationPlugin } from "./compiler-observation-plugin.mjs"

const require = createRequire(import.meta.url)
const compilerLib = path.dirname(require.resolve("typescript"))
const compilerPackage = await fs.readFile(require.resolve("typescript/package.json"))
const compilerArtifact = {
  packageVersion: JSON.parse(compilerPackage.toString("utf8")).version,
  compilerSha256: createHash("sha256").update(await fs.readFile(require.resolve("typescript"))).digest("hex"),
  packageSha256: createHash("sha256").update(compilerPackage).digest("hex"),
}
const libraryFiles = (await fs.readdir(compilerLib, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /^lib(?:\.[a-z0-9]+)*\.d\.ts$/.test(entry.name))
  .map(entry => entry.name)
  .sort()
if (!libraryFiles.includes("lib.es2022.d.ts")) {
  throw new Error("Pinned ArkTS compiler is missing its ES2022 standard library")
}

await build({
  entryPoints: {
    server: "src/server.ts",
    "semantic-worker": "src/semantic/semantic-worker-runtime.ts",
    "reference-verifier-worker": "src/semantic/references/reference-verifier-worker-runtime.ts",
    "diagnostic-verifier-worker": "src/semantic/diagnostics/diagnostic-verifier-worker-runtime.ts",
  },
  bundle: true,
  plugins: [compilerObservationPlugin(require.resolve("typescript"))],
  define: { ARKTS_COMPILER_ARTIFACT_IDENTITY: JSON.stringify(compilerArtifact) },
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
})

for (const file of libraryFiles) {
  await fs.copyFile(path.join(compilerLib, file), path.join("dist", file))
}
await fs.writeFile("dist/arkts-standard-library.json", `${JSON.stringify({
  schema: "arkts-language-server.standard-library",
  schemaVersion: 1,
  files: libraryFiles,
}, null, 2)}\n`)
