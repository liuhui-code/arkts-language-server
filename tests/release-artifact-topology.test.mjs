import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { TEST_LAYER_MANIFEST } from "./support/test-layer-manifest.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const releaseBuilder = path.join(projectRoot, "scripts", "build-portable-artifact.mjs")
const sealedAcceptance = path.join(
  projectRoot,
  "tests",
  "release",
  "sealed-portable-artifact.acceptance.mjs",
)

test("builds one portable release from one clean staged commit", (t) => {
  const fixture = releaseFixture(t)
  const output = path.join(fixture.root, "release-output")

  const result = spawnSync(process.execPath, [
    releaseBuilder,
    "--source-root", fixture.sourceRoot,
    "--output", output,
  ], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: fixture.environment,
  })

  assert.equal(result.status, 0, result.stderr || result.error?.message)
  const summary = JSON.parse(result.stdout.trim())
  assert.deepEqual(summary, {
    schema: "arkts-language-server.sealed-artifact",
    schemaVersion: 1,
    commit: fixture.commit,
    version: "0.1.0-test",
    archive: `arkts-language-server-0.1.0-test-${process.platform}-${process.arch}.tar`,
    manifest: "artifact-manifest.json",
    checksums: "SHA256SUMS",
  })
  assert.equal(fs.existsSync(path.join(fixture.sourceRoot, "dist")), false)
  assert.equal(fs.existsSync(path.join(fixture.sourceRoot, "target")), false)

  const invocations = fs.readFileSync(fixture.invocationLog, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.deepEqual(invocations.map(({ tool, args }) => ({ tool, args })), [
    { tool: "pnpm", args: "install --frozen-lockfile" },
    { tool: "pnpm", args: "build" },
    { tool: "cargo", args: "build --locked --package arkts-index-sidecar --release" },
  ])
  const buildRoots = new Set(invocations.map(({ cwd }) => cwd))
  assert.equal(buildRoots.size, 1)
  assert.notEqual([...buildRoots][0], fixture.sourceRoot)
  assert.equal(fs.existsSync([...buildRoots][0]), false, "transient staging root must be removed")

  const manifest = JSON.parse(fs.readFileSync(path.join(output, "artifact-manifest.json"), "utf8"))
  assert.equal(manifest.commit, fixture.commit)
  assert.match(manifest.commit, /^[0-9a-f]{40}$/)
  assert.equal(manifest.version, "0.1.0-test")
  assert.deepEqual(manifest.toolchains, {
    node: process.version,
    pnpm: "8.15.9",
    rustc: "rustc 1.95.0 (fixture)",
  })
  const outputEntries = fs.readdirSync(output)
  assert.equal(outputEntries.filter((entry) => entry.endsWith(".tar")).length, 1)
  assert.equal(fs.existsSync(path.join(output, "SHA256SUMS")), true)
  assert.equal(fs.statSync(output).mode & 0o222, 0, "sealed output directory must be read-only")
  for (const entry of outputEntries) {
    assert.equal(
      fs.statSync(path.join(output, entry)).mode & 0o222,
      0,
      `sealed output file must be read-only: ${entry}`,
    )
  }
})

test("accepts the package-runner option separator at the public build boundary", (t) => {
  const fixture = releaseFixture(t)
  const output = path.join(fixture.root, "release-output")

  const result = spawnSync(process.execPath, [
    releaseBuilder,
    "--",
    "--source-root", fixture.sourceRoot,
    "--output", output,
  ], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: fixture.environment,
  })

  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert.equal(fs.existsSync(path.join(output, "artifact-manifest.json")), true)
})

test("accepts the sealed archive without a direct or indirect build", (t) => {
  const fixture = releaseFixture(t)
  const output = path.join(fixture.root, "release-output")
  const build = runReleaseBuilder(fixture, output)
  assert.equal(build.status, 0, build.stderr || build.error?.message)

  const forbiddenLog = path.join(fixture.root, "forbidden-after-seal.log")
  for (const tool of ["pnpm", "cargo", "esbuild"]) {
    writeExecutable(path.join(fixture.toolRoot, tool), `#!/bin/sh
printf '%s\\n' '${tool}' >> "$ARKTS_FORBIDDEN_BUILD_LOG"
exit 97
`)
  }
  const acceptanceEnvironment = {
    ...fixture.environment,
    ARKTS_SEALED_ARTIFACT_DIR: output,
    ARKTS_FORBIDDEN_BUILD_LOG: forbiddenLog,
  }
  delete acceptanceEnvironment.NODE_TEST_CONTEXT
  const acceptance = spawnSync(process.execPath, ["--test", sealedAcceptance], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: acceptanceEnvironment,
  })

  assert.equal(acceptance.status, 0, acceptance.stdout || acceptance.stderr)
  assert.equal(fs.existsSync(forbiddenLog), false, "sealed acceptance invoked a build tool")
})

test("emits byte-identical sealed files for two builds of the same commit", (t) => {
  const fixture = releaseFixture(t)
  const firstOutput = path.join(fixture.root, "release-output-a")
  const secondOutput = path.join(fixture.root, "release-output-b")

  for (const output of [firstOutput, secondOutput]) {
    const result = runReleaseBuilder(fixture, output)
    assert.equal(result.status, 0, result.stderr || result.error?.message)
  }

  const firstEntries = fs.readdirSync(firstOutput).sort(compareOrdinal)
  assert.deepEqual(fs.readdirSync(secondOutput).sort(compareOrdinal), firstEntries)
  for (const entry of firstEntries) {
    assert.deepEqual(
      fs.readFileSync(path.join(firstOutput, entry)),
      fs.readFileSync(path.join(secondOutput, entry)),
      `${entry} differs across clean builds of ${fixture.commit}`,
    )
  }
})

test("rejects a dirty source before invoking any build tool", (t) => {
  const fixture = releaseFixture(t)
  const output = path.join(fixture.root, "release-output")
  fs.appendFileSync(path.join(fixture.sourceRoot, "package.json"), "\n")

  const result = runReleaseBuilder(fixture, output)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /clean Git worktree/i)
  assert.equal(fs.existsSync(output), false)
  assert.equal(fs.existsSync(fixture.invocationLog), false)
})

test("rejects release output inside the source worktree", (t) => {
  const fixture = releaseFixture(t)
  const output = path.join(fixture.sourceRoot, "release-output")

  const result = runReleaseBuilder(fixture, output)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /output must be outside the source worktree/i)
  assert.equal(fs.existsSync(output), false)
  assert.equal(fs.existsSync(fixture.invocationLog), false)
})

test("exposes build and sealed consume-only release commands", () => {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  assert.equal(
    packageMetadata.scripts["build:artifact"],
    "node scripts/build-portable-artifact.mjs",
  )
  assert.equal(
    packageMetadata.scripts["test:e2e:artifact:sealed"],
    "node scripts/run-node-test-layer.mjs --layer sealed-artifact-e2e",
  )
  const sealedLayer = TEST_LAYER_MANIFEST.layers.find(({ id }) => id === "sealed-artifact-e2e")
  assert.deepEqual(sealedLayer, {
    id: "sealed-artifact-e2e",
    fast: false,
    entries: ["tests/release/sealed-portable-artifact.acceptance.mjs"],
  })
})

function releaseFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-release-topology-"))
  t.after(() => {
    makeTreeWritable(root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  const sourceRoot = path.join(root, "source")
  const toolRoot = path.join(root, "tools")
  const invocationLog = path.join(root, "build-invocations.jsonl")
  fs.mkdirSync(sourceRoot)
  fs.mkdirSync(toolRoot)

  writeFile(sourceRoot, "package.json", JSON.stringify({
    name: "arkts-language-server",
    version: "0.1.0-test",
    scripts: { build: "fixture-build" },
  }))
  writeFile(sourceRoot, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
  writeFile(sourceRoot, "Cargo.toml", "[workspace]\nmembers = []\n")
  writeFile(sourceRoot, "Cargo.lock", "# fixture lock\n")
  writeFile(sourceRoot, "config/semantic-runtime.json", "{}\n")
  writeFile(sourceRoot, "bin/arkts-language-server", "#!/bin/sh\nexit 0\n", 0o755)
  for (const relativePath of [
    "scripts/install-local.sh",
    "scripts/artifact/install-from-manifest.mjs",
    "scripts/artifact/build-portable.mjs",
    "tests/support/artifact-manifest.mjs",
  ]) {
    copyProjectFile(sourceRoot, relativePath)
  }

  writeExecutable(path.join(toolRoot, "pnpm"), `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' '8.15.9'
  exit 0
fi
printf '{"tool":"pnpm","cwd":"%s","args":"%s"}\\n' "$PWD" "$*" >> "$ARKTS_RELEASE_BUILD_LOG"
if [ "\${1:-}" = "install" ]; then exit 0; fi
if [ "\${1:-}" = "build" ]; then
  mkdir -p dist
  printf '%s\\n' '// staged semantic worker fixture' > dist/semantic-worker.cjs
  printf '%s\\n' '// staged reference verifier worker fixture' > dist/reference-verifier-worker.cjs
  printf '%s\\n' '// staged server fixture' > dist/server.cjs
  exit 0
fi
exit 91
`)
  writeExecutable(path.join(toolRoot, "cargo"), `#!/bin/sh
printf '{"tool":"cargo","cwd":"%s","args":"%s"}\\n' "$PWD" "$*" >> "$ARKTS_RELEASE_BUILD_LOG"
if [ "\${1:-}" != "build" ]; then exit 92; fi
mkdir -p target/release
printf '%s\\n' 'staged sidecar fixture' > target/release/arkts-index-sidecar
chmod 755 target/release/arkts-index-sidecar
`)
  writeExecutable(path.join(toolRoot, "rustc"), `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' 'rustc 1.95.0 (fixture)'
  exit 0
fi
exit 93
`)

  git(sourceRoot, ["init", "--quiet"])
  git(sourceRoot, ["add", "."])
  git(sourceRoot, [
    "-c", "user.name=ArkTS Test",
    "-c", "user.email=arkts-test@example.invalid",
    "commit", "--quiet", "-m", "fixture",
  ])
  const commit = git(sourceRoot, ["rev-parse", "HEAD"]).stdout.trim()

  return {
    root,
    sourceRoot,
    toolRoot,
    invocationLog,
    commit,
    environment: {
      ...process.env,
      PATH: [toolRoot, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
      ARKTS_RELEASE_BUILD_LOG: invocationLog,
    },
  }
}

function runReleaseBuilder(fixture, output) {
  return spawnSync(process.execPath, [
    releaseBuilder,
    "--source-root", fixture.sourceRoot,
    "--output", output,
  ], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: fixture.environment,
  })
}

function copyProjectFile(destinationRoot, relativePath) {
  const source = path.join(projectRoot, ...relativePath.split("/"))
  const destination = path.join(destinationRoot, ...relativePath.split("/"))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  fs.chmodSync(destination, fs.statSync(source).mode & 0o777)
}

function writeFile(root, relativePath, contents, mode = 0o644) {
  const destination = path.join(root, ...relativePath.split("/"))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, contents, { mode })
}

function writeExecutable(destination, contents) {
  fs.writeFileSync(destination, contents, { mode: 0o755 })
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return result
}

function makeTreeWritable(root) {
  if (!fs.existsSync(root)) return
  const stat = fs.lstatSync(root)
  if (!stat.isDirectory()) {
    fs.chmodSync(root, stat.mode | 0o600)
    return
  }
  fs.chmodSync(root, stat.mode | 0o700)
  for (const entry of fs.readdirSync(root)) makeTreeWritable(path.join(root, entry))
}

function compareOrdinal(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
