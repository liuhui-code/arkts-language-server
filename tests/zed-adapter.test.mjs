import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const extensionRoot = path.join(projectRoot, "editors", "zed")

function initialize(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["--stdio"], { cwd, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = Buffer.alloc(0)
    let stderr = ""
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Timed out waiting for initialize response. stderr: ${stderr}`))
    }, 2_000)

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

test("the local Zed adapter registers ArkTS and launches the portable server from PATH", () => {
  const manifest = fs.readFileSync(path.join(extensionRoot, "extension.toml"), "utf8")
  const language = fs.readFileSync(path.join(extensionRoot, "languages", "arkts", "config.toml"), "utf8")
  const adapter = fs.readFileSync(path.join(extensionRoot, "src", "lib.rs"), "utf8")

  assert.match(manifest, /\[language_servers\.arkts-language-server\]/)
  assert.match(language, /path_suffixes\s*=\s*\["ets"\]/)
  assert.match(adapter, /worktree\.which\("arkts-language-server"\)/)
  assert.match(adapter, /unwrap_or_else\(\|\|\s*vec!\["--stdio"\.to_string\(\)\]\)/)
  assert.match(adapter, /install.+arkts-language-server.+PATH/is)
  assert.doesNotMatch(adapter, /\/Users\/liuhui/)
  assert.doesNotMatch(adapter, /\/usr\/local\/bin\/node/)
  assert.doesNotMatch(adapter, /sdkPath|hmsPath|ssh/i)
})

test("the Zed adapter honors the configured language-server binary", () => {
  const adapter = fs.readFileSync(path.join(extensionRoot, "src", "lib.rs"), "utf8")

  assert.match(
    adapter,
    /LspSettings::for_worktree\(language_server_id\.as_ref\(\),\s*worktree\)/,
  )
  assert.match(adapter, /binary\.path/)
  assert.match(adapter, /binary\s*\.arguments/)
  assert.match(adapter, /binary\s*\.env/)
  assert.match(adapter, /unwrap_or_else\(\|\|\s*vec!\["--stdio"\.to_string\(\)\]\)/)
  assert.match(adapter, /unwrap_or_else\(\|\|\s*worktree\.shell_env\(\)\)/)
  const argumentSetup = adapter.indexOf("let arguments =")
  const configuredPath = adapter.indexOf("if let Some(command)")
  const managedLauncher = adapter.indexOf("std::env::current_dir()")
  assert.ok(argumentSetup >= 0 && argumentSetup < configuredPath)
  assert.ok(configuredPath < managedLauncher)
  assert.equal(adapter.match(/args:\s*arguments/g)?.length, 2)
  assert.equal(adapter.match(/env:\s*environment/g)?.length, 2)
})

test("the Zed adapter prefers the installer-managed launcher before PATH", () => {
  const adapter = fs.readFileSync(path.join(extensionRoot, "src", "lib.rs"), "utf8")
  const configuredBinary = adapter.indexOf("LspSettings::for_worktree")
  const managedLauncher = adapter.indexOf("std::env::current_dir()")
  const pathFallback = adapter.indexOf('worktree.which("arkts-language-server")')

  assert.ok(configuredBinary >= 0, "the configured binary lookup must exist")
  assert.ok(managedLauncher > configuredBinary, "the managed launcher must follow user settings")
  assert.ok(pathFallback > managedLauncher, "PATH must remain the last lookup")
  assert.match(adapter, /join\("bin"\).*join\("arkts-language-server"\)/s)
  assert.match(adapter, /\.is_file\(\)/)
})

test("the Zed adapter reports both supported recovery paths", () => {
  const adapter = fs.readFileSync(path.join(extensionRoot, "src", "lib.rs"), "utf8")

  assert.match(adapter, /not found[^\"]*pnpm zed:install[^\"]*binary\.path/i)
})

test("the repository CLI starts the language server outside the repository cwd", async () => {
  const response = await initialize(
    path.join(projectRoot, "bin", "arkts-language-server"),
    os.tmpdir(),
  )

  assert.equal(response.result.serverInfo.name, "arkts-language-server")
})
