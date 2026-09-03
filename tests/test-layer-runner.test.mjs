import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"

import { runNodeTestLayer } from "../scripts/run-node-test-layer.mjs"

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
