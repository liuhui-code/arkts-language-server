import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const runner = fileURLToPath(new URL("../scripts/run-node-test-layer.mjs", import.meta.url))

test("a real test-runner signal is reported on stderr without inventing a test summary", t => {
  const result = runDiagnostic(t, `
    const child = spawn(command, args, { ...options, env });
    child.once("spawn", () => child.kill("SIGTERM"));
    return child;
  `)
  assert.deepEqual(result.termination, {
    entries: ["input.test.mjs"], code: null, signal: "SIGTERM",
  })
  assert.match(result.stderr, /\[node-test-layer\] child-exit code=null signal=SIGTERM/)
  assert.doesNotMatch(result.stdout, /tests \d+|pass \d+|fail \d+/)
  assert.doesNotMatch(result.stderr, /runtime-summary|PASS|test.*count/)
})

test("a missing runtime report is distinguished from a real clean child exit", t => {
  const result = runDiagnostic(t, `
    const report = args.find(arg => arg.startsWith("--test-reporter-destination=")
      && arg.endsWith("summary.json")).split("=").slice(1).join("=");
    const child = spawn(command, args, { ...options, env });
    child.once("close", code => {
      if (code === 0) fs.unlinkSync(report);
    });
    return child;
  `)
  assert.deepEqual(result.termination, {
    entries: ["input.test.mjs"], code: 1, signal: null,
  })
  assert.match(result.stdout, /pass 1/)
  assert.match(result.stderr,
    /\[node-test-layer\] runtime-summary-unavailable reason=ENOENT child-code=0/)
  assert.doesNotMatch(result.stderr, /child-exit code=1/)
})

test("an ordinary test failure retains its real exit without claiming a missing summary", t => {
  const result = runDiagnostic(t, "return spawn(command, args, { ...options, env });",
    'import test from "node:test"; test("failed input", () => { throw Error("sentinel failure") })\n')
  assert.deepEqual(result.termination, {
    entries: ["input.test.mjs"], code: 1, signal: null,
  })
  assert.match(result.stdout, /fail 1/)
  assert.match(result.stderr, /\[node-test-layer\] child-exit code=1 signal=null/)
  assert.doesNotMatch(result.stderr, /runtime-summary-unavailable|signal=SIGTERM/)
})

function runDiagnostic(t, spawnBody, input =
  'import test from "node:test"; test("clean input", () => {})\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-layer-diagnostic-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, "input.test.mjs"), input)
  const source = `
    import { spawn } from "node:child_process";
    import fs from "node:fs";
    import { runNodeTestLayer } from ${JSON.stringify(runner)};
    const result = await runNodeTestLayer({
      argv: ["--layer", "protocol"], cwd: ${JSON.stringify(root)}, evidenceRoot: null,
      manifest: { layers: [{ id: "protocol", entries: ["input.test.mjs"] }] },
      spawn(command, args, options) {
        const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
        ${spawnBody}
      },
    });
    process.stdout.write(JSON.stringify(result) + "\\n");
  `
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    encoding: "utf8", env, timeout: 10_000, maxBuffer: 16_384,
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0)
  return { ...result, termination: JSON.parse(result.stdout.trim().split("\n").at(-1)) }
}
