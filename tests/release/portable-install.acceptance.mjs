import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

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

  for (const relativePath of runtimePaths) {
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

  const response = await initialize(command, externalCwd, environment)
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
})

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
