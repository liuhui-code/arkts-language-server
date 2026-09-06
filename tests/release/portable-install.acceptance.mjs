import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { assertInstalledSemanticSmoke } from "../support/installed-semantic-smoke.mjs"
import {
  assertExactVerifiedArtifactClaims,
  CURRENT_LSP_FEATURE_MATRIX,
} from "../support/lsp-feature-matrix.mjs"
import { LspSession } from "../support/lsp-session.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const artifactBuilder = path.join(projectRoot, "scripts", "artifact", "build-portable.mjs")

function writeExecutable(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, { mode: 0o755 })
}

function makeCheckout(temporaryRoot) {
  const checkout = path.join(temporaryRoot, "checkout")
  const copy = (sourceRelativePath, destinationRelativePath = sourceRelativePath) => {
    const destination = path.join(checkout, destinationRelativePath)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(projectRoot, sourceRelativePath), destination)
  }

  copy("scripts/install-local.sh")
  copy("scripts/check-zed-queries.sh")
  copy("bin/arkts-language-server")
  copy("dist/server.cjs")
  copy("target/release/arkts-index-sidecar")
  copy(
    "editors/zed/target/wasm32-wasip2/release/zed_arkts_local.wasm",
    "editors/zed/extension.wasm",
  )
  copy("editors/zed/extension.toml")
  fs.chmodSync(path.join(checkout, "scripts", "install-local.sh"), 0o755)
  fs.chmodSync(path.join(checkout, "scripts", "check-zed-queries.sh"), 0o755)
  fs.chmodSync(path.join(checkout, "bin", "arkts-language-server"), 0o755)
  fs.chmodSync(path.join(checkout, "target", "release", "arkts-index-sidecar"), 0o755)

  fs.writeFileSync(path.join(checkout, "package.json"), '{"version":"0.0.1"}\n')
  fs.writeFileSync(path.join(checkout, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n")
  fs.writeFileSync(path.join(checkout, "Cargo.toml"), "[workspace]\n")
  fs.mkdirSync(path.join(checkout, "editors", "zed"), { recursive: true })
  fs.writeFileSync(path.join(checkout, "editors", "zed", "Cargo.toml"), "[workspace]\n")
  fs.mkdirSync(
    path.join(checkout, "editors", "zed", "target", "wasm32-wasip2", "release"),
    { recursive: true },
  )
  fs.copyFileSync(
    path.join(checkout, "editors", "zed", "extension.wasm"),
    path.join(checkout, "editors", "zed", "target", "wasm32-wasip2", "release", "zed_arkts_local.wasm"),
  )
  writeExecutable(path.join(checkout, "node_modules", ".bin", "esbuild"), "#!/bin/sh\nexit 0\n")

  const toolDirectory = path.join(temporaryRoot, "tools")
  writeExecutable(
    path.join(toolDirectory, "pnpm"),
    "#!/bin/sh\nif [ \"${1:-}\" = --version ]; then echo 10.0.0; fi\nexit 0\n",
  )
  writeExecutable(path.join(toolDirectory, "cargo"), "#!/bin/sh\nexit 0\n")

  return {
    checkout,
    toolDirectory,
    environment: {
      ...process.env,
      PATH: `${toolDirectory}${path.delimiter}${process.env.PATH}`,
    },
  }
}

function initialize(command, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["--stdio"], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = Buffer.alloc(0)
    let stderr = ""
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Timed out waiting for initialize response. stderr: ${stderr}`))
    }, 15_000)

    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.stdout.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, chunk])
      const headerEnd = stdout.indexOf("\r\n\r\n")
      if (headerEnd < 0) return
      const header = stdout.subarray(0, headerEnd).toString("ascii")
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1])
      const bodyStart = headerEnd + 4
      if (!Number.isFinite(length) || stdout.length < bodyStart + length) return
      clearTimeout(timeout)
      const response = JSON.parse(stdout.subarray(bodyStart, bodyStart + length).toString("utf8"))
      child.kill("SIGTERM")
      resolve(response)
    })

    const body = Buffer.from(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { processId: process.pid, rootUri: null, capabilities: {} },
    }))
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    child.stdin.write(body)
  })
}

test("installs one verified artifact without source dependencies or a rebuild", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-immutable-artifact-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const buildInput = path.join(temporaryRoot, "build-input")
  const artifactRoot = path.join(temporaryRoot, "artifact")
  const sidecarName = process.platform === "win32"
    ? "arkts-index-sidecar.exe"
    : "arkts-index-sidecar"
  const runtimePaths = [
    "bin/arkts-language-server",
    "dist/server.cjs",
    `target/release/${sidecarName}`,
  ]
  const installerPaths = [
    "scripts/install-local.sh",
    "scripts/artifact/install-from-manifest.mjs",
  ]

  for (const relativePath of [...runtimePaths, ...installerPaths]) {
    const source = path.join(projectRoot, ...relativePath.split("/"))
    const destination = path.join(buildInput, ...relativePath.split("/"))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    fs.chmodSync(destination, fs.statSync(source).mode & 0o777)
  }
  fs.mkdirSync(path.join(buildInput, "src"), { recursive: true })
  fs.writeFileSync(path.join(buildInput, "src", "must-not-ship.ts"), "export const source = true\n")
  fs.mkdirSync(path.join(buildInput, "node_modules"), { recursive: true })
  fs.writeFileSync(path.join(buildInput, "node_modules", "must-not-ship"), "dependency bytes\n")

  const creation = spawnSync(process.execPath, [
    artifactBuilder,
    "--source-root", buildInput,
    "--output", artifactRoot,
    "--version", "0.1.0-test",
    "--commit", "0123456789abcdef",
    "--toolchains", JSON.stringify({
      node: process.version,
      pnpm: "8.15.9",
      rustc: "rustc 1.90.0",
    }),
  ], { cwd: os.tmpdir(), encoding: "utf8" })
  assert.equal(creation.status, 0, creation.stderr || creation.error?.message)

  const manifestPath = path.join(artifactRoot, "artifact-manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  assert.equal(manifest.schema, "arkts-language-server.artifact-manifest")
  for (const relativePath of runtimePaths) {
    const record = manifest.files.find((file) => file.path === relativePath)
    assert.ok(record, `manifest is missing ${relativePath}`)
    assert.equal(
      record.sha256,
      createHash("sha256")
        .update(fs.readFileSync(path.join(artifactRoot, ...relativePath.split("/"))))
        .digest("hex"),
    )
  }
  assert.equal(fs.existsSync(path.join(artifactRoot, "src")), false)
  assert.equal(fs.existsSync(path.join(artifactRoot, "node_modules")), false)

  fs.renameSync(buildInput, path.join(temporaryRoot, "build-input-moved"))

  const toolDirectory = path.join(temporaryRoot, "forbidden-build-tools")
  const invocationLog = path.join(temporaryRoot, "forbidden-build-invocations")
  for (const command of ["pnpm", "cargo", "esbuild"]) {
    writeExecutable(
      path.join(toolDirectory, command),
      `#!/bin/sh\nprintf '%s\\n' '${command}' >> '${invocationLog}'\nexit 97\n`,
    )
  }
  const isolatedHome = path.join(temporaryRoot, "isolated-home")
  const externalCwd = path.join(temporaryRoot, "external-cwd")
  fs.mkdirSync(isolatedHome)
  fs.mkdirSync(externalCwd)
  const environment = {
    ...process.env,
    HOME: isolatedHome,
    ARKTS_INDEX_SIDECAR_PATH: undefined,
    ARKTS_LSP_HOME: undefined,
    PATH: [toolDirectory, path.dirname(process.execPath), "/usr/bin", "/bin"]
      .join(path.delimiter),
  }

  const corruptedArtifact = path.join(temporaryRoot, "corrupted-artifact")
  fs.cpSync(artifactRoot, corruptedArtifact, { recursive: true })
  const corruptedServer = path.join(corruptedArtifact, "dist", "server.cjs")
  const corruptedBytes = fs.readFileSync(corruptedServer)
  corruptedBytes[0] ^= 0xff
  fs.writeFileSync(corruptedServer, corruptedBytes)
  const rejected = spawnSync(
    path.join(corruptedArtifact, "scripts", "install-local.sh"),
    ["--from-artifact", corruptedArtifact, path.join(temporaryRoot, "corrupt-prefix", "bin")],
    { cwd: externalCwd, encoding: "utf8", env: environment },
  )
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /SHA-256 mismatch.*dist\/server\.cjs/i)

  const binDirectory = path.join(temporaryRoot, "prefix", "bin")
  const installation = spawnSync(
    path.join(artifactRoot, "scripts", "install-local.sh"),
    ["--from-artifact", artifactRoot, binDirectory],
    { cwd: externalCwd, encoding: "utf8", env: environment },
  )
  assert.equal(installation.status, 0, installation.stderr || installation.error?.message)
  assert.equal(fs.existsSync(invocationLog), false, "artifact installation invoked a build tool")

  const command = path.join(binDirectory, "arkts-language-server")
  const installedLauncher = fs.realpathSync(command)
  const releaseRoot = path.resolve(path.dirname(installedLauncher), "..")
  for (const relativePath of runtimePaths) {
    const installedPath = path.join(releaseRoot, ...relativePath.split("/"))
    const artifactPath = path.join(artifactRoot, ...relativePath.split("/"))
    assert.deepEqual(
      fs.readFileSync(installedPath),
      fs.readFileSync(artifactPath),
      `installed bytes differ for ${relativePath}`,
    )
    assert.equal(
      fs.statSync(installedPath).mode & 0o777,
      fs.statSync(artifactPath).mode & 0o777,
      `installed mode differs for ${relativePath}`,
    )
  }

  const installedSidecar = path.join(releaseRoot, "target", "release", sidecarName)
  const repositorySidecar = path.join(projectRoot, "target", "release", sidecarName)
  fs.accessSync(repositorySidecar, fs.constants.X_OK)
  assert.notEqual(fs.realpathSync(installedSidecar), fs.realpathSync(repositorySidecar))
  const withheldSidecar = `${installedSidecar}.withheld`
  fs.renameSync(installedSidecar, withheldSidecar)
  try {
    assert.equal(fs.existsSync(installedSidecar), false)
    assert.equal(fs.existsSync(repositorySidecar), true)
    const missingAdjacent = await runInstalledIndexProbe({
      command,
      temporaryRoot,
      cwd: externalCwd,
      env: environment,
      cacheName: "missing-adjacent-cache",
    })
    assert.equal(
      missingAdjacent.terminal.params.value.message,
      "Indexing degraded after 0 files; skipped 0 entries",
      "a missing installed sidecar must not fall back to the repository sidecar",
    )
    assert.deepEqual(missingAdjacent.response.result, [])
  } finally {
    fs.renameSync(withheldSidecar, installedSidecar)
  }
  const adjacent = await runInstalledIndexProbe({
    command,
    temporaryRoot,
    cwd: externalCwd,
    env: environment,
    cacheName: "installed-adjacent-cache",
  })
  assert.equal(
    adjacent.terminal.params.value.percentage,
    100,
    `catalog did not use the installed adjacent sidecar: ${adjacent.terminal.params.value.message}`,
  )
  assert.equal(adjacent.terminal.params.value.message, "Indexed 1/1 files; skipped 0 entries")
  assert.deepEqual(adjacent.response.result, [{
    name: adjacent.sourceName,
    kind: 5,
    location: {
      uri: pathToFileURL(adjacent.sourcePath).href,
      range: {
        start: { line: 0, character: adjacent.source.indexOf(adjacent.sourceName) },
        end: {
          line: 0,
          character: adjacent.source.indexOf(adjacent.sourceName) + adjacent.sourceName.length,
        },
      },
    },
  }])

  const response = await initialize(command, externalCwd, environment)
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
  const semanticEvidence = await assertInstalledSemanticSmoke({
    installedCommand: command,
    temporaryRoot,
    cwd: externalCwd,
    env: environment,
  })
  assert.ok(
    semanticEvidence.verifiedClaims.includes(
      "document-highlight.artifact.immutable-versioned-write-read-ranges",
    ),
    "installed smoke must verify exact document-highlight write/read ranges",
  )
  assert.ok(
    semanticEvidence.verifiedClaims.includes(
      "folding-range.artifact.immutable-client-options-line-only-range-limit",
    ),
    "installed smoke must verify negotiated line-only bounded folding ranges",
  )
  assert.ok(
    semanticEvidence.verifiedClaims.includes(
      "document-formatting.artifact.immutable-edits-apply-idempotent-semantics",
    ),
    "installed smoke must verify formatting edits, application, idempotence, and semantics",
  )
  assertExactVerifiedArtifactClaims({
    matrix: CURRENT_LSP_FEATURE_MATRIX,
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    evidence: semanticEvidence,
  })
  assert.ok(
    semanticEvidence?.workspaceSymbolKindUriNameRange,
    "installed smoke must expose workspace-symbol kind, URI, and name-range evidence",
  )
  assert.deepEqual(
    semanticEvidence.workspaceSymbolKindUriNameRange.actual,
    semanticEvidence.workspaceSymbolKindUriNameRange.expected,
    "installed workspace/symbol must preserve exact kinds, URIs, and name ranges",
  )
  assert.equal(
    fs.existsSync(invocationLog),
    false,
    "installed artifact semantic runtime invoked a forbidden build tool",
  )
})

async function runInstalledIndexProbe({ command, temporaryRoot, cwd, env, cacheName }) {
  const workspace = path.join(temporaryRoot, `${cacheName}-workspace`)
  fs.mkdirSync(workspace)
  const sourceName = "ArtifactAdjacentSidecarType"
  const source = `export class ${sourceName} {}\n`
  const sourcePath = path.join(workspace, `${sourceName}.ets`)
  fs.writeFileSync(sourcePath, source, "utf8")
  const indexEnvironment = {
    ...env,
    ARKTS_INDEX_SIDECAR_PATH: undefined,
    ARKTS_INDEX_CACHE_DIR: path.join(temporaryRoot, cacheName),
    ARKTS_LSP_HOME: undefined,
    ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, `${cacheName}-logs`),
  }
  assert.equal(indexEnvironment.ARKTS_INDEX_SIDECAR_PATH, undefined)
  assert.equal(indexEnvironment.ARKTS_LSP_HOME, undefined)
  const session = new LspSession({
    command,
    args: ["--stdio"],
    cwd,
    env: indexEnvironment,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true } },
  })

  try {
    const initialized = await session.initialize({ timeoutMs: 15_000 })
    assert.equal(initialized.result.capabilities.workspaceSymbolProvider, true)
    const create = await session.transport.serverRequest(
      "window/workDoneProgress/create",
      () => true,
      15_000,
    )
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    const terminal = await session.transport.progress(
      create.params.token,
      (message) => message.params.value.kind === "report"
        && (message.params.value.percentage === 100
          || /^Indexing degraded/.test(message.params.value.message ?? "")),
      30_000,
    )
    await session.transport.progress(
      create.params.token,
      (message) => message.params.value.kind === "end",
      30_000,
    )
    const response = await session.request("workspace/symbol", { query: sourceName }, {
      timeoutMs: 15_000,
    })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return { terminal, response, sourceName, sourcePath, source }
  } finally {
    await session.close({ timeoutMs: 15_000 })
  }
}

test("installed command remains self-contained after its source checkout moves", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-portable-install-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const { checkout, environment } = makeCheckout(temporaryRoot)
  const binDirectory = path.join(temporaryRoot, "prefix", "bin")

  const installation = spawnSync(path.join(checkout, "scripts", "install-local.sh"), [binDirectory], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: environment,
  })
  assert.equal(installation.status, 0, installation.stderr || installation.error?.message)

  const command = path.join(binDirectory, "arkts-language-server")
  const installedLauncher = fs.realpathSync(command)
  const canonicalCheckout = fs.realpathSync(checkout)
  assert.ok(
    !installedLauncher.startsWith(`${canonicalCheckout}${path.sep}`),
    `installed command still points into source checkout: ${installedLauncher}`,
  )
  const releaseRoot = path.resolve(path.dirname(installedLauncher), "..")
  assert.ok(fs.statSync(path.join(releaseRoot, "dist", "server.cjs")).size > 0)
  const sidecar = path.join(releaseRoot, "target", "release", "arkts-index-sidecar")
  assert.ok(fs.statSync(sidecar).size > 0)
  fs.accessSync(sidecar, fs.constants.X_OK)

  fs.renameSync(checkout, path.join(temporaryRoot, "checkout-moved"))
  const response = await initialize(command, os.tmpdir())
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
})

test("a failed activation leaves the previously installed command runnable", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-atomic-install-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const { checkout, environment, toolDirectory } = makeCheckout(temporaryRoot)
  const installer = path.join(checkout, "scripts", "install-local.sh")
  const binDirectory = path.join(temporaryRoot, "prefix", "bin")
  const command = path.join(binDirectory, "arkts-language-server")

  const first = spawnSync(installer, [binDirectory], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: environment,
  })
  assert.equal(first.status, 0, first.stderr || first.error?.message)
  const activeRelease = fs.realpathSync(command)

  fs.appendFileSync(path.join(checkout, "bin", "arkts-language-server"), "# failed update marker\n")
  writeExecutable(path.join(toolDirectory, "ln"), "#!/bin/sh\nexit 73\n")
  const failedUpdate = spawnSync(installer, [binDirectory], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: environment,
  })
  assert.equal(failedUpdate.status, 73, failedUpdate.stderr || failedUpdate.error?.message)
  assert.equal(fs.realpathSync(command), activeRelease)

  const response = await initialize(command, os.tmpdir())
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
})

test("reinstalling a rebuilt local beta atomically activates a new immutable release", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-rebuilt-install-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const { checkout, environment } = makeCheckout(temporaryRoot)
  const installer = path.join(checkout, "scripts", "install-local.sh")
  const binDirectory = path.join(temporaryRoot, "prefix", "bin")
  const command = path.join(binDirectory, "arkts-language-server")

  const first = spawnSync(installer, [binDirectory], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: environment,
  })
  assert.equal(first.status, 0, first.stderr || first.error?.message)
  const firstRelease = fs.realpathSync(command)

  const marker = "# rebuilt local beta marker"
  fs.appendFileSync(path.join(checkout, "bin", "arkts-language-server"), `${marker}\n`)
  const second = spawnSync(installer, [binDirectory], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: environment,
  })
  assert.equal(second.status, 0, second.stderr || second.error?.message)
  const secondRelease = fs.realpathSync(command)

  assert.notEqual(secondRelease, firstRelease)
  assert.match(fs.readFileSync(secondRelease, "utf8"), new RegExp(marker))
  assert.ok(fs.existsSync(firstRelease), "previous immutable release was unexpectedly removed")
})
