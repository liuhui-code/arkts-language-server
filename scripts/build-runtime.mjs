#!/usr/bin/env node

import { build } from "esbuild"

await build({
  entryPoints: {
    server: "src/server.ts",
    "semantic-worker": "src/semantic/semantic-worker-runtime.ts",
  },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
})
