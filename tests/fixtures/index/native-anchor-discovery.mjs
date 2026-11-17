#!/usr/bin/env node
// Real Native facts/proofs. Deny only usage-site lookup to characterize compiler-anchor discovery.
import path from "node:path"
import readline from "node:readline"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const binary = fileURLToPath(new URL("../../../target/release/" +
  (process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"), import.meta.url))
const child = spawn(binary, process.argv.slice(2), { stdio: ["pipe", "pipe", "inherit"] })
const requests = new Map()
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line)
  requests.set(request.id, request)
  child.stdin.write(line + "\n")
}).on("close", () => child.stdin.end())
readline.createInterface({ input: child.stdout }).on("line", line => {
  const response = JSON.parse(line), request = requests.get(response.id)
  if (request) requests.delete(response.id)
  if (response.ok === true && request?.method === "references/candidates"
    && path.basename(fileURLToPath(request.params.declarationUri)) === "Query.ets") {
    response.result = { ...response.result, supported: false, complete: false,
      identityComplete: false, declarationUri: null, declarationIdentity: null,
      names: [], uris: [], identityUris: [], narrowedUris: [], bindings: [] }
  }
  process.stdout.write(JSON.stringify(response) + "\n")
})
child.stdin.on("error", error => { process.stderr.write(String(error) + "\n") })
child.on("error", error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1 })
child.on("close", (code, signal) => process.stdout.write("", () => process.exit(code ?? (signal ? 1 : 0))))
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal))
