import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const gate = path.join(projectRoot, "scripts", "check-zed-queries.sh")

function withManifest(contents, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-query-manifest-"))
  const manifest = path.join(directory, "extension.toml")
  fs.writeFileSync(manifest, contents)
  try {
    return callback(manifest)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

function parseGrammar(contents) {
  return withManifest(contents, (manifest) => spawnSync(
    gate,
    ["--print-grammar-source", manifest],
    { encoding: "utf8" },
  ))
}

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "ArkTS query gate test",
      GIT_AUTHOR_EMAIL: "query-gate@example.invalid",
      GIT_COMMITTER_NAME: "ArkTS query gate test",
      GIT_COMMITTER_EMAIL: "query-gate@example.invalid",
    },
  }).trim()
}

function createGrammarCacheFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-query-cache-"))
  const source = path.join(directory, "source")
  const cache = path.join(directory, "cache")
  fs.mkdirSync(path.join(source, "src"), { recursive: true })
  fs.writeFileSync(path.join(source, "src", "parser.c"), "/* pinned parser */\n")
  git(source, "init", "--quiet")
  git(source, "add", "src/parser.c")
  git(source, "commit", "--quiet", "-m", "pinned grammar")
  const revision = git(source, "rev-parse", "HEAD")
  const repository = `file://${source}`
  git(directory, "clone", "--quiet", repository, cache)
  const manifest = path.join(directory, "extension.toml")
  fs.writeFileSync(manifest, `
[grammars.arkts]
repository = "${repository}"
rev = "${revision}"
`)
  return { cache, directory, manifest }
}

function verifyGrammarCache({ cache, manifest }) {
  return spawnSync(
    gate,
    ["--verify-grammar-cache", manifest, cache],
    { encoding: "utf8" },
  )
}

test("the query gate reads repository and revision only from grammars.arkts", () => {
  const repository = "file:///tmp/declared-tree-sitter-arkts"
  const revision = "1234567890abcdef1234567890abcdef12345678"
  const result = parseGrammar(`
repository = "https://example.invalid/free-floating"
rev = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

[grammars.other]
repository = "https://example.invalid/other"
rev = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

[grammars.arkts]
repository = "${repository}"
rev = "${revision}"
`)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, `${repository}\t${revision}\n`)
})

test("the grammar manifest parser rejects a non-commit ArkTS revision", () => {
  const result = parseGrammar(`
[grammars.arkts]
repository = "https://example.invalid/tree-sitter-arkts"
rev = "1234"
`)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /40-character hexadecimal commit/)
})

test("the grammar manifest parser rejects moved, missing, and mismatched ArkTS fields", () => {
  const revision = "1234567890abcdef1234567890abcdef12345678"
  const invalidManifests = [
    `repository = "https://example.invalid/moved"\nrev = "${revision}"\n`,
    `[grammars.arkts]\nrepository = "https://example.invalid/missing-rev"\n`,
    `[grammars.arkts.metadata]\nrepository = "https://example.invalid/wrong-table"\nrev = "${revision}"\n`,
  ]

  for (const manifest of invalidManifests) {
    const result = parseGrammar(manifest)
    assert.notEqual(result.status, 0, manifest)
    assert.match(result.stderr, /grammars\.arkts/)
  }
})

test("the query gate rejects an untracked parser or scanner in the grammar cache", () => {
  const fixture = createGrammarCacheFixture()
  const { cache, directory } = fixture
  fs.writeFileSync(path.join(cache, "src", "scanner.c"), "/* unexpected scanner */\n")

  try {
    const result = verifyGrammarCache(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /dirty or untracked parser\/scanner cache/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("the query gate rejects a modified tracked parser in the grammar cache", () => {
  const fixture = createGrammarCacheFixture()
  fs.writeFileSync(path.join(fixture.cache, "src", "parser.c"), "/* modified parser */\n")

  try {
    const result = verifyGrammarCache(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /dirty or untracked parser\/scanner cache/)
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test("the query gate accepts the same declared origin with a conventional dot-git suffix", () => {
  const fixture = createGrammarCacheFixture()
  const repository = "https://example.invalid/tree-sitter-arkts"
  const revision = git(fixture.cache, "rev-parse", "HEAD")
  git(fixture.cache, "remote", "set-url", "origin", `${repository}.git`)
  fs.writeFileSync(fixture.manifest, `
[grammars.arkts]
repository = "${repository}"
rev = "${revision}"
`)

  try {
    const result = verifyGrammarCache(fixture)
    assert.equal(result.status, 0, result.stderr)
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test("the query gate discovers every shipped scm query instead of a fixed list", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-query-files-"))
  const nested = path.join(directory, "future")
  fs.mkdirSync(nested)
  const expected = [
    path.join(directory, "highlights.scm"),
    path.join(directory, "new-zed-query.scm"),
    path.join(nested, "nested-query.scm"),
  ].sort()
  for (const query of expected) fs.writeFileSync(query, "(identifier) @variable\n")
  fs.writeFileSync(path.join(directory, "README.md"), "not a query\n")

  try {
    const result = spawnSync(gate, ["--print-query-files", directory], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trim().split("\n"), expected)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
