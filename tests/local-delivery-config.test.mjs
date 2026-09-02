import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const languageConfigPath = path.join(
  projectRoot,
  "editors",
  "zed",
  "languages",
  "arkts",
  "config.toml",
)

test("the ArkTS language config enables comments, autoclosing, and ArkTS identifier characters", () => {
  const config = fs.readFileSync(languageConfigPath, "utf8")

  assert.match(config, /block_comment\s*=\s*\{[^}]*start\s*=\s*"\/\*"[^}]*end\s*=\s*"\*\/"[^}]*\}/s)
  assert.match(config, /documentation_comment\s*=\s*\{[^}]*start\s*=\s*"\/\*\*"[^}]*end\s*=\s*"\*\/"[^}]*\}/s)
  assert.match(config, /autoclose_before\s*=\s*"[^"]+"/)
  assert.match(config, /brackets\s*=\s*\[/)
  assert.ok(config.includes('{ start = "{", end = "}"'))
  assert.ok(config.includes('{ start = "(", end = ")"'))
  assert.ok(config.includes('{ start = "\\\"", end = "\\\""'))
  assert.match(config, /word_characters\s*=\s*\[[^\]]*"\$"[^\]]*\]/)
})
