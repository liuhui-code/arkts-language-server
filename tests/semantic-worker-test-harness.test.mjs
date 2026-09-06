import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"

import { buildBlockingSemanticTestServer } from "./support/build-worker-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const helperUrl = pathToFileURL(path.join(
  projectRoot,
  "tests",
  "support",
  "build-worker-test-server.mjs",
)).href

test("builds the blocking semantic server and worker outside repository dist", (t) => {
  const build = buildBlockingSemanticTestServer()
  t.after(build.cleanup)

  assert.equal(buildBlockingSemanticTestServer(), build)
  assert.equal(fs.existsSync(build.serverPath), true)
  assert.equal(fs.existsSync(build.workerPath), true)
  assert.equal(path.dirname(build.serverPath), build.outputDirectory)
  assert.equal(path.dirname(build.workerPath), build.outputDirectory)
  assert.equal(isWithin(path.join(projectRoot, "dist"), build.outputDirectory), false)
})

test("isolates concurrent semantic fixture builds by test process", async () => {
  const [left, right] = await Promise.all([runBuildProcess(), runBuildProcess()])

  for (const result of [left, right]) {
    assert.deepEqual(result.exit, { code: 0, signal: null }, result.stderr)
    assert.equal(result.report.serverExists, true)
    assert.equal(result.report.workerExists, true)
    assert.equal(result.report.outputDirectory, path.dirname(result.report.serverPath))
    assert.equal(result.report.outputDirectory, path.dirname(result.report.workerPath))
  }
  assert.notEqual(left.report.outputDirectory, right.report.outputDirectory)
  assert.equal(fs.existsSync(left.report.outputDirectory), false)
  assert.equal(fs.existsSync(right.report.outputDirectory), false)
})

test("the worker reaches terminal only after its request cancellation cell is released", async (t) => {
  const build = buildBlockingSemanticTestServer()
  const worker = new Worker(build.workerPath)
  t.after(async () => {
    await worker.terminate()
    build.cleanup()
  })

  const cancelCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  worker.postMessage({
    protocol: 1,
    kind: "block",
    requestId: 41,
    cancelCell,
  })

  assert.deepEqual(await nextWorkerMessage(worker, "entered"), {
    protocol: 1,
    kind: "entered",
    requestId: 41,
  })
  const terminal = nextWorkerMessage(worker, "terminal")
  const cancellation = new Int32Array(cancelCell)
  Atomics.store(cancellation, 0, 1)
  Atomics.notify(cancellation, 0)
  assert.deepEqual(await terminal, {
    protocol: 1,
    kind: "terminal",
    requestId: 41,
    cancellation: 1,
  })
})

test("cleans the process-scoped fixture build idempotently", () => {
  const exitListenersBeforeBuild = process.listenerCount("exit")
  const build = buildBlockingSemanticTestServer()

  assert.equal(process.listenerCount("exit"), exitListenersBeforeBuild + 1)
  build.cleanup()
  assert.doesNotThrow(build.cleanup)
  assert.equal(fs.existsSync(build.outputDirectory), false)
  assert.equal(process.listenerCount("exit"), exitListenersBeforeBuild)
})

test("publishes a standard log barrier before cancelling a blocking semantic request", async (t) => {
  const build = buildBlockingSemanticTestServer()
  const server = new LspProcess({ serverPath: build.serverPath })
  t.after(async () => {
    await server.close()
    build.cleanup()
  })
  const uri = pathToFileURL(path.join(projectRoot, "fixtures", "BlockingWorker.ets")).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(projectRoot).href,
      capabilities: {},
    },
  })
  assert.equal((await server.response(1)).error, undefined)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri, languageId: "arkts", version: 1, text: "struct BlockingWorker {}" },
    },
  })

  const entered = server.notification(
    "window/logMessage",
    (message) => message.params?.message === "blocking semantic request entered",
  )
  server.send({
    jsonrpc: "2.0",
    id: 10,
    method: "textDocument/references",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 7 },
      context: { includeDeclaration: true },
    },
  })
  await entered
  server.send({
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id: 10 },
  })

  assert.deepEqual((await server.response(10)).error, {
    code: -32800,
    message: "Request cancelled by client",
  })
})

function nextWorkerMessage(worker, kind, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      worker.off("message", onMessage)
      worker.off("error", onError)
      worker.off("exit", onExit)
    }
    const onMessage = (message) => {
      if (message?.kind !== kind) return
      cleanup()
      resolve(message)
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    const onExit = (code) => {
      cleanup()
      reject(new Error(`worker exited with code ${code} before ${kind}`))
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`timed out waiting for worker ${kind}`))
    }, timeoutMs)
    worker.on("message", onMessage)
    worker.once("error", onError)
    worker.once("exit", onExit)
  })
}

function runBuildProcess() {
  const source = `
    import fs from "node:fs";
    import { buildBlockingSemanticTestServer } from ${JSON.stringify(helperUrl)};
    const build = buildBlockingSemanticTestServer();
    process.stdout.write(JSON.stringify({
      outputDirectory: build.outputDirectory,
      serverPath: build.serverPath,
      workerPath: build.workerPath,
      serverExists: fs.existsSync(build.serverPath),
      workerExists: fs.existsSync(build.workerPath),
    }));
  `
  return runNodeProcess(source)
}

function runNodeProcess(source) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("close", (code, signal) => {
      let report = {}
      try {
        report = JSON.parse(stdout)
      } catch {}
      resolve({ exit: { code, signal }, report, stderr })
    })
  })
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
