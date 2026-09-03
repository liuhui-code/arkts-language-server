import assert from "node:assert/strict"
import { createRequire } from "node:module"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

const output = path.join(projectRoot, "dist", "sdk-discovery-driver.cjs")
buildSync({
  entryPoints: [path.join(projectRoot, "tests", "fixtures", "sdk", "sdk-discovery-driver.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: output,
})
const driver = createRequire(import.meta.url)(output)

test("derives the per-user DevEco SDK candidate from the current home directory", () => {
  const candidates = driver.candidatesForDarwinHome("/Users/another-developer")

  assert.deepEqual(candidates, [
    "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony",
    "/Applications/DevEco Studio.app/Contents/sdk/default/openharmony",
    "/Users/another-developer/Library/Huawei/Sdk/default/openharmony",
  ])
})
