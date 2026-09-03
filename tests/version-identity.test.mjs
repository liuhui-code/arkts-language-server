import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const LOCAL_BETA_IDENTITY = {
  name: "arkts-language-server",
  version: "0.1.0-local-beta.1",
}

test("reports one Local Beta identity across the package, LSP, and Zed extension", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-build-identity-"))
  const serverPath = path.join(temporaryRoot, "server.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
  })
  const server = new LspProcess({
    serverPath,
    env: { ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs") },
  })
  t.after(async () => {
    await server.close()
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  })

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri: null, capabilities: {} },
  })
  const initialized = await server.response(1)

  const packageMetadata = JSON.parse(fs.readFileSync(
    path.join(projectRoot, "package.json"),
    "utf8",
  ))
  const extensionManifest = fs.readFileSync(
    path.join(projectRoot, "editors", "zed", "extension.toml"),
    "utf8",
  )
  const extensionCargo = fs.readFileSync(
    path.join(projectRoot, "editors", "zed", "Cargo.toml"),
    "utf8",
  )

  assert.deepEqual(
    { name: packageMetadata.name, version: packageMetadata.version },
    LOCAL_BETA_IDENTITY,
  )
  assert.deepEqual(initialized.result.serverInfo, LOCAL_BETA_IDENTITY)
  assert.equal(tomlField(extensionManifest, undefined, "version"), LOCAL_BETA_IDENTITY.version)
  assert.equal(tomlField(extensionCargo, "package", "version"), LOCAL_BETA_IDENTITY.version)
  assert.doesNotMatch(extensionManifest, /\bspike\b/i)
})

test("locks the Zed artifact to the advertised Local Beta version", () => {
  const lockfile = fs.readFileSync(
    path.join(projectRoot, "editors", "zed", "Cargo.lock"),
    "utf8",
  )

  assert.equal(
    cargoLockPackageVersion(lockfile, "zed-arkts-local"),
    LOCAL_BETA_IDENTITY.version,
  )
})

function tomlField(source, section, field) {
  let active = section === undefined
  for (const line of source.split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (sectionMatch) {
      if (section === undefined) break
      active = sectionMatch[1] === section
      continue
    }
    if (!active) continue
    const fieldMatch = line.match(new RegExp(`^\\s*${field}\\s*=\\s*"([^"]+)"\\s*$`))
    if (fieldMatch) return fieldMatch[1]
  }
  assert.fail(`missing ${section ? `[${section}].` : ""}${field}`)
}

function cargoLockPackageVersion(source, packageName) {
  for (const packageBlock of source.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    if (!new RegExp(`^name\\s*=\\s*"${packageName}"\\s*$`, "m").test(packageBlock)) continue
    const version = packageBlock.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1]
    assert.ok(version, `missing locked version for ${packageName}`)
    return version
  }
  assert.fail(`missing locked package ${packageName}`)
}
