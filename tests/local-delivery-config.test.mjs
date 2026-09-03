import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const languageConfigPath = path.join(
  projectRoot,
  "editors",
  "zed",
  "languages",
  "arkts",
  "config.toml",
)
const zedWorkflowPath = path.join(projectRoot, ".github", "workflows", "zed-extension.yml")
const releaseDriverPath = path.join(projectRoot, "scripts", "check-release.sh")

test("the package delegates every release check to one serialized driver", () => {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  const releaseDriver = fs.readFileSync(releaseDriverPath, "utf8")

  assert.equal(packageMetadata.scripts["check:release"], "./scripts/check-release.sh")
  assert.match(releaseDriver, /ARKTS_INDEX_REAL_FIXTURE/)
  assert.match(releaseDriver, /ARKTS_LARGE_FIXTURE/)

  const orderedGates = [
    "pnpm check:fast",
    "cargo fmt --all --check",
    "cargo clippy --locked --workspace --all-targets -- -D warnings",
    "cargo test --locked --workspace --all-targets",
    "pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates",
    "cargo build --locked --workspace --release",
    "./scripts/check-zed-queries.sh",
    "cargo fmt --manifest-path editors/zed/Cargo.toml -- --check",
    "cargo build --manifest-path editors/zed/Cargo.toml --locked --target wasm32-wasip2 --release",
    "node --test --test-concurrency=1 tests/release/*.acceptance.mjs",
  ]
  let previousGate = -1
  for (const gate of orderedGates) {
    const gatePosition = releaseDriver.indexOf(gate)
    assert.ok(gatePosition > previousGate, `${gate} must follow the preceding release gate`)
    previousGate = gatePosition
  }
})

test("the ArkTS language config enables comments, autoclosing, and ArkTS identifier characters", () => {
  const config = fs.readFileSync(languageConfigPath, "utf8")

  assert.match(config, /block_comment\s*=\s*\{[^}]*start\s*=\s*"\/\*"[^}]*end\s*=\s*"\*\/"[^}]*\}/s)
  assert.match(config, /documentation_comment\s*=\s*\{[^}]*start\s*=\s*"\/\*\*"[^}]*end\s*=\s*"\*\/"[^}]*\}/s)
  assert.match(config, /autoclose_before\s*=\s*"[^"]+"/)
  assert.match(config, /brackets\s*=\s*\[/)
  assert.ok(config.includes('{ start = "{", end = "}"'))
  assert.ok(config.includes('{ start = "(", end = ")"'))
  assert.ok(config.includes('{ start = "\\\"", end = "\\\""'))
  assert.match(config, /word_characters\s*=\s*\[[^\]]*"\$"[^\]]*\]/)
})

test("the local installer reruns frozen install when its dependency fingerprint changes", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-installer-lock-"))
  const fakeBin = path.join(fixture, "fake-bin")
  const installBin = path.join(fixture, "installed-bin")
  const log = path.join(fixture, "commands.log")
  fs.mkdirSync(path.join(fixture, "scripts"), { recursive: true })
  fs.mkdirSync(path.join(fixture, "bin"), { recursive: true })
  fs.mkdirSync(path.join(fixture, "editors", "zed"), { recursive: true })
  fs.mkdirSync(path.join(fixture, "editors", "zed", "grammars"), { recursive: true })
  fs.mkdirSync(path.join(fixture, "node_modules", ".bin"), { recursive: true })
  fs.mkdirSync(fakeBin)
  fs.copyFileSync(path.join(projectRoot, "scripts", "install-local.sh"), path.join(fixture, "scripts", "install-local.sh"))
  fs.copyFileSync(path.join(projectRoot, "scripts", "check-zed-queries.sh"), path.join(fixture, "scripts", "check-zed-queries.sh"))
  fs.writeFileSync(path.join(fixture, "package.json"), '{"version":"0.0.1"}\n')
  fs.writeFileSync(path.join(fixture, "pnpm-lock.yaml"), "lockfileVersion: one\n")
  const grammarManifest = path.join(fixture, "editors", "zed", "extension.toml")
  const grammarWasm = path.join(fixture, "editors", "zed", "grammars", "arkts.wasm")
  const grammarStamp = path.join(fixture, "editors", "zed", "grammars", ".arkts-source")
  const grammarRepository = "https://example.invalid/tree-sitter-arkts"
  const grammarRevisionA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const grammarRevisionB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const writeGrammarManifest = (revision) => fs.writeFileSync(grammarManifest, `
[grammars.arkts]
repository = "${grammarRepository}"
rev = "${revision}"
`)
  writeGrammarManifest(grammarRevisionA)
  fs.writeFileSync(grammarWasm, "stale grammar")
  fs.writeFileSync(path.join(fixture, "bin", "arkts-language-server"), "#!/bin/sh\nexit 0\n")
  fs.writeFileSync(path.join(fixture, "node_modules", ".bin", "esbuild"), "#!/bin/sh\nexit 0\n")
  fs.writeFileSync(path.join(fakeBin, "pnpm"), `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' "$ARKTS_INSTALL_TEST_PNPM_VERSION"
  exit 0
fi
printf '%s\\n' "$*" >> "$ARKTS_INSTALL_TEST_LOG"
if [ "$1" = "build" ]; then
  mkdir -p dist
  printf '%s\\n' 'process.stdin.resume()' > dist/server.cjs
fi
exit 0
`)
  fs.writeFileSync(path.join(fakeBin, "cargo"), `#!/bin/sh
printf 'cargo %s\\n' "$*" >> "$ARKTS_INSTALL_TEST_LOG"
case "$CARGO_TARGET_DIR" in
  */editors/zed/target)
    mkdir -p "$CARGO_TARGET_DIR/wasm32-wasip2/release"
    printf '\\000asm' > "$CARGO_TARGET_DIR/wasm32-wasip2/release/zed_arkts_local.wasm"
    ;;
  *)
    mkdir -p "$CARGO_TARGET_DIR/release"
    printf '#!/bin/sh\\nexit 0\\n' > "$CARGO_TARGET_DIR/release/arkts-index-sidecar"
    chmod 755 "$CARGO_TARGET_DIR/release/arkts-index-sidecar"
    ;;
esac
exit 0
`)
  for (const executable of [
    path.join(fixture, "scripts", "install-local.sh"),
    path.join(fixture, "scripts", "check-zed-queries.sh"),
    path.join(fixture, "bin", "arkts-language-server"),
    path.join(fixture, "node_modules", ".bin", "esbuild"),
    path.join(fakeBin, "pnpm"),
    path.join(fakeBin, "cargo"),
  ]) fs.chmodSync(executable, 0o755)

  const runInstaller = (pnpmVersion = "8.15.9") => spawnSync(
    path.join(fixture, "scripts", "install-local.sh"),
    [installBin],
    {
      cwd: os.tmpdir(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
        ARKTS_INSTALL_TEST_LOG: log,
        ARKTS_INSTALL_TEST_PNPM_VERSION: pnpmVersion,
      },
    },
  )

  try {
    let result = runInstaller()
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /zed: install dev extension/i)
    assert.match(result.stdout, /editors\/zed/)
    assert.equal(fs.existsSync(grammarWasm), false, "an untracked stale grammar must be invalidated")
    assert.equal(
      fs.readFileSync(grammarStamp, "utf8").trim(),
      `${grammarRepository}\t${grammarRevisionA}`,
    )
    fs.writeFileSync(grammarWasm, "current grammar")
    result = runInstaller()
    assert.equal(result.status, 0, result.stderr)
    assert.equal(fs.readFileSync(grammarWasm, "utf8"), "current grammar")
    fs.writeFileSync(path.join(fixture, "pnpm-lock.yaml"), "lockfileVersion: two\n")
    result = runInstaller()
    assert.equal(result.status, 0, result.stderr)
    assert.equal(fs.readFileSync(grammarWasm, "utf8"), "current grammar")
    writeGrammarManifest(grammarRevisionB)
    result = runInstaller("9.15.9")
    assert.equal(result.status, 0, result.stderr)
    assert.equal(fs.existsSync(grammarWasm), false, "a changed pinned grammar must invalidate its wasm")
    assert.equal(
      fs.readFileSync(grammarStamp, "utf8").trim(),
      `${grammarRepository}\t${grammarRevisionB}`,
    )

    const installs = fs.readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter((command) => command === "install --frozen-lockfile")
    assert.equal(installs.length, 3)

    const fingerprint = JSON.parse(fs.readFileSync(
      path.join(fixture, "node_modules", ".cache", "arkts-language-server", "dependency-fingerprint.json"),
      "utf8",
    ))
    assert.deepEqual(fingerprint, {
      arch: process.arch,
      lockfileSha256: fingerprint.lockfileSha256,
      nodeMajor: process.versions.node.split(".")[0],
      nodeModulesAbi: process.versions.modules,
      platform: process.platform,
      pnpmVersion: "9.15.9",
    })
    assert.match(fingerprint.lockfileSha256, /^[0-9a-f]{64}$/)

    const cargoBuilds = fs.readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter((command) => command.startsWith("cargo build"))
    assert.equal(cargoBuilds.length, 8)
    for (const command of cargoBuilds) assert.match(command, /^cargo build --locked /)
    assert.equal(cargoBuilds.filter((command) => command.includes("--package arkts-index-sidecar")).length, 4)
    assert.equal(cargoBuilds.filter((command) => command.includes("--target wasm32-wasip2")).length, 4)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("the Zed workflow covers every release input and invokes only the canonical release driver", () => {
  const workflow = fs.readFileSync(zedWorkflowPath, "utf8")
  const fixtureRevision = "585feb45114a128a0d2a23947c83faf338e758f7"

  for (const releaseInput of [
    "Cargo.toml",
    "Cargo.lock",
    "crates/**",
    "bin/**",
    "scripts/check-release.sh",
  ]) {
    const occurrences = workflow.split(`- "${releaseInput}"`).length - 1
    assert.equal(occurrences, 2, `${releaseInput} must trigger pull-request and main-push validation`)
  }

  assert.equal(workflow.split("run: pnpm check:release").length - 1, 1)
  for (const duplicatedGate of [
    "pnpm check:fast",
    "cargo fmt --all --check",
    "cargo clippy --locked --workspace --all-targets -- -D warnings",
    "cargo test --locked --workspace --all-targets",
    "pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates",
    "cargo build --locked --workspace --release",
    "./scripts/check-zed-queries.sh",
    "cargo build --locked --target wasm32-wasip2 --release",
  ]) {
    assert.doesNotMatch(workflow, new RegExp(duplicatedGate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.match(workflow, /pnpm install --frozen-lockfile/)
  assert.match(workflow, /repository:\s*netease-kit\/nim-uikit-harmony/)
  assert.match(workflow, new RegExp(`ref:\\s*${fixtureRevision}`))
  assert.match(workflow, /path:\s*\.fixtures\/nim-uikit-harmony/)
  assert.match(workflow, /ARKTS_INDEX_REAL_FIXTURE:\s*\$\{\{ github\.workspace \}\}\/\.fixtures\/nim-uikit-harmony/)
  assert.match(workflow, /ARKTS_LARGE_FIXTURE:\s*\$\{\{ github\.workspace \}\}\/\.fixtures\/nim-uikit-harmony/)
})
