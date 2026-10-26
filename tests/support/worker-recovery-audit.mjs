import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export async function auditFixture(t, name, { loader = "worker-lifecycle-audit.cjs", env = {} } = {}) {
  const runtime = process.env.ARKTS_AUDIT_RUNTIME_ROOT ?? repository
  const { createReadinessFixture } = await import(pathToFileURL(path.join(runtime, "tests/support/semantic-readiness-lsp.mjs")))
  const base = process.env.ARKTS_AUDIT_EVIDENCE_DIR
    ?? path.join(repository, ".bench/worker-state-contract", String(Date.now()) + "-" + process.pid)
  const output = path.join(base, name)
  assert.ok(!fs.existsSync(output), "Use a fresh evidence directory: " + output)
  fs.mkdirSync(output, { recursive: true })
  const cleanup = []
  const f = createReadinessFixture({ after: action => cleanup.push(action) }, {
    ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    ARKTS_SEMANTIC_REQUEST_TIMEOUT_MS: "10000", ARKTS_SEMANTIC_PREPARE_TIMEOUT_MS: "10000",
    ARKTS_SEMANTIC_MUTATION_TIMEOUT_MS: "2000", ARKTS_SEMANTIC_CANCEL_GRACE_MS: "100",
    ARKTS_AUDIT_RUNTIME_ROOT: runtime,
    NODE_OPTIONS: "--require=" + JSON.stringify(path.join(repository, "tests/fixtures", loader)), ...env,
  })
  const report = { name, runtime, fixture: f.directory, operations: [], observations: {} }
  const record = f.session.transport.recordTranscript.bind(f.session.transport)
  const responses = new Map()
  f.session.transport.recordTranscript = (direction, message, bytes) => {
    fs.appendFileSync(path.join(output, "wire.jsonl"), JSON.stringify({ at: Date.now(), direction, message }) + "\n")
    if (direction === "receive" && "id" in message && !message.method) {
      responses.set(message.id, (responses.get(message.id) ?? 0) + 1)
    }
    return record(direction, message, bytes)
  }
  f.session.transport.child.stderr.on("data", bytes => fs.appendFileSync(path.join(output, "stderr.raw"), bytes))
  const request = async (method, params, options = {}) => {
    const start = performance.now()
    const entry = { method, params, started: start }
    report.operations.push(entry)
    try { entry.response = await f.session.request(method, params, options); return entry.response }
    catch (error) { entry.error = error.message; throw error }
    finally { entry.elapsedMs = performance.now() - start }
  }
  const release = () => {
    for (const name of ["unresponsive-release", "audit-gate-release", "audit-terminate-release"]) {
      fs.writeFileSync(path.join(f.directory, name), "released")
    }
  }
  t.after(async () => {
    release()
    const errors = []
    try {
      report.close = await f.session.close({ timeoutMs: 5000 })
      if (report.close.exit.code !== 0 || report.close.exit.signal) errors.push(Error("audit server did not exit cleanly"))
    } catch (error) {
      report.close = { error: error.message }; errors.push(error)
      fs.writeFileSync(path.join(f.directory, "audit-cleanup-orphans"), "audit cleanup after product shutdown failed")
    }
    const lifetime = workerLifetime(f)
    report.lifetimeAfterClose = lifetime
    if (lifetime.active !== 0) errors.push(Error("physical Workers survived product shutdown: " + JSON.stringify(lifetime)))
    if (rows(f).some(row => row.event === "audit-forced-orphan-cleanup")) errors.push(Error("product required audit-only orphan cleanup"))
    report.events = f.events()
    report.responseCounts = [...responses.entries()]
    for (const [id, count] of responses) if (count !== 1) errors.push(Error("duplicate terminal for request " + id))
    for (const name of fs.readdirSync(f.directory)) {
      if (name === "logs" || /\.(json|ndjson)$/.test(name)) {
        fs.cpSync(path.join(f.directory, name), path.join(output, name), { recursive: true })
      }
    }
    for (const action of cleanup.reverse()) {
      try { await action() } catch (error) { errors.push(error) }
    }
    report.cleanupErrors = errors.map(error => error.message)
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2))
    if (errors.length) throw new AggregateError(errors, "audit teardown failed")
  })
  return {
    ...f, report, output, request, release,
    write(name, value) { fs.writeFileSync(path.join(f.directory, name), JSON.stringify(value)) },
    read(name) { return JSON.parse(fs.readFileSync(path.join(f.directory, name), "utf8")) },
    async barrier() {
      const response = await request("arkts/stateAuditBarrier", {})
      assert.equal(response.error?.code, -32601)
    },
    async initialize() {
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const message = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10000)
      assert.equal(message.params.report.semanticState, "ready")
    },
    readiness: (prepare = true) => request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare }),
    definition: (file = "Main.ets", line = 2, character = 23) => request("textDocument/definition", {
      textDocument: { uri: f.uri(file) }, position: { line, character } }, { timeoutMs: 10000 }),
    closeDocument(name) {
      f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: f.uri(name) } } })
      f.session.documentVersions.delete(f.uri(name))
    },
    configure(sdk = f.sdk) {
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: sdk } } } } })
    },
  }
}

export async function until(check, description, timeoutMs = 8000) {
  const deadline = performance.now() + timeoutMs
  while (!check()) {
    if (performance.now() > deadline) throw Error("missing " + description)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

export function exactDefinition(f, symbol = "latestQueried", line = 1) {
  return [{ uri: f.uri("Unopened.ets"), range: {
    start: { line, character: 16 }, end: { line, character: 16 + symbol.length },
  } }]
}

export function rows(f, file = "audit-worker.ndjson") {
  try { return fs.readFileSync(path.join(f.directory, file), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) }
  catch (error) { if (error.code === "ENOENT") return []; throw error }
}

export function workerLifetime(f) {
  let active = 0
  let peak = 0
  const lifetime = rows(f).filter(row => row.event === "created" || row.event === "exited")
  for (const row of lifetime) {
    active += row.event === "created" ? 1 : -1
    peak = Math.max(peak, active)
  }
  return { lifetime, active, peak }
}
