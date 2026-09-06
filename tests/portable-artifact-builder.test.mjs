import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const artifactBuilder = path.join(projectRoot, "scripts", "artifact", "build-portable.mjs")
const sidecarPath = `target/release/${process.platform === "win32"
  ? "arkts-index-sidecar.exe"
  : "arkts-index-sidecar"}`

function portableSourceFiles() {
  return new Map([
    ["bin/arkts-language-server", "#!/bin/sh\n# source-root launcher marker\n"],
    ["dist/server.cjs", "// source-root server marker\n"],
    [sidecarPath, "source-root sidecar marker\n"],
    ["scripts/install-local.sh", "#!/bin/sh\n# source-root installer marker\n"],
    [
      "scripts/artifact/install-from-manifest.mjs",
      "// source-root manifest installer marker\n",
    ],
  ])
}

function writeSourceFile(sourceRoot, relativePath, contents, mode = 0o644) {
  const destination = path.join(sourceRoot, ...relativePath.split("/"))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, contents, { mode })
}

function buildArtifact({ sourceRoot, output }) {
  return spawnSync(process.execPath, [
    artifactBuilder,
    "--source-root", sourceRoot,
    "--output", output,
    "--version", "0.1.0-test",
    "--commit", "0123456789abcdef",
    "--toolchains", JSON.stringify({ node: process.version }),
  ], { cwd: os.tmpdir(), encoding: "utf8" })
}

function writePortableSource(sourceRoot, { without } = {}) {
  const files = portableSourceFiles()
  for (const [relativePath, contents] of files) {
    if (relativePath === without) continue
    writeSourceFile(
      sourceRoot,
      relativePath,
      contents,
      relativePath === "dist/server.cjs" ? 0o640 : 0o750,
    )
  }
  return files
}

test("builds every portable file from one explicit source root", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-portable-source-root-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const sourceRoot = path.join(temporaryRoot, "source")
  const output = path.join(temporaryRoot, "artifact")
  const files = writePortableSource(sourceRoot)

  const result = buildArtifact({ sourceRoot, output })
  assert.equal(result.status, 0, result.stderr || result.error?.message)

  const manifest = JSON.parse(fs.readFileSync(path.join(output, "artifact-manifest.json"), "utf8"))
  for (const [relativePath, expectedContents] of files) {
    const artifactPath = path.join(output, ...relativePath.split("/"))
    const sourcePath = path.join(sourceRoot, ...relativePath.split("/"))
    const record = manifest.files.find((candidate) => candidate.path === relativePath)
    assert.equal(fs.readFileSync(artifactPath, "utf8"), expectedContents)
    assert.equal(fs.statSync(artifactPath).mode & 0o777, fs.statSync(sourcePath).mode & 0o777)
    assert.deepEqual(record, {
      path: relativePath,
      size: Buffer.byteLength(expectedContents),
      mode: `0${(fs.statSync(sourcePath).mode & 0o777).toString(8)}`,
      sha256: createHash("sha256").update(expectedContents).digest("hex"),
    })
  }
})

test("rejects a missing required source file without producing a manifest", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-portable-missing-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const sourceRoot = path.join(temporaryRoot, "source")
  const output = path.join(temporaryRoot, "artifact")
  writePortableSource(sourceRoot, { without: "scripts/install-local.sh" })

  const result = buildArtifact({ sourceRoot, output })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /scripts[/\\]install-local\.sh/)
  assert.equal(fs.existsSync(path.join(output, "artifact-manifest.json")), false)
})

test("rejects a required source file that is a symbolic link", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-portable-symlink-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const sourceRoot = path.join(temporaryRoot, "source")
  const output = path.join(temporaryRoot, "artifact")
  writePortableSource(sourceRoot)
  const linkedInput = path.join(sourceRoot, "scripts", "install-local.sh")
  const externalInput = path.join(temporaryRoot, "external-installer.sh")
  fs.writeFileSync(externalInput, "#!/bin/sh\n# external marker\n", { mode: 0o755 })
  fs.unlinkSync(linkedInput)
  fs.symlinkSync(externalInput, linkedInput)

  const result = buildArtifact({ sourceRoot, output })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /portable artifact input path contains a symbolic link/i)
  assert.equal(fs.existsSync(path.join(output, "artifact-manifest.json")), false)
})

test("rejects a required source path that escapes through a symbolic-link directory", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-portable-escape-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const sourceRoot = path.join(temporaryRoot, "source")
  const output = path.join(temporaryRoot, "artifact")
  writePortableSource(sourceRoot)
  const linkedDirectory = path.join(sourceRoot, "scripts", "artifact")
  const externalDirectory = path.join(temporaryRoot, "external-artifact-scripts")
  fs.mkdirSync(externalDirectory)
  fs.writeFileSync(
    path.join(externalDirectory, "install-from-manifest.mjs"),
    "// escaped external installer marker\n",
  )
  fs.rmSync(linkedDirectory, { recursive: true })
  fs.symlinkSync(externalDirectory, linkedDirectory, "dir")

  const result = buildArtifact({ sourceRoot, output })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /symbolic link|outside.*source root/i)
  assert.equal(fs.existsSync(path.join(output, "artifact-manifest.json")), false)
})
