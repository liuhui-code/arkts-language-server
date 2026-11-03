import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const zedWorkflowPath = path.join(projectRoot, ".github", "workflows", "zed-extension.yml")
const releaseDriverPath = path.join(projectRoot, "scripts", "check-release.sh")

test("Windows Zed installation has a native build path and host acceptance job", () => {
  const installer = fs.readFileSync(path.join(projectRoot, "scripts", "install-zed-local.mjs"), "utf8")
  const workflow = fs.readFileSync(zedWorkflowPath, "utf8")

  assert.doesNotMatch(installer, /if \(process\.platform === "win32"\) \{\s*throw new Error/)
  assert.match(installer, /buildWindowsRuntime/)
  assert.match(installer, /arkts-language-server\.windows/)
  assert.match(workflow, /windows-install:\s*\n\s*runs-on:\s*windows-/)
  assert.match(workflow, /pnpm zed:install/)
  assert.match(workflow, /Install into an isolated Zed profile\n[\s\S]*?npm_config_lockfile: 'false'[\s\S]*?pnpm zed:install/)
  assert.match(workflow, /windows-zed-smoke\.mjs/)
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
    "cargo fmt --all --check",
    "cargo clippy --locked --workspace --all-targets -- -D warnings",
    "cargo test --locked --workspace --all-targets",
    "pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates",
    "cargo build --locked --workspace --release",
    "pnpm check:fast",
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

test("the release driver reports native gate failure before starting Node checks", t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-release-driver-"))
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
  const scripts = path.join(fixture, "scripts")
  const bin = path.join(fixture, "bin")
  const log = path.join(fixture, "commands.log")
  const policyLog = path.join(fixture, "policies.log")
  fs.mkdirSync(scripts)
  fs.mkdirSync(bin)
  fs.copyFileSync(releaseDriverPath, path.join(scripts, "check-release.sh"))
  for (const command of ["cargo", "pnpm"]) {
    fs.writeFileSync(path.join(bin, command), `#!/bin/sh
printf '%s\\n' '${command} '"$*" >> "$ARKTS_RELEASE_TEST_LOG"
gate_policy="$ARKTS_TEST_455_COLD_CATALOG_POLICY"
[ -n "$gate_policy" ] || gate_policy=unset
printf '%s\\t%s\\n' '${command} '"$*" "$gate_policy" >> "$ARKTS_RELEASE_TEST_POLICY_LOG"
case "$*" in
  *pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates*)
    if [ "$ARKTS_RELEASE_TEST_FAIL_NATIVE" = "1" ]; then exit 71; fi ;;
esac
` , { mode: 0o755 })
  }
  fs.writeFileSync(path.join(scripts, "check-zed-queries.sh"),
    '#!/bin/sh\nprintf "%s\\n" queries >> "$ARKTS_RELEASE_TEST_LOG"\n', { mode: 0o755 })
  const run = failNative => spawnSync("sh", [path.join(scripts, "check-release.sh")], {
    cwd: os.tmpdir(), encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      ARKTS_INDEX_REAL_FIXTURE: fixture, ARKTS_LARGE_FIXTURE: fixture,
      ARKTS_TEST_455_COLD_CATALOG_POLICY: undefined,
      ARKTS_RELEASE_TEST_POLICY_LOG: policyLog,
      ARKTS_RELEASE_TEST_LOG: log, ARKTS_RELEASE_TEST_FAIL_NATIVE: failNative ? "1" : "0" },
  })
  assert.equal(run(true).status, 71, "native failure must propagate unchanged")
  const failed = fs.readFileSync(log, "utf8")
  assert.match(failed, /cargo fmt --all --check/)
  assert.match(failed, /cargo clippy --locked --workspace --all-targets -- -D warnings/)
  assert.match(failed, /cargo test --locked --workspace --all-targets/)
  assert.doesNotMatch(failed, /pnpm /, "Node checks must not start after a failed native gate")
  fs.writeFileSync(log, "")
  fs.writeFileSync(policyLog, "")
  assert.equal(run(false).status, 0)
  const completed = fs.readFileSync(log, "utf8").trim().split("\n")
  for (const command of ["pnpm check:fast", "pnpm test:e2e:artifact", "pnpm test:e2e:large", "queries"]) {
    assert.equal(completed.filter(line => line === command).length, 1, `${command} must still execute once`)
  }
  assert.ok(completed.findIndex(line => line.includes("pinned_large_arkts_fixture")) < completed.indexOf("pnpm check:fast"))
  const policies = fs.readFileSync(policyLog, "utf8").trim().split("\n").map(line => line.split("\t"))
  const fixturePolicy = policies.filter(([command]) => command.includes("pinned_large_arkts_fixture"))
  assert.deepEqual(fixturePolicy.map(([, policy]) => policy), ["waive-3s-user-authorized"],
    "the release driver must apply the user's cold-timing waiver to the fixture only")
  assert.ok(policies.filter(([command]) => !command.includes("pinned_large_arkts_fixture"))
    .every(([, policy]) => policy === "unset"), "the waiver must not leak into any other gate")
})


test("stage 1 and 2 have an independent native Windows closure and witness gate", () => {
  const workflow = fs.readFileSync(zedWorkflowPath, "utf8")
  for (const input of ["scripts/bench/closure-*", "scripts/bench/measure-compiler-closure.mjs",
    "scripts/build-runtime.mjs", "scripts/compiler-observation-plugin.mjs", "scripts/measure-witness-budget.mjs"]) {
    assert.equal(workflow.split(`- "${input}"`).length - 1, 2, `${input} must trigger PR and main validation`)
  }
  const job = workflow.split("  windows-stage12:\n")[1]?.split(/\n  [A-Za-z0-9_-]+:\n/u)[0]
  assert.ok(job, "the stage 1/2 native gate must be separate from installation smoke")
  assert.match(job, /runs-on: windows-2022/)
  assert.match(job, /corepack enable\r?\n\s+if \(\$LASTEXITCODE -ne 0\)/)
  for (const command of ["pnpm install --frozen-lockfile", "pnpm check", "pnpm build",
    "cargo build --locked --package arkts-index-sidecar --release --target-dir target"]) {
    assert.ok(job.includes(command), command)
  }
  const steps = job.indexOf("Run stage 1 and 2 on native Windows paths")
  assert.ok(steps > job.indexOf("cargo build --locked"))
  const native = job.slice(steps)
  assert.match(native, /realpathSync\.native/)
  assert.match(native, /\$env:TEMP = \$nativeTemp/)
  assert.match(native, /\$env:TMP = \$nativeTemp/)
  assert.match(native, /if \(\$LASTEXITCODE -ne 0\)/)
  assert.match(native, /node --test --test-concurrency=1/)
  for (const file of ["tests/closure-baseline-cli.test.mjs", "tests/closure-observation-report.test.mjs",
    "tests/exact-witness-facts.test.mjs", "tests/semantic/large-closure-witness-budget.test.mjs",
    "tests/semantic/large-sdk-witness-budget.test.mjs", "tests/semantic/witness-budget-overflow.test.mjs"]) {
    assert.equal(native.split(file).length - 1, 1, file)
  }
  assert.doesNotMatch(job, /test-name-pattern|continue-on-error|ARKTS_MEMORY_BUDGET_MB|ARKTS_TEST_WITNESS_BUDGET_MODE/)
  const originalSmoke = workflow.split("  windows-install:\n")[1].split("  windows-stage12:\n")[0]
  assert.match(originalSmoke, /windows-zed-smoke\.mjs/)
  assert.doesNotMatch(originalSmoke, /nativeTemp|realpathSync|\$env:TEMP\s*=|\$env:TMP\s*=/)
})
