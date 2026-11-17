#!/usr/bin/env node
// Real Native facts/proofs; named negative cases inject candidate-response faults only.
import path from "node:path"
import fs from "node:fs"
import readline from "node:readline"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const binary = fileURLToPath(new URL("../../../target/release/" +
  (process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"), import.meta.url))
const child = spawn(binary, process.argv.slice(2), { stdio: ["pipe", "pipe", "inherit"] })
const requests = new Map()
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line)
  if (process.env.ARKTS_INDEX_TEST_AUDIT) fs.appendFileSync(process.env.ARKTS_INDEX_TEST_AUDIT, line + "\n")
  requests.set(request.id, request)
  child.stdin.write(line + "\n")
}).on("close", () => child.stdin.end())
readline.createInterface({ input: child.stdout }).on("line", line => {
  const response = JSON.parse(line), request = requests.get(response.id)
  if (request) requests.delete(response.id)
  if (response.ok === true && request?.method === "references/candidates"
    && process.env.ARKTS_INDEX_TEST_SCENARIO !== "reference-direct-import-anchor"
    && path.basename(fileURLToPath(request.params.declarationUri)) === "Query.ets") {
    response.result = { ...response.result, supported: false, complete: false,
      identityComplete: false, declarationUri: null, declarationIdentity: null,
      names: [], uris: [], identityUris: [], narrowedUris: [], bindings: [] }
  }
  if (response.ok === true && request?.method === "references/candidates" && response.result.supported) {
    const scenario = process.env.ARKTS_INDEX_TEST_SCENARIO
    if (scenario === "reference-disjoint-reexport-broken-chain") {
      response.result.narrowedUris = [] // The negative control withdraws optional narrowing.
      response.result.bindings = response.result.bindings.map(binding =>
        binding.kind === "reexport" && path.basename(fileURLToPath(binding.uri)) === "Barrel.ets"
          ? { ...binding, sourceResolution: "unresolved", resolvedSourceUri: null } : binding)
      auditFault(request.id, scenario)
    }
    if (scenario === "reference-source-classification") {
      const result = response.result
      const use = result.uris.find(uri => uri.endsWith("/Use.ets"))
      result.narrowedUris = result.identityUris
      result.identityComplete = false
      result.identityUris = []
      result.bindings.push(...[
        ["SdkThing", "@ohos.photoAccessHelper"], ["PackageThing", "missing-package"],
        ["RelativeThing", "../Missing"], ["OtherThing", "/absolute/Missing"],
      ].map(([localName, sourceSpecifier]) => ({ kind: "import", uri: use,
        importedName: "Thing", localName, sourceSpecifier,
        sourceResolution: "unsupported", resolvedSourceUri: null })))
      auditFault(request.id, scenario)
    }
  }
  process.stdout.write(JSON.stringify(response) + "\n")
})
child.stdin.on("error", error => { process.stderr.write(String(error) + "\n") })
child.on("error", error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1 })
child.on("close", (code, signal) => process.stdout.write("", () => process.exit(code ?? (signal ? 1 : 0))))
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal))

function auditFault(requestId, scenario) {
  // Never synthesize status, generations, qualifications, or source fingerprints.
  if (process.env.ARKTS_INDEX_TEST_AUDIT) fs.appendFileSync(process.env.ARKTS_INDEX_TEST_AUDIT,
    JSON.stringify({ fixtureFault: scenario, requestId, boundary: "candidate-response" }) + "\n")
}
