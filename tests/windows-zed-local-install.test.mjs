import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("Windows Zed installer activates a pinned Node server and preserves it on failed update", { skip: process.platform === "win32" }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-windows-zed-contract-"))
  const scripts = path.join(fixture, "scripts")
  const extension = path.join(fixture, "editors", "zed")
  const fakeBin = path.join(fixture, "fake-bin")
  const profile = path.join(fixture, "Zed profile")
  const installBin = path.join(fixture, "install prefix", "bin")
  const grammar = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])
  try {
    for (const directory of [scripts, fakeBin, path.join(extension, "grammars"),
      path.join(extension, "languages", "arkts"), path.join(extension, "licenses"),
      path.join(fixture, "config")]) fs.mkdirSync(directory, { recursive: true })
    fs.copyFileSync(path.join(projectRoot, "scripts", "install-zed-local.mjs"), path.join(scripts, "install-zed-local.mjs"))
    fs.copyFileSync(path.join(projectRoot, "scripts", "install-zed-windows-runtime.mjs"), path.join(scripts, "install-zed-windows-runtime.mjs"))
    fs.writeFileSync(path.join(fixture, "package.json"), '{"version":"0.0.1"}\n')
    fs.writeFileSync(path.join(fixture, "pnpm-lock.yaml"), "lockfileVersion: '6.0'\n")
    fs.writeFileSync(path.join(fixture, "LICENSE"), "fixture license\n")
    fs.writeFileSync(path.join(fixture, "config", "semantic-runtime.json"), "{}\n")
    fs.writeFileSync(path.join(extension, "extension.toml"), `id = "arkts"\nrepository = "https://github.com/liuhui-code/arkts-language-server"\n[grammars.arkts]\nrepository = "https://example.invalid/grammar"\nrev = "${"a".repeat(40)}"\n`)
    fs.writeFileSync(path.join(extension, "grammars", "arkts.wasm"), grammar)
    fs.writeFileSync(path.join(extension, "zed-grammar-lock.json"), JSON.stringify({
      grammar: "arkts", repository: "https://example.invalid/grammar", revision: "a".repeat(40),
      sha256: createHash("sha256").update(grammar).digest("hex"),
    }))
    fs.writeFileSync(path.join(extension, "languages", "arkts", "config.toml"), 'name = "ArkTS"\n')
    fs.writeFileSync(path.join(extension, "licenses", "grammar-MIT.txt"), "fixture license\n")
    fs.writeFileSync(path.join(extension, "THIRD_PARTY_NOTICES.md"), "fixture notice\n")
    const bootstrap = path.join(fixture, "windows-platform.cjs")
    fs.writeFileSync(bootstrap, 'Object.defineProperty(process, "platform", { value: "win32" })\n')
    fs.writeFileSync(path.join(fakeBin, "pnpm"), `#!/bin/sh
if [ "$1" = "install" ] && [ "$npm_config_lockfile" = "false" ] && [ "$3" != "--config.lockfile=true" ]; then
  printf '%s\\n' 'Headless installation requires a pnpm-lock.yaml file' >&2
  exit 17
fi
if [ "$1" = "build" ]; then
  mkdir -p dist
  for file in server semantic-worker reference-verifier-worker; do printf 'process.stdin.resume()\\n' > "dist/$file.cjs"; done
  printf '%s\\n' '{"schema":"arkts-language-server.standard-library","schemaVersion":1,"files":["lib.d.ts"]}' > dist/arkts-standard-library.json
  printf '%s\\n' 'interface Object {}' > dist/lib.d.ts
fi
`)
    fs.writeFileSync(path.join(fakeBin, "cargo"), `#!/bin/sh
case "$CARGO_TARGET_DIR" in
  */editors/zed/target)
    mkdir -p "$CARGO_TARGET_DIR/wasm32-wasip2/release"
    printf '\\000asm' > "$CARGO_TARGET_DIR/wasm32-wasip2/release/zed_arkts_local.wasm" ;;
  *)
    mkdir -p "$CARGO_TARGET_DIR/release"
    printf 'sidecar\\n' > "$CARGO_TARGET_DIR/release/arkts-index-sidecar.exe" ;;
esac
`)
    for (const executable of ["pnpm", "cargo"]) fs.chmodSync(path.join(fakeBin, executable), 0o755)

    const install = (bin = installBin) => spawnSync(process.execPath, ["--require", bootstrap,
      path.join(scripts, "install-zed-local.mjs"), "--zed-user-data-dir", profile,
      "--bin-dir", bin], {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, npm_config_lockfile: "false" },
    })
    const first = install()
    assert.equal(first.status, 0, first.stderr || first.error?.message)
    const installed = path.join(profile, "extensions", "installed", "arkts")
    const launch = path.join(profile, "extensions", "work", "arkts", "bin", "arkts-language-server.windows")
    assert.ok(fs.lstatSync(installed).isSymbolicLink())
    const [marker, node, server] = fs.readFileSync(launch, "utf8").trimEnd().split("\n")
    assert.equal(marker, "arkts-language-server-zed-node-v1")
    assert.equal(node, fs.realpathSync(process.execPath))
    assert.ok(fs.statSync(server).isFile())
    assert.equal(fs.readFileSync(path.join(path.dirname(server), "lib.d.ts"), "utf8"), "interface Object {}\n")
    const previousLink = fs.realpathSync(installed)
    const previousLaunch = fs.readFileSync(launch, "utf8")
    const repeat = install()
    assert.equal(repeat.status, 0, repeat.stderr || repeat.error?.message)
    assert.equal(fs.realpathSync(installed), previousLink)
    assert.equal(fs.readFileSync(launch, "utf8"), previousLaunch)
    const installedLibrary = path.join(path.dirname(server), "lib.d.ts")
    const libraryBytes = fs.readFileSync(installedLibrary)
    fs.appendFileSync(installedLibrary, "// damaged\n")
    const rejectedLibrary = install()
    assert.notEqual(rejectedLibrary.status, 0)
    assert.equal(fs.readFileSync(launch, "utf8"), previousLaunch)
    fs.writeFileSync(installedLibrary, libraryBytes)
    const installedDist = path.dirname(server)
    fs.renameSync(installedDist, `${installedDist}-original`)
    fs.symlinkSync(`${installedDist}-original`, installedDist)
    const rejectedDirectory = install()
    assert.notEqual(rejectedDirectory.status, 0)
    assert.equal(fs.readFileSync(launch, "utf8"), previousLaunch)
    fs.unlinkSync(installedDist)
    fs.renameSync(`${installedDist}-original`, installedDist)
    const alternateBin = path.join(fixture, "another install prefix", "bin")
    const migrated = install(alternateBin)
    assert.equal(migrated.status, 0, migrated.stderr || migrated.error?.message)
    const migratedLaunch = fs.readFileSync(launch, "utf8")
    assert.notEqual(migratedLaunch, previousLaunch)
    assert.ok(migratedLaunch.includes(path.join("another install prefix", "libexec")))
    fs.writeFileSync(path.join(extension, "grammars", "arkts.wasm"), "invalid grammar")
    const failed = install(alternateBin)
    assert.notEqual(failed.status, 0)
    assert.match(failed.stderr, /WebAssembly|checksum/)
    assert.equal(fs.realpathSync(installed), previousLink)
    assert.equal(fs.readFileSync(launch, "utf8"), migratedLaunch)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
