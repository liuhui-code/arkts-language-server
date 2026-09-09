import assert from "node:assert/strict"
import { createHash } from "node:crypto"
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

test("the package exposes the local Zed installer as one stable command", () => {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  const serverOnlyInstaller = fs.readFileSync(path.join(projectRoot, "scripts", "install-local.sh"), "utf8")

  assert.equal(packageMetadata.scripts["zed:install"], "node scripts/install-zed-local.mjs")
  assert.match(
    serverOnlyInstaller,
    /if \[ "\$\{ARKTS_ZED_INSTALL_AUTO:-\}" != "1" \]; then\s+echo "Ensure [^"]+ PATH/i,
  )
})

test("the reviewed ArkTS grammar artifact matches the manifest pin", () => {
  const extensionRoot = path.join(projectRoot, "editors", "zed")
  const manifest = fs.readFileSync(path.join(extensionRoot, "extension.toml"), "utf8")
  const lock = JSON.parse(fs.readFileSync(path.join(extensionRoot, "zed-grammar-lock.json"), "utf8"))
  const grammar = fs.readFileSync(path.join(extensionRoot, "grammars", "arkts.wasm"))
  const grammarSection = manifest.slice(manifest.indexOf("[grammars.arkts]"))

  assert.equal(lock.grammar, "arkts")
  assert.equal(lock.repository, /^repository\s*=\s*"([^"]+)"/m.exec(grammarSection)?.[1])
  assert.equal(lock.revision, /^rev\s*=\s*"([0-9a-f]{40})"/m.exec(grammarSection)?.[1])
  assert.equal(lock.sha256, createHash("sha256").update(grammar).digest("hex"))
  const exports = WebAssembly.Module.exports(new WebAssembly.Module(grammar))
  assert.ok(exports.some((entry) => entry.name === "tree_sitter_arkts" && entry.kind === "function"))
})

test("local and CI release toolchains share checked-in pins", () => {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  const nodeVersion = fs.readFileSync(path.join(projectRoot, ".node-version"), "utf8").trim()
  const rustToolchain = fs.readFileSync(path.join(projectRoot, "rust-toolchain.toml"), "utf8")
  const workflow = fs.readFileSync(zedWorkflowPath, "utf8")

  assert.equal(packageMetadata.packageManager, "pnpm@8.15.9")
  assert.equal(nodeVersion, "20.19.5")
  assert.match(rustToolchain, /channel\s*=\s*"1\.95\.0"/)
  assert.match(rustToolchain, /components\s*=\s*\[[^\]]*"rustfmt"[^\]]*"clippy"[^\]]*\]/)
  assert.match(rustToolchain, /targets\s*=\s*\[[^\]]*"wasm32-wasip2"[^\]]*\]/)
  assert.match(workflow, /node-version-file:\s*\.node-version/)
  assert.match(workflow, new RegExp(`corepack prepare ${packageMetadata.packageManager} --activate`))

  for (const toolchainInput of [".node-version", "rust-toolchain.toml"]) {
    const occurrences = workflow.split(`- "${toolchainInput}"`).length - 1
    assert.equal(occurrences, 2, `${toolchainInput} must trigger pull-request and main-push validation`)
  }
})

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
    "pnpm test:e2e:artifact",
    "pnpm test:e2e:large",
  ]
  let previousGate = -1
  for (const gate of orderedGates) {
    const gatePosition = releaseDriver.indexOf(gate)
    assert.ok(gatePosition > previousGate, `${gate} must follow the preceding release gate`)
    previousGate = gatePosition
  }

  assert.doesNotMatch(releaseDriver, /node --test|tests\/release\/.*acceptance\.mjs/)
  assert.equal(releaseDriver.match(/^pnpm check:fast$/gm)?.length, 1)
  assert.equal(releaseDriver.match(/^pnpm build(?:\s|$)/gm)?.length ?? 0, 0)
  assert.equal(releaseDriver.match(/^pnpm test:e2e:artifact$/gm)?.length, 1)
  assert.equal(releaseDriver.match(/^pnpm test:e2e:large$/gm)?.length, 1)
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
  fs.mkdirSync(path.join(fixture, "config"), { recursive: true })
  fs.mkdirSync(path.join(fixture, "node_modules", ".bin"), { recursive: true })
  fs.mkdirSync(fakeBin)
  fs.copyFileSync(path.join(projectRoot, "scripts", "install-local.sh"), path.join(fixture, "scripts", "install-local.sh"))
  fs.copyFileSync(path.join(projectRoot, "scripts", "check-zed-queries.sh"), path.join(fixture, "scripts", "check-zed-queries.sh"))
  fs.writeFileSync(path.join(fixture, "package.json"), '{"version":"0.0.1"}\n')
  fs.writeFileSync(path.join(fixture, "pnpm-lock.yaml"), "lockfileVersion: one\n")
  fs.writeFileSync(path.join(fixture, "config", "semantic-runtime.json"), "{}\n")
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
  printf '%s\\n' 'process.stdin.resume()' > dist/semantic-worker.cjs
  printf '%s\\n' 'process.stdin.resume()' > dist/server.cjs
fi
exit 0
`)
  fs.writeFileSync(path.join(fakeBin, "cargo"), `#!/bin/sh
printf 'cargo %s\\n' "$*" >> "$ARKTS_INSTALL_TEST_LOG"
printf 'cargo-cwd %s\\n' "$(pwd -P)" >> "$ARKTS_INSTALL_TEST_LOG"
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

    const lockedGrammar = Buffer.from("reviewed grammar artifact")
    fs.writeFileSync(grammarWasm, lockedGrammar)
    fs.writeFileSync(path.join(fixture, "editors", "zed", "zed-grammar-lock.json"), `${JSON.stringify({
      grammar: "arkts",
      repository: grammarRepository,
      revision: grammarRevisionB,
      sha256: createHash("sha256").update(lockedGrammar).digest("hex"),
    })}\n`)
    fs.rmSync(grammarStamp)
    result = runInstaller("9.15.9")
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(
      fs.readFileSync(grammarWasm),
      lockedGrammar,
      "a reviewed grammar artifact must survive first install from a clean checkout",
    )
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
    assert.equal(cargoBuilds.length, 10)
    for (const command of cargoBuilds) assert.match(command, /^cargo build --locked /)
    assert.equal(cargoBuilds.filter((command) => command.includes("--package arkts-index-sidecar")).length, 5)
    assert.equal(cargoBuilds.filter((command) => command.includes("--target wasm32-wasip2")).length, 5)

    const cargoWorkingDirectories = fs.readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter((command) => command.startsWith("cargo-cwd "))
      .map((command) => command.slice("cargo-cwd ".length))
    assert.deepEqual(
      cargoWorkingDirectories,
      Array(10).fill(fs.realpathSync(fixture)),
      "cargo must resolve the checked-in Rust toolchain from the project root",
    )
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
    "scripts/install-zed-local.mjs",
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

test("one local Zed install command registers the built extension in an isolated profile", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "arkts zed's install "))
  const profile = path.join(fixture, "Zed profile")
  const installBin = path.join(fixture, "installed bin")
  const canaryHome = path.join(fixture, "unused home")
  const canaryXdgData = path.join(fixture, "unused xdg data")
  const extensionRoot = path.join(fixture, "editors", "zed")
  const scriptsRoot = path.join(fixture, "scripts")
  const grammar = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
  const extension = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01])
  const grammarRepository = "https://example.invalid/tree-sitter-arkts"
  const grammarRevision = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const indexSentinel = Buffer.from('{"sentinel":"must remain byte-identical"}\n')

  fs.mkdirSync(path.join(extensionRoot, "grammars"), { recursive: true })
  fs.mkdirSync(path.join(extensionRoot, "languages", "arkts"), { recursive: true })
  fs.mkdirSync(path.join(extensionRoot, "licenses"), { recursive: true })
  fs.mkdirSync(scriptsRoot, { recursive: true })
  fs.mkdirSync(path.join(profile, "extensions"), { recursive: true })
  fs.mkdirSync(canaryHome, { recursive: true })
  fs.mkdirSync(canaryXdgData, { recursive: true })
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "install-zed-local.mjs"),
    path.join(scriptsRoot, "install-zed-local.mjs"),
  )
  fs.writeFileSync(path.join(fixture, "package.json"), '{"version":"0.0.1"}\n')
  fs.writeFileSync(path.join(extensionRoot, "extension.toml"), `id = "arkts"
repository = "https://github.com/liuhui-code/arkts-language-server"

[grammars.arkts]
repository = "${grammarRepository}"
rev = "${grammarRevision}"
`)
  fs.writeFileSync(path.join(extensionRoot, "extension.wasm"), extension)
  fs.writeFileSync(path.join(extensionRoot, "grammars", "arkts.wasm"), grammar)
  fs.writeFileSync(path.join(extensionRoot, "languages", "arkts", "config.toml"), "name = \"ArkTS\"\n")
  fs.writeFileSync(path.join(extensionRoot, "THIRD_PARTY_NOTICES.md"), "fixture grammar notice\n")
  fs.writeFileSync(path.join(extensionRoot, "licenses", "grammar-MIT.txt"), "fixture grammar license\n")
  fs.writeFileSync(path.join(fixture, "LICENSE"), "fixture project license\n")
  fs.writeFileSync(path.join(extensionRoot, "zed-grammar-lock.json"), `${JSON.stringify({
    grammar: "arkts",
    repository: grammarRepository,
    revision: grammarRevision,
    sha256: createHash("sha256").update(grammar).digest("hex"),
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(profile, "extensions", "index.json"), indexSentinel)
  fs.writeFileSync(path.join(scriptsRoot, "install-local.sh"), `#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
install_prefix=$(dirname -- "$1")
case $ARKTS_INSTALL_TEST_SERVER_MARKER in
  old-server) release_hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
  new-server) release_hash=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ;;
  migrated-server) release_hash=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ;;
  *) exit 43 ;;
esac
release="$install_prefix/libexec/arkts-language-server/0.0.1-$release_hash/bin"
mkdir -p "$1"
mkdir -p "$release"
printf '#!/bin/sh\\nprintf "%%s\\\\n" "%s"\\n' "$ARKTS_INSTALL_TEST_SERVER_MARKER" > "$release/arkts-language-server"
chmod 755 "$release/arkts-language-server"
ln -s "$release/arkts-language-server" "$1/arkts-language-server.tmp.$$"
mv -f "$1/arkts-language-server.tmp.$$" "$1/arkts-language-server"
if [ "\${ARKTS_INSTALL_TEST_CORRUPT_GRAMMAR:-}" = "1" ]; then
  printf 'not wasm' > "$project_root/editors/zed/grammars/arkts.wasm"
fi
if [ "\${ARKTS_ZED_INSTALL_AUTO:-}" != "1" ]; then
  echo "In Zed, run 'zed: install dev extension'."
fi
`)
  fs.chmodSync(path.join(scriptsRoot, "install-local.sh"), 0o755)

  try {
    const result = spawnSync(process.execPath, [
      path.join(scriptsRoot, "install-zed-local.mjs"),
      "--",
      "--zed-user-data-dir",
      profile,
      "--bin-dir",
      installBin,
    ], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: canaryHome,
        XDG_DATA_HOME: canaryXdgData,
        ARKTS_INSTALL_TEST_SERVER_MARKER: "old-server",
      },
    })

    assert.equal(result.status, 0, result.stderr || result.error?.message)
    const installedExtension = path.join(profile, "extensions", "installed", "arkts")
    assert.equal(fs.lstatSync(installedExtension).isSymbolicLink(), true)
    const release = fs.realpathSync(installedExtension)
    assert.ok(release.startsWith(fs.realpathSync(profile)))
    assert.deepEqual(fs.readFileSync(path.join(release, "extension.wasm")), extension)
    assert.deepEqual(fs.readFileSync(path.join(release, "grammars", "arkts.wasm")), grammar)
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(release, "zed-grammar-lock.json"), "utf8")),
      JSON.parse(fs.readFileSync(path.join(extensionRoot, "zed-grammar-lock.json"), "utf8")),
    )
    assert.equal(
      fs.readFileSync(path.join(release, "languages", "arkts", "config.toml"), "utf8"),
      'name = "ArkTS"\n',
    )
    assert.equal(fs.readFileSync(path.join(release, "LICENSE"), "utf8"), "fixture project license\n")
    assert.equal(
      fs.readFileSync(path.join(release, "THIRD_PARTY_NOTICES.md"), "utf8"),
      "fixture grammar notice\n",
    )
    assert.equal(
      fs.readFileSync(path.join(release, "licenses", "grammar-MIT.txt"), "utf8"),
      "fixture grammar license\n",
    )
    assert.deepEqual(fs.readFileSync(path.join(profile, "extensions", "index.json")), indexSentinel)

    const workdirLauncher = path.join(
      profile,
      "extensions",
      "work",
      "arkts",
      "bin",
      "arkts-language-server",
    )
    assert.equal(fs.lstatSync(workdirLauncher).isFile(), true)
    fs.accessSync(workdirLauncher, fs.constants.X_OK)
    assert.equal(spawnSync(workdirLauncher, [], { encoding: "utf8" }).stdout.trim(), "old-server")
    assert.equal(fs.existsSync(path.join(canaryHome, "Library", "Application Support", "Zed")), false)
    assert.equal(fs.existsSync(path.join(canaryXdgData, "zed")), false)
    assert.match(result.stdout, /Installed ArkTS dev extension/i)
    assert.match(result.stdout, /reload/i)
    assert.doesNotMatch(result.stdout, /zed: install dev extension/i)

    const originalExtensionLink = fs.readlinkSync(installedExtension)
    const originalLauncher = fs.readFileSync(workdirLauncher)
    const originalServerTarget = fs.realpathSync(path.join(installBin, "arkts-language-server"))
    const failedUpdate = spawnSync(process.execPath, [
      path.join(scriptsRoot, "install-zed-local.mjs"),
      "--zed-user-data-dir",
      profile,
      "--bin-dir",
      installBin,
    ], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: canaryHome,
        XDG_DATA_HOME: canaryXdgData,
        ARKTS_INSTALL_TEST_SERVER_MARKER: "new-server",
        ARKTS_INSTALL_TEST_CORRUPT_GRAMMAR: "1",
      },
    })
    assert.equal(failedUpdate.status, 1)
    assert.match(failedUpdate.stderr, /grammar.+WebAssembly|grammar.+checksum/i)
    assert.equal(fs.readlinkSync(installedExtension), originalExtensionLink)
    assert.deepEqual(fs.readFileSync(workdirLauncher), originalLauncher)
    assert.equal(spawnSync(workdirLauncher, [], { encoding: "utf8" }).stdout.trim(), "old-server")
    assert.notEqual(fs.realpathSync(path.join(installBin, "arkts-language-server")), originalServerTarget)
    assert.deepEqual(fs.readFileSync(path.join(profile, "extensions", "index.json")), indexSentinel)
    assert.deepEqual(
      fs.readdirSync(path.join(profile, "extensions", "installed")),
      ["arkts"],
      "a failed update must not leak a temporary activation link",
    )

    fs.writeFileSync(path.join(extensionRoot, "grammars", "arkts.wasm"), grammar)
    const recoveredUpdate = spawnSync(process.execPath, [
      path.join(scriptsRoot, "install-zed-local.mjs"),
      "--zed-user-data-dir",
      profile,
      "--bin-dir",
      installBin,
    ], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: canaryHome,
        XDG_DATA_HOME: canaryXdgData,
        ARKTS_INSTALL_TEST_SERVER_MARKER: "new-server",
      },
    })
    assert.equal(recoveredUpdate.status, 0, recoveredUpdate.stderr)
    assert.equal(spawnSync(workdirLauncher, [], { encoding: "utf8" }).stdout.trim(), "new-server")

    const migratedBin = path.join(fixture, "alternate prefix", "bin")
    const migratedUpdate = spawnSync(process.execPath, [
      path.join(scriptsRoot, "install-zed-local.mjs"),
      "--zed-user-data-dir",
      profile,
      "--bin-dir",
      migratedBin,
    ], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: canaryHome,
        XDG_DATA_HOME: canaryXdgData,
        ARKTS_INSTALL_TEST_SERVER_MARKER: "migrated-server",
      },
    })
    assert.equal(migratedUpdate.status, 0, migratedUpdate.stderr)
    assert.equal(spawnSync(workdirLauncher, [], { encoding: "utf8" }).stdout.trim(), "migrated-server")
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("the local Zed installer fails closed before build on an unmanaged dangling dev link", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-zed-collision-"))
  const scriptsRoot = path.join(fixture, "scripts")
  const profile = path.join(fixture, "profile")
  const installedRoot = path.join(profile, "extensions", "installed")
  const installedExtension = path.join(installedRoot, "arkts")
  const invocationMarker = path.join(fixture, "installer-was-invoked")
  fs.mkdirSync(scriptsRoot, { recursive: true })
  fs.mkdirSync(installedRoot, { recursive: true })
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "install-zed-local.mjs"),
    path.join(scriptsRoot, "install-zed-local.mjs"),
  )
  fs.symlinkSync(path.join(fixture, "missing-foreign-extension"), installedExtension)
  fs.writeFileSync(path.join(scriptsRoot, "install-local.sh"), `#!/bin/sh
touch "${invocationMarker}"
exit 41
`)
  fs.chmodSync(path.join(scriptsRoot, "install-local.sh"), 0o755)

  try {
    const originalLink = fs.readlinkSync(installedExtension)
    const result = spawnSync(process.execPath, [
      path.join(scriptsRoot, "install-zed-local.mjs"),
      "--zed-user-data-dir",
      profile,
      "--bin-dir",
      path.join(fixture, "bin"),
    ], { encoding: "utf8" })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /refusing.+dev extension|dangling/i)
    assert.equal(fs.existsSync(invocationMarker), false, "the expensive build must not start")
    assert.equal(fs.readlinkSync(installedExtension), originalLink)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("the local Zed installer fails closed before build on an unmanaged launcher", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-zed-launcher-collision-"))
  const scriptsRoot = path.join(fixture, "scripts")
  const profile = path.join(fixture, "profile")
  const launcherRoot = path.join(profile, "extensions", "work", "arkts", "bin")
  const launcher = path.join(launcherRoot, "arkts-language-server")
  const invocationMarker = path.join(fixture, "installer-was-invoked")
  fs.mkdirSync(scriptsRoot, { recursive: true })
  fs.mkdirSync(launcherRoot, { recursive: true })
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "install-zed-local.mjs"),
    path.join(scriptsRoot, "install-zed-local.mjs"),
  )
  fs.writeFileSync(launcher, "#!/bin/sh\necho foreign-server\n")
  fs.chmodSync(launcher, 0o755)
  fs.writeFileSync(path.join(scriptsRoot, "install-local.sh"), `#!/bin/sh
touch "${invocationMarker}"
exit 42
`)
  fs.chmodSync(path.join(scriptsRoot, "install-local.sh"), 0o755)

  try {
    const originalLauncher = fs.readFileSync(launcher)
    const result = spawnSync(process.execPath, [
      path.join(scriptsRoot, "install-zed-local.mjs"),
      "--zed-user-data-dir",
      profile,
      "--bin-dir",
      path.join(fixture, "bin"),
    ], { encoding: "utf8" })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /unmanaged.+launcher/i)
    assert.equal(fs.existsSync(invocationMarker), false, "the expensive build must not start")
    assert.deepEqual(fs.readFileSync(launcher), originalLauncher)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
