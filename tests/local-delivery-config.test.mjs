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
  fs.mkdirSync(path.join(fixture, "node_modules", ".bin"), { recursive: true })
  fs.mkdirSync(fakeBin)
  fs.copyFileSync(path.join(projectRoot, "scripts", "install-local.sh"), path.join(fixture, "scripts", "install-local.sh"))
  fs.writeFileSync(path.join(fixture, "pnpm-lock.yaml"), "lockfileVersion: one\n")
  fs.writeFileSync(path.join(fixture, "bin", "arkts-language-server"), "#!/bin/sh\nexit 0\n")
  fs.writeFileSync(path.join(fixture, "node_modules", ".bin", "esbuild"), "#!/bin/sh\nexit 0\n")
  fs.writeFileSync(path.join(fakeBin, "pnpm"), `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' "$ARKTS_INSTALL_TEST_PNPM_VERSION"
  exit 0
fi
printf '%s\\n' "$*" >> "$ARKTS_INSTALL_TEST_LOG"
exit 0
`)
  fs.writeFileSync(path.join(fakeBin, "cargo"), `#!/bin/sh
printf 'cargo %s\\n' "$*" >> "$ARKTS_INSTALL_TEST_LOG"
mkdir -p "$CARGO_TARGET_DIR/wasm32-wasip2/release"
printf '\\000asm' > "$CARGO_TARGET_DIR/wasm32-wasip2/release/zed_arkts_local.wasm"
exit 0
`)
  for (const executable of [
    path.join(fixture, "scripts", "install-local.sh"),
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
    result = runInstaller()
    assert.equal(result.status, 0, result.stderr)
    fs.writeFileSync(path.join(fixture, "pnpm-lock.yaml"), "lockfileVersion: two\n")
    result = runInstaller()
    assert.equal(result.status, 0, result.stderr)
    result = runInstaller("9.15.9")
    assert.equal(result.status, 0, result.stderr)

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
    assert.equal(cargoBuilds.length, 4)
    for (const command of cargoBuilds) assert.match(command, /^cargo build --locked /)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("the Zed workflow runs the Node gate before real query and WebAssembly gates", () => {
  const workflow = fs.readFileSync(zedWorkflowPath, "utf8")
  const nodeGate = workflow.indexOf("pnpm check:fast")
  const queryGate = workflow.indexOf("./scripts/check-zed-queries.sh")
  const wasmGate = workflow.indexOf("cargo build --locked --target wasm32-wasip2 --release")

  assert.ok(nodeGate >= 0, "missing pnpm check:fast")
  assert.ok(queryGate > nodeGate, "query validation must follow the Node gate")
  assert.ok(wasmGate > queryGate, "the locked WASM build must follow query validation")
  assert.match(workflow, /pnpm install --frozen-lockfile/)
})
