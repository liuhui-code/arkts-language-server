import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

test("installs the exact sealed archive without source dependencies or build tools", async (t) => {
  const bundleRoot = process.env.ARKTS_SEALED_ARTIFACT_DIR
  assert.ok(bundleRoot, "ARKTS_SEALED_ARTIFACT_DIR must name the sealed artifact directory")
  assert.equal(path.isAbsolute(bundleRoot), true, "sealed artifact directory must be absolute")

  const bundleEntries = fs.readdirSync(bundleRoot).sort(compareOrdinal)
  const archiveNames = bundleEntries.filter((entry) => entry.endsWith(".tar"))
  assert.equal(archiveNames.length, 1, "sealed artifact must contain exactly one tar archive")
  assert.deepEqual(
    bundleEntries,
    ["SHA256SUMS", "artifact-manifest.json", archiveNames[0]].sort(compareOrdinal),
  )

  const checksumRecords = parseChecksums(fs.readFileSync(
    path.join(bundleRoot, "SHA256SUMS"),
    "utf8",
  ))
  assert.deepEqual(
    [...checksumRecords.keys()],
    ["artifact-manifest.json", archiveNames[0]].sort(compareOrdinal),
  )
  for (const [fileName, expected] of checksumRecords) {
    assert.equal(await sha256File(path.join(bundleRoot, fileName)), expected)
  }

  const externalManifestBytes = fs.readFileSync(path.join(bundleRoot, "artifact-manifest.json"))
  const manifest = JSON.parse(externalManifestBytes.toString("utf8"))
  assert.equal(manifest.schema, "arkts-language-server.artifact-manifest")
  assert.match(manifest.commit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
  assert.equal(manifest.platform.os, process.platform)
  assert.equal(manifest.platform.arch, process.arch)
  const artifactName = `arkts-language-server-${manifest.version}-${manifest.platform.os}-${manifest.platform.arch}`
  assert.equal(archiveNames[0], `${artifactName}.tar`)

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-sealed-consumer-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const extractionRoot = path.join(temporaryRoot, "extracted")
  fs.mkdirSync(extractionRoot)
  const archivePath = path.join(bundleRoot, archiveNames[0])
  const listing = spawnSync("tar", ["-tf", archivePath], { encoding: "utf8" })
  assert.equal(listing.status, 0, listing.stderr || listing.error?.message)
  const listedPaths = listing.stdout.trim().split("\n")
  assert.ok(listedPaths.length > 1)
  for (const listedPath of listedPaths) assertSafeArchivePath(listedPath, artifactName)
  const extraction = spawnSync("tar", ["-xf", archivePath, "-C", extractionRoot], {
    encoding: "utf8",
  })
  assert.equal(extraction.status, 0, extraction.stderr || extraction.error?.message)

  assert.deepEqual(fs.readdirSync(extractionRoot), [artifactName])
  const artifactRoot = path.join(extractionRoot, artifactName)
  assertNoSymbolicLinks(artifactRoot)
  assert.deepEqual(
    fs.readFileSync(path.join(artifactRoot, "artifact-manifest.json")),
    externalManifestBytes,
  )
  assert.equal(fs.existsSync(path.join(artifactRoot, "src")), false)
  assert.equal(fs.existsSync(path.join(artifactRoot, "node_modules")), false)
  assert.deepEqual(
    collectRelativeFiles(artifactRoot),
    [...manifest.files.map((record) => record.path), "artifact-manifest.json"].sort(compareOrdinal),
  )

  const poisonRoot = path.join(temporaryRoot, "forbidden-build-tools")
  const invocationLog = path.join(temporaryRoot, "forbidden-build-invocations")
  fs.mkdirSync(poisonRoot)
  for (const command of ["cargo", "esbuild", "npm", "npx", "pnpm", "rustc"]) {
    writeExecutable(path.join(poisonRoot, command), `#!/bin/sh
printf '%s\\n' '${command}' >> '${invocationLog}'
exit 97
`)
  }
  const isolatedHome = path.join(temporaryRoot, "home")
  const externalCwd = path.join(temporaryRoot, "external-cwd")
  const binDirectory = path.join(temporaryRoot, "prefix", "bin")
  fs.mkdirSync(isolatedHome)
  fs.mkdirSync(externalCwd)
  const environment = {
    ...process.env,
    HOME: isolatedHome,
    PATH: [poisonRoot, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
  }
  delete environment.ARKTS_INDEX_SIDECAR_PATH
  delete environment.ARKTS_LSP_HOME

  const installation = spawnSync(
    path.join(artifactRoot, "scripts", "install-local.sh"),
    ["--from-artifact", artifactRoot, binDirectory],
    { cwd: externalCwd, encoding: "utf8", env: environment },
  )
  assert.equal(installation.status, 0, installation.stderr || installation.error?.message)
  assert.equal(fs.existsSync(invocationLog), false, "sealed acceptance invoked a build tool")

  const installedCommand = path.join(binDirectory, "arkts-language-server")
  const installedRoot = path.resolve(path.dirname(fs.realpathSync(installedCommand)), "..")
  for (const relativePath of [
    "bin/arkts-language-server",
    "dist/server.cjs",
    `target/release/${process.platform === "win32"
      ? "arkts-index-sidecar.exe"
      : "arkts-index-sidecar"}`,
  ]) {
    assert.deepEqual(
      fs.readFileSync(path.join(installedRoot, ...relativePath.split("/"))),
      fs.readFileSync(path.join(artifactRoot, ...relativePath.split("/"))),
      `installed bytes differ for ${relativePath}`,
    )
    assert.equal(
      fs.statSync(path.join(installedRoot, ...relativePath.split("/"))).mode & 0o777,
      fs.statSync(path.join(artifactRoot, ...relativePath.split("/"))).mode & 0o777,
      `installed mode differs for ${relativePath}`,
    )
  }
})

function parseChecksums(contents) {
  assert.equal(contents.endsWith("\n"), true, "SHA256SUMS must end with a newline")
  const records = new Map()
  for (const line of contents.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64})  ([0-9A-Za-z._+-]+)$/.exec(line)
    assert.ok(match, `invalid SHA256SUMS record: ${line}`)
    assert.equal(records.has(match[2]), false, `duplicate SHA256SUMS record: ${match[2]}`)
    records.set(match[2], match[1])
  }
  assert.deepEqual([...records.keys()], [...records.keys()].sort(compareOrdinal))
  return records
}

function assertSafeArchivePath(candidate, artifactName) {
  assert.equal(candidate.includes("\\"), false)
  assert.equal(path.posix.isAbsolute(candidate), false)
  const segments = candidate.split("/").filter(Boolean)
  assert.equal(segments[0], artifactName)
  assert.equal(segments.includes(".."), false)
  assert.equal(segments.includes("."), false)
}

function assertNoSymbolicLinks(root) {
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      const stat = fs.lstatSync(absolutePath)
      assert.equal(stat.isSymbolicLink(), false, `artifact contains symbolic link: ${absolutePath}`)
      if (stat.isDirectory()) visit(absolutePath)
      else assert.equal(stat.isFile(), true, `artifact contains non-regular entry: ${absolutePath}`)
    }
  }
  visit(root)
}

function collectRelativeFiles(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolutePath)
      else files.push(path.relative(root, absolutePath).split(path.sep).join("/"))
    }
  }
  visit(root)
  return files.sort(compareOrdinal)
}

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents, { mode: 0o755 })
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = fs.createReadStream(filePath)
    stream.once("error", reject)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.once("end", () => resolve(hash.digest("hex")))
  })
}

function compareOrdinal(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
