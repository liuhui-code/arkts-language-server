import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const extensionRoot = path.join(projectRoot, "editors", "zed")

test("the local Zed adapter registers ArkTS and launches the spike server", () => {
  const manifest = fs.readFileSync(path.join(extensionRoot, "extension.toml"), "utf8")
  const language = fs.readFileSync(path.join(extensionRoot, "languages", "arkts", "config.toml"), "utf8")
  const adapter = fs.readFileSync(path.join(extensionRoot, "src", "lib.rs"), "utf8")

  assert.match(manifest, /\[language_servers\.arkts-language-server\]/)
  assert.match(language, /path_suffixes\s*=\s*\["ets"\]/)
  assert.match(adapter, /\/usr\/local\/bin\/node/)
  assert.match(adapter, /\/Users\/liuhui\/Documents\/code\/arkts-language-server\/dist\/server\.cjs/)
  assert.doesNotMatch(adapter, /sdkPath|hmsPath|ssh/i)
})
