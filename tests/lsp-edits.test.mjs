import assert from "node:assert/strict"
import test from "node:test"

import { applyTextEdits, applyWorkspaceEdit } from "./support/lsp-edits.mjs"

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

test("applies WorkspaceEdit changes immutably and returns documents in URI order", () => {
  const documents = new Map([
    ["file:///z.ets", "😀old"],
    ["file:///a.ets", "const value = 1"],
  ])
  const workspaceEdit = {
    changes: {
      "file:///z.ets": [{
        range: {
          start: { line: 0, character: 2 },
          end: { line: 0, character: 5 },
        },
        newText: "new",
      }],
      "file:///a.ets": [{
        range: {
          start: { line: 0, character: 14 },
          end: { line: 0, character: 15 },
        },
        newText: "2",
      }],
    },
  }
  const originalEdit = structuredClone(workspaceEdit)

  const updated = applyWorkspaceEdit(documents, workspaceEdit)

  assert.deepEqual([...updated], [
    ["file:///a.ets", "const value = 2"],
    ["file:///z.ets", "😀new"],
  ])
  assert.deepEqual([...documents], [
    ["file:///z.ets", "😀old"],
    ["file:///a.ets", "const value = 1"],
  ])
  assert.deepEqual(workspaceEdit, originalEdit)
})

test("rejects WorkspaceEdit changes for an unknown document URI", () => {
  const documents = new Map([["file:///known.ets", "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      changes: { "file:///unknown.ets": [] },
    }),
    /unknown document URI.*file:\/\/\/unknown\.ets/i,
  )
  assert.deepEqual([...documents], [["file:///known.ets", "known"]])
})

test("rejects unsupported documentChanges instead of partially applying changes", () => {
  const documents = new Map([["file:///known.ets", "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      changes: { "file:///known.ets": [] },
      documentChanges: [],
    }),
    /documentChanges.*not supported/i,
  )
  assert.deepEqual([...documents], [["file:///known.ets", "known"]])
})
