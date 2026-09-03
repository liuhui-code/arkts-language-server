import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

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
          queueMicrotask(() => child.emit("exit", termination.code, termination.signal))
          return child
        },
      })

      assert.deepEqual(calls, [{
        command: "/runtime/current-node",
        args: [
          "--test",
          "--test-concurrency=1",
          "tests/a.test.mjs",
          "tests/z.test.mjs",
        ],
        options: { cwd: "/repository", stdio: "inherit" },
      }])
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

test("package scripts route every Node test gate through the explicit layer runner", () => {
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
    test: "node scripts/run-node-test-layer.mjs --fast",
    "check:fast": "pnpm check && pnpm build && pnpm test",
    "test:unit": "node scripts/run-node-test-layer.mjs --layer unit-contract",
    "test:protocol": "node scripts/run-node-test-layer.mjs --layer protocol",
    "test:e2e:bundle": "node scripts/run-node-test-layer.mjs --layer bundle-e2e",
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

function fakeChild({ code, signal }) {
  return () => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit("exit", code, signal))
    return child
  }
}
