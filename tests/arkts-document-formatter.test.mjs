import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { buildSync } from "esbuild"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("formats ArkTS source with bounded token-preserving edits", (t) => {
  const { formatArktsDocument } = buildDriver(t)
  const source = [
    "struct Page {",
    "  build() {",
    '    const literal = "keep {  spacing  }"',
    "    Column() {",
    "      Text( this.title )",
    '    }.width( "100%" )   ',
    "  }",
    "}",
    "",
  ].join("\n")
  const expected = [
    "struct Page {",
    "  build() {",
    '    const literal = "keep {  spacing  }"',
    "    Column() {",
    "      Text(this.title)",
    '    }.width("100%")',
    "  }",
    "}",
    "",
  ].join("\n")

  const edits = formatArktsDocument("/workspace/Page.ets", source, {
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
  })
  assert.ok(Object.isFrozen(edits))
  assert.ok(edits.every(Object.isFrozen))
  assert.equal(applyOffsetEdits(source, edits), expected)
  assert.deepEqual(formatArktsDocument("/workspace/Page.ets", expected, {
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
  }), [])
})

test("fails closed when source or edit budgets are exceeded", (t) => {
  const { formatArktsDocument } = buildDriver(t)
  const source = "function value( ) { return value( 1,  2 ) }   \n"

  assert.deepEqual(formatArktsDocument("/workspace/Page.ets", source, {
    tabSize: 2,
    insertSpaces: true,
  }, { maxDocumentBytes: 8 }), [])
  assert.deepEqual(formatArktsDocument("/workspace/Page.ets", source, {
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
  }, { maxEdits: 1 }), [])
})

test("honors final-newline formatting options idempotently", (t) => {
  const { formatArktsDocument } = buildDriver(t)
  const cases = [
    {
      name: "inserts the detected LF document EOL",
      source: "struct Page {\n}",
      expected: "struct Page {\n}\n",
      options: { insertFinalNewline: true },
    },
    {
      name: "inserts the detected CRLF document EOL",
      source: "struct Page {\r\n}",
      expected: "struct Page {\r\n}\r\n",
      options: { insertFinalNewline: true },
    },
    {
      name: "trims excess final CRLFs to one document EOL",
      source: "struct Page {\r\n}\r\n\r\n\r\n",
      expected: "struct Page {\r\n}\r\n",
      options: { trimFinalNewlines: true },
    },
  ]

  for (const scenario of cases) {
    const options = {
      tabSize: 2,
      insertSpaces: true,
      ...scenario.options,
    }
    const edits = formatArktsDocument("/workspace/Page.ets", scenario.source, options)
    assert.equal(applyOffsetEdits(scenario.source, edits), scenario.expected, scenario.name)
    assert.deepEqual(
      formatArktsDocument("/workspace/Page.ets", scenario.expected, options),
      [],
      `${scenario.name} is idempotent`,
    )
  }
})

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-formatter-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "formatter.cjs")
  buildSync({
    entryPoints: [
      path.join(projectRoot, "src", "core", "formatting", "arkts-document-formatter.ts"),
    ],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function applyOffsetEdits(source, edits) {
  let result = source
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.newText + result.slice(edit.start + edit.length)
  }
  return result
}
