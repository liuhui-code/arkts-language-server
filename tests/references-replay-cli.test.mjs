import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runner = path.join(projectRoot, "scripts", "bench", "replay-references.mjs")

test("references replay exposes one self-contained real-project command", () => {
  const result = spawnSync(process.execPath, [runner, "--help"], {
    cwd: projectRoot,
    encoding: "utf8",
  })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stdout, /--workspace <path>/u)
  assert.match(result.stdout, /--sdk <path>/u)
  assert.match(result.stdout, /--file <workspace-relative path>/u)
  assert.match(result.stdout, /--line <zero-based>/u)
  assert.match(result.stdout, /--character <UTF-16>/u)
  assert.match(result.stdout, /--oracle <report.json>/u)
  assert.match(result.stdout, /--out <report.json>/u)
  assert.match(result.stdout, /textDocument\/references/u)
})

test("references replay fails before launch when required evidence is absent", () => {
  const result = spawnSync(process.execPath, [runner], {
    cwd: projectRoot,
    encoding: "utf8",
  })

  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /--workspace is required/u)
})
