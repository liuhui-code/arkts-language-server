import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createArtifactManifest } from "./support/artifact-manifest.mjs"

test("describes a staging tree with stable artifact metadata and file identities", async (t) => {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-artifact-manifest-"))
  t.after(() => fs.rmSync(stagingRoot, { recursive: true, force: true }))

  fs.mkdirSync(path.join(stagingRoot, "bin"), { recursive: true })
  fs.writeFileSync(path.join(stagingRoot, "server.cjs"), "server bytes\n")
  fs.writeFileSync(path.join(stagingRoot, "bin", "arkts-language-server"), "#!/bin/sh\nexit 0\n")
  fs.chmodSync(path.join(stagingRoot, "server.cjs"), 0o644)
  fs.chmodSync(path.join(stagingRoot, "bin", "arkts-language-server"), 0o755)

  const manifest = await createArtifactManifest({
    root: stagingRoot,
    version: "0.1.0-local-beta.1",
    commit: "0123456789abcdef",
    platform: { os: "darwin", arch: "arm64" },
    toolchains: {
      rustc: "rustc 1.90.0",
      node: "v22.18.0",
      pnpm: "8.15.9",
    },
  })

  assert.deepEqual(manifest, {
    schema: "arkts-language-server.artifact-manifest",
    schemaVersion: 1,
    version: "0.1.0-local-beta.1",
    commit: "0123456789abcdef",
    platform: { arch: "arm64", os: "darwin" },
    toolchains: {
      node: "v22.18.0",
      pnpm: "8.15.9",
      rustc: "rustc 1.90.0",
    },
    files: [
      {
        path: "bin/arkts-language-server",
        size: 17,
        mode: "0755",
        sha256: "306c6ca7407560340797866e077e053627ad409277d1b9da58106fce4cf717cb",
      },
      {
        path: "server.cjs",
        size: 13,
        mode: "0644",
        sha256: "05b4f5c8b5f0fc78e8081e6ff6e3b4157ddda38292134dc0ff5286498dd602c7",
      },
    ],
  })
})

test("rejects a symbolic link that escapes the staging tree", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-artifact-escape-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))

  const stagingRoot = path.join(temporaryRoot, "staging")
  const outsideRoot = path.join(temporaryRoot, "outside")
  fs.mkdirSync(stagingRoot)
  fs.mkdirSync(outsideRoot)
  fs.writeFileSync(path.join(outsideRoot, "secret"), "outside artifact root")
  fs.symlinkSync(outsideRoot, path.join(stagingRoot, "escaped"), "junction")

  await assert.rejects(
    createArtifactManifest({
      root: stagingRoot,
      version: "0.1.0",
      commit: "0123456789abcdef",
      platform: { os: "darwin", arch: "arm64" },
      toolchains: { node: "v22.18.0" },
    }),
    /symbolic link.*escaped/,
  )
})

test("rejects a symbolic link used as the staging root", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-artifact-root-link-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))

  const realRoot = path.join(temporaryRoot, "real-staging")
  const linkedRoot = path.join(temporaryRoot, "linked-staging")
  fs.mkdirSync(realRoot)
  fs.writeFileSync(path.join(realRoot, "server.cjs"), "server bytes\n")
  fs.symlinkSync(realRoot, linkedRoot, "junction")

  await assert.rejects(
    createArtifactManifest({
      root: linkedRoot,
      version: "0.1.0",
      commit: "0123456789abcdef",
      platform: { os: "darwin", arch: "arm64" },
      toolchains: { node: "v22.18.0" },
    }),
    /artifact staging root must not be a symbolic link/,
  )
})
