import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { buildWindowsRuntime } from "../../scripts/install-zed-windows-runtime.mjs"
import { projectRoot } from "./lsp-process.mjs"

/** Real runtime staging, prebuilt bundles and host sidecar; not a native Windows claim on Linux. */
export function installWindowsRuntimeFixture(directory) {
  const sourceRoot = path.join(directory, "build input")
  const extension = path.join(sourceRoot, "editors", "zed")
  for (const name of ["dist", "config"]) fs.cpSync(path.join(projectRoot, name),
    path.join(sourceRoot, name), { recursive: true })
  fs.copyFileSync(path.join(projectRoot, "package.json"), path.join(sourceRoot, "package.json"))
  const nativeName = process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"
  const sidecarInput = path.join(sourceRoot, "target", "release", "arkts-index-sidecar.exe")
  fs.mkdirSync(path.dirname(sidecarInput), { recursive: true })
  fs.copyFileSync(path.join(projectRoot, "target", "release", nativeName), sidecarInput)
  const wasm = path.join(extension, "target", "wasm32-wasip2", "release", "zed_arkts_local.wasm")
  fs.mkdirSync(path.dirname(wasm), { recursive: true })
  fs.writeFileSync(wasm, Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))
  const server = buildWindowsRuntime({ projectRoot: sourceRoot, extensionSource: extension,
    libexecRoot: path.join(directory, "installed prefix", "libexec"), runBuild: () => {},
    assertWasm: file => assert.equal(fs.readFileSync(file).subarray(0, 4).toString("hex"), "0061736d"),
  })
  fs.rmSync(sourceRoot, { recursive: true, force: true })
  return { server, sidecar: path.resolve(server, "../..", "target/release/arkts-index-sidecar.exe") }
}
