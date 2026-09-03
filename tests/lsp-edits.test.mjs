import assert from "node:assert/strict"
import test from "node:test"

import { applyTextEdits } from "./support/lsp-edits.mjs"

test("applies a TextEdit at UTF-16 positions after an emoji", () => {
  const source = "header\n😀old\ntail"

  const updated = applyTextEdits(source, [{
    range: {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 5 },
    },
    newText: "new",
  }])

  assert.equal(updated, "header\n😀new\ntail")
})

test("applies non-overlapping TextEdits from the end of the document", () => {
  const updated = applyTextEdits("one two three", [
    {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 },
      },
      newText: "1",
    },
    {
      range: {
        start: { line: 0, character: 8 },
        end: { line: 0, character: 13 },
      },
      newText: "3",
    },
  ])

  assert.equal(updated, "1 two 3")
})

test("rejects a TextEdit character beyond its line", () => {
  assert.throws(
    () => applyTextEdits("short", [{
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 6 },
      },
      newText: "!",
    }]),
    /out of bounds.*line 0, character 6/i,
  )
})

test("rejects a negative LSP line", () => {
  assert.throws(
    () => applyTextEdits("text", [{
      range: {
        start: { line: -1, character: 0 },
        end: { line: -1, character: 0 },
      },
      newText: "!",
    }]),
    /out of bounds.*line -1, character 0/i,
  )
})

test("rejects a TextEdit whose range starts after its end", () => {
  assert.throws(
    () => applyTextEdits("abcdef", [{
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 2 },
      },
      newText: "invalid",
    }]),
    /range start is after its end/i,
  )
})

test("rejects overlapping TextEdits", () => {
  assert.throws(
    () => applyTextEdits("abcdef", [
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 4 },
        },
        newText: "first",
      },
      {
        range: {
          start: { line: 0, character: 3 },
          end: { line: 0, character: 5 },
        },
        newText: "second",
      },
    ]),
    /overlapping TextEdits/i,
  )
})
