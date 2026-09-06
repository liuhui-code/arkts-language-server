import assert from "node:assert/strict"
import { spawn as spawnChild } from "node:child_process"
import { EventEmitter } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import nodeTestRuntimeReporter from "../scripts/node-test-runtime-reporter.mjs"
import { runNodeTestLayer } from "../scripts/run-node-test-layer.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("--fast --list prints the stable deduplicated fast-layer entries without spawning", async () => {
  const stdout = bufferedOutput()
  let spawnCount = 0
  const manifest = {
    layers: [
      { id: "unit-contract", fast: true, entries: ["tests/z.test.mjs", "tests/a.test.mjs"] },
      { id: "protocol", fast: true, entries: ["tests/a.test.mjs", "tests/m.test.mjs"] },
      { id: "artifact-e2e", fast: false, entries: ["tests/release/install.acceptance.mjs"] },
    ],
  }

  const result = await runNodeTestLayer({
    argv: ["--fast", "--list"],
    manifest,
    stdout,
    spawn: () => {
      spawnCount += 1
      throw new Error("list mode must not spawn")
    },
  })

  assert.equal(stdout.value, [
    "tests/a.test.mjs",
    "tests/m.test.mjs",
    "tests/z.test.mjs",
    "",
  ].join("\n"))
  assert.deepEqual(result, {
    entries: ["tests/a.test.mjs", "tests/m.test.mjs", "tests/z.test.mjs"],
    code: 0,
    signal: null,
  })
  assert.equal(spawnCount, 0)
})

test("--layer spawns the selected tests with the current Node and preserves termination", async (t) => {
  for (const termination of [
    { code: 23, signal: null },
    { code: null, signal: "SIGTERM" },
  ]) {
    await t.test(JSON.stringify(termination), async () => {
      const calls = []
      const manifest = {
        layers: [
          { id: "unit-contract", fast: true, entries: ["tests/unit.test.mjs"] },
          { id: "protocol", fast: true, entries: ["tests/z.test.mjs", "tests/a.test.mjs", "tests/a.test.mjs"] },
        ],
      }
      const result = await runNodeTestLayer({
        argv: ["--layer", "protocol"],
        manifest,
        nodePath: "/runtime/current-node",
        cwd: "/repository",
        stdout: bufferedOutput(),
        spawn(command, args, options) {
          calls.push({ command, args, options })
          const child = new EventEmitter()
          queueMicrotask(() => child.emit("close", termination.code, termination.signal))
          return child
        },
      })

      assert.equal(calls.length, 1)
      const [call] = calls
      assert.equal(call.command, "/runtime/current-node")
      assert.deepEqual(call.args.slice(0, 5), [
        "--test",
        "--test-concurrency=1",
        "--test-reporter=spec",
        `--test-reporter=${path.join(projectRoot, "scripts", "node-test-runtime-reporter.mjs")}`,
        "--test-reporter-destination=stdout",
      ])
      const destinationPrefix = "--test-reporter-destination="
      assert.ok(call.args[5].startsWith(destinationPrefix))
      const reportPath = call.args[5].slice(destinationPrefix.length)
      assert.equal(path.basename(reportPath), "summary.json")
      assert.match(path.basename(path.dirname(reportPath)), /^arkts-node-test-runtime-/)
      assert.equal(fs.existsSync(path.dirname(reportPath)), false)
      assert.deepEqual(call.args.slice(6), ["tests/a.test.mjs", "tests/z.test.mjs"])
      assert.deepEqual(call.options, { cwd: "/repository", stdio: "inherit" })
      assert.deepEqual(result, {
        entries: ["tests/a.test.mjs", "tests/z.test.mjs"],
        ...termination,
      })
    })
  }
})

test("retains bounded evidence for every selected layer failure", async (t) => {
  const manifest = evidenceManifest()
  const selections = [
    { argv: ["--fast"], target: "fast" },
    { argv: ["--layer", "artifact-e2e"], target: "artifact-e2e" },
    { argv: ["--layer", "large"], target: "large" },
  ]
  const terminations = [
    { code: 23, signal: null },
    { code: null, signal: "SIGTERM" },
  ]

  for (const selection of selections) {
    for (const termination of terminations) {
      await t.test(`${selection.target} ${termination.code ?? termination.signal}`, async (t) => {
        const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-layer-runner-failure-"))
        t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }))

        const result = await runNodeTestLayer({
          argv: selection.argv,
          manifest,
          evidenceRoot,
          spawn: fakeChild(termination),
        })

        assert.deepEqual(result, {
          entries: selectedEntries(selection.target),
          ...termination,
        })
        const retained = fs.readdirSync(evidenceRoot)
        assert.equal(retained.length, 1)
        const failureText = fs.readFileSync(
          path.join(evidenceRoot, retained[0], "failure.json"),
          "utf8",
        )
        assert.deepEqual(JSON.parse(failureText), {
          schema: "arkts-language-server.test-failure",
          schemaVersion: 1,
          caseId: `node-test-layer/${selection.target}`,
          error: {
            name: "Error",
            message: "Test case failed",
            ...termination,
          },
          metadata: { target: selection.target },
        })
        assert.doesNotMatch(
          failureText,
          /PRIVATE_SOURCE_SHOULD_NOT_BE_WRITTEN|SECRET_TOKEN|"entries"|"source"|"environment"/,
        )
      })
    }
  }
})

test("removes transient evidence after a selected layer succeeds", async (t) => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-layer-runner-success-"))
  t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }))

  const result = await runNodeTestLayer({
    argv: ["--layer", "artifact-e2e"],
    manifest: evidenceManifest(),
    evidenceRoot,
    spawn: fakeChild({ code: 0, signal: null }),
  })

  assert.deepEqual(result, {
    entries: selectedEntries("artifact-e2e"),
    code: 0,
    signal: null,
  })
  assert.deepEqual(fs.readdirSync(evidenceRoot), [])
})

test("uses ARKTS_TEST_EVIDENCE_ROOT when no evidence root is injected", async (t) => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-layer-runner-env-"))
  const previousRoot = process.env.ARKTS_TEST_EVIDENCE_ROOT
  process.env.ARKTS_TEST_EVIDENCE_ROOT = evidenceRoot
  t.after(() => {
    if (previousRoot === undefined) delete process.env.ARKTS_TEST_EVIDENCE_ROOT
    else process.env.ARKTS_TEST_EVIDENCE_ROOT = previousRoot
    fs.rmSync(evidenceRoot, { recursive: true, force: true })
  })

  const result = await runNodeTestLayer({
    argv: ["--fast"],
    manifest: evidenceManifest(),
    spawn: fakeChild({ code: 19, signal: null }),
  })

  assert.equal(result.code, 19)
  const [retainedDirectory] = fs.readdirSync(evidenceRoot)
  assert.ok(retainedDirectory)
  assert.equal(
    fs.existsSync(path.join(evidenceRoot, retainedDirectory, "failure.json")),
    true,
  )
})

test("turns runtime skip and todo results into gate failures for every policy", async (t) => {
  const selections = [
    { argv: ["--fast"], target: "fast" },
    { argv: ["--layer", "artifact-e2e"], target: "artifact-e2e" },
    { argv: ["--layer", "large"], target: "large" },
  ]

  for (const annotation of ["skip", "todo"]) {
    for (const selection of selections) {
      await t.test(`${selection.target} rejects ${annotation}`, async (t) => {
        const workspace = runtimeAnnotatedTestWorkspace(t, annotation)
        const result = await runNodeTestLayer({
          argv: selection.argv,
          manifest: runtimePolicyManifest(path.basename(workspace.entry)),
          cwd: workspace.root,
          evidenceRoot: null,
          spawn: spawnOutsideNodeTestContext,
        })

        assert.deepEqual(result, {
          entries: [path.basename(workspace.entry)],
          code: 1,
          signal: null,
        })
      })
    }
  }
})

test("allows a real clean Node test through the runtime gate", async (t) => {
  const workspace = runtimeAnnotatedTestWorkspace(t)
  const result = await runNodeTestLayer({
    argv: ["--fast"],
    manifest: runtimePolicyManifest(path.basename(workspace.entry)),
    cwd: workspace.root,
    evidenceRoot: null,
    spawn: spawnOutsideNodeTestContext,
  })

  assert.deepEqual(result, {
    entries: [path.basename(workspace.entry)],
    code: 0,
    signal: null,
  })
})

test("turns a machine-reported cancellation into a gate failure", async () => {
  const result = await runNodeTestLayer({
    argv: ["--layer", "large"],
    manifest: evidenceManifest(),
    evidenceRoot: null,
    spawn: fakeChild({
      code: 0,
      signal: null,
      runtimeCounts: { skipped: 0, todo: 0, cancelled: 1 },
    }),
  })

  assert.deepEqual(result, {
    entries: selectedEntries("large"),
    code: 1,
    signal: null,
  })
})

test("runtime reporter reduces annotations and cancellation to one bounded summary", async () => {
  async function* events() {
    yield { type: "test:pass", data: { skip: "platform unavailable" } }
    yield { type: "test:pass", data: { todo: true } }
    yield {
      type: "test:fail",
      data: { details: { error: { failureType: "cancelledByParent" } } },
    }
    yield { type: "test:stdout", data: { message: "source output is not retained" } }
  }

  const output = []
  for await (const chunk of nodeTestRuntimeReporter(events())) output.push(chunk)

  assert.equal(output.length, 1)
  assert.ok(Buffer.byteLength(output[0]) < 256)
  assert.deepEqual(JSON.parse(output[0]), {
    schema: "arkts-language-server.node-test-runtime",
    schemaVersion: 1,
    counts: { skipped: 1, todo: 1, cancelled: 1 },
  })
})

test("fails closed when a runtime report exceeds the parser bound", async () => {
  const result = await runNodeTestLayer({
    argv: ["--fast"],
    manifest: evidenceManifest(),
    evidenceRoot: null,
    spawn: fakeChild({
      code: 0,
      signal: null,
      runtimeReport: "x".repeat(5_000),
    }),
  })

  assert.equal(result.code, 1)
  assert.equal(result.signal, null)
})

test("preserves spawn error identity when evidence capture is enabled", async (t) => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-layer-runner-spawn-"))
  t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }))
  const spawnError = Object.assign(new Error("spawn failed"), { code: "ENOENT" })

  await assert.rejects(
    runNodeTestLayer({
      argv: ["--fast"],
      manifest: evidenceManifest(),
      evidenceRoot,
      spawn() {
        const child = new EventEmitter()
        queueMicrotask(() => child.emit("error", spawnError))
        return child
      },
    }),
    (error) => error === spawnError,
  )
})

test("rejects unknown, missing, and duplicate selections before spawning", async () => {
  const manifest = {
    layers: [
      { id: "unit-contract", fast: true, entries: ["tests/unit.test.mjs"] },
      { id: "protocol", fast: true, entries: ["tests/protocol.test.mjs"] },
    ],
  }
  const invalidSelections = [
    { argv: ["--layer", "missing", "--list"], error: /unknown test layer: missing/ },
    { argv: ["--layer", "--list"], error: /--layer requires a layer id/ },
    { argv: ["--fast", "--fast", "--list"], error: /--fast may appear only once/ },
    { argv: ["--layer", "protocol", "--layer", "protocol", "--list"], error: /--layer may appear only once/ },
    { argv: ["--fast", "--layer", "protocol", "--list"], error: /choose exactly one.*--fast.*--layer/ },
    { argv: ["--fast", "--list", "--list"], error: /--list may appear only once/ },
    { argv: ["--list"], error: /choose exactly one.*--fast.*--layer/ },
    { argv: ["--fast", "--unknown"], error: /unknown argument: --unknown/ },
  ]
  let spawnCount = 0

  for (const { argv, error } of invalidSelections) {
    await assert.rejects(
      runNodeTestLayer({
        argv,
        manifest,
        stdout: bufferedOutput(),
        spawn: () => {
          spawnCount += 1
          throw new Error("invalid selection must not spawn")
        },
      }),
      error,
      argv.join(" "),
    )
  }
  assert.equal(spawnCount, 0)
})

test("rejects an empty selection instead of triggering Node implicit discovery", async () => {
  let spawnCount = 0
  await assert.rejects(
    runNodeTestLayer({
      argv: ["--fast"],
      manifest: {
        layers: [{ id: "artifact-e2e", fast: false, entries: ["tests/release/install.acceptance.mjs"] }],
      },
      stdout: bufferedOutput(),
      spawn: () => {
        spawnCount += 1
        throw new Error("empty selection must not spawn")
      },
    }),
    /selected test layers contain no entries/,
  )
  assert.equal(spawnCount, 0)
})

test("package test entrypoints build a fresh bundle exactly once without recursive builds", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))

  assert.deepEqual({
    test: packageJson.scripts.test,
    "check:fast": packageJson.scripts["check:fast"],
    "test:unit": packageJson.scripts["test:unit"],
    "test:protocol": packageJson.scripts["test:protocol"],
    "test:e2e:bundle": packageJson.scripts["test:e2e:bundle"],
    "test:e2e:artifact": packageJson.scripts["test:e2e:artifact"],
    "test:e2e:large": packageJson.scripts["test:e2e:large"],
  }, {
    test: "pnpm build && node scripts/run-node-test-layer.mjs --fast",
    "check:fast": "pnpm check && pnpm test",
    "test:unit": "node scripts/run-node-test-layer.mjs --layer unit-contract",
    "test:protocol": "node scripts/run-node-test-layer.mjs --layer protocol",
    "test:e2e:bundle": "pnpm build && node scripts/run-node-test-layer.mjs --layer bundle-e2e",
    "test:e2e:artifact": "node scripts/run-node-test-layer.mjs --layer artifact-e2e",
    "test:e2e:large": "node scripts/run-node-test-layer.mjs --layer large",
  })
})

function bufferedOutput() {
  let value = ""
  return {
    write(chunk) {
      value += chunk
    },
    get value() {
      return value
    },
  }
}

function evidenceManifest() {
  return {
    layers: [
      {
        id: "unit-contract",
        fast: true,
        entries: ["tests/PRIVATE_SOURCE_SHOULD_NOT_BE_WRITTEN.test.mjs"],
      },
      { id: "protocol", fast: true, entries: ["tests/protocol.test.mjs"] },
      { id: "artifact-e2e", fast: false, entries: ["tests/release/artifact.acceptance.mjs"] },
      { id: "large", fast: false, entries: ["tests/release/large.acceptance.mjs"] },
    ],
  }
}

function selectedEntries(target) {
  if (target === "fast") {
    return [
      "tests/PRIVATE_SOURCE_SHOULD_NOT_BE_WRITTEN.test.mjs",
      "tests/protocol.test.mjs",
    ]
  }
  if (target === "artifact-e2e") return ["tests/release/artifact.acceptance.mjs"]
  return ["tests/release/large.acceptance.mjs"]
}

function fakeChild({
  code,
  signal,
  runtimeCounts = { skipped: 0, todo: 0, cancelled: 0 },
  runtimeReport,
}) {
  return (_command, args = []) => {
    const destinationPrefix = "--test-reporter-destination="
    const reportDestination = args
      .filter((argument) => argument.startsWith(destinationPrefix))
      .map((argument) => argument.slice(destinationPrefix.length))
      .find((destination) => destination !== "stdout" && destination !== "stderr")
    if (reportDestination) {
      fs.writeFileSync(
        reportDestination,
        runtimeReport ?? `${JSON.stringify({
          schema: "arkts-language-server.node-test-runtime",
          schemaVersion: 1,
          counts: runtimeCounts,
        })}\n`,
      )
    }
    const child = new EventEmitter()
    queueMicrotask(() => child.emit("close", code, signal))
    return child
  }
}

function runtimeAnnotatedTestWorkspace(t, annotation) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-runtime-annotation-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const entry = path.join(root, "runtime-annotation.test.mjs")
  fs.writeFileSync(entry, [
    'import test from "node:test"',
    annotation
      ? `const runtimeOption = { [${JSON.stringify(annotation)}]: true }`
      : "const runtimeOption = {}",
    'test("runtime-only annotation", runtimeOption, () => {})',
    "",
  ].join("\n"))
  return { root, entry }
}

function runtimePolicyManifest(entry) {
  return {
    layers: [
      { id: "unit-contract", fast: true, entries: [entry] },
      { id: "artifact-e2e", fast: false, entries: [entry] },
      { id: "large", fast: false, entries: [entry] },
    ],
  }
}

function spawnOutsideNodeTestContext(command, args, options) {
  const environment = { ...process.env }
  delete environment.NODE_TEST_CONTEXT
  return spawnChild(command, args, { ...options, env: environment })
}
