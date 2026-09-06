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

test("applies a versioned TextDocumentEdit to the exact open snapshot", () => {
  const uri = "file:///open.ets"
  const documents = new Map([[uri, "const value = '😀old'"]])

  const updated = applyWorkspaceEdit(documents, {
    documentChanges: [{
      textDocument: { uri, version: 7 },
      edits: [{
        range: {
          start: { line: 0, character: 17 },
          end: { line: 0, character: 20 },
        },
        newText: "new",
      }],
    }],
  }, {
    documentVersions: new Map([[uri, 7]]),
  })

  assert.deepEqual([...updated], [[uri, "const value = '😀new'"]])
})

test("applies a null-version TextDocumentEdit to an explicit disk snapshot", () => {
  const uri = "file:///disk.ets"
  const documents = new Map([[uri, "const value = old"]])

  const updated = applyWorkspaceEdit(documents, {
    documentChanges: [{
      textDocument: { uri, version: null },
      edits: [{
        range: {
          start: { line: 0, character: 14 },
          end: { line: 0, character: 17 },
        },
        newText: "new",
      }],
    }],
  }, {
    documentVersions: new Map([[uri, null]]),
  })

  assert.deepEqual([...updated], [[uri, "const value = new"]])
})

test("applies TextDocumentEdits immutably and returns snapshots in URI order", () => {
  const documents = new Map([
    ["file:///z.ets", "😀old"],
    ["file:///a.ets", "const value = 1"],
  ])
  const documentVersions = new Map([
    ["file:///z.ets", 7],
    ["file:///a.ets", null],
  ])
  const workspaceEdit = {
    documentChanges: [
      {
        textDocument: { uri: "file:///z.ets", version: 7 },
        edits: [{
          range: {
            start: { line: 0, character: 2 },
            end: { line: 0, character: 5 },
          },
          newText: "new",
        }],
      },
      {
        textDocument: { uri: "file:///a.ets", version: null },
        edits: [{
          range: {
            start: { line: 0, character: 14 },
            end: { line: 0, character: 15 },
          },
          newText: "2",
        }],
      },
    ],
  }
  const originalEdit = structuredClone(workspaceEdit)
  const originalVersions = [...documentVersions]

  const updated = applyWorkspaceEdit(documents, workspaceEdit, { documentVersions })

  assert.deepEqual([...updated], [
    ["file:///a.ets", "const value = 2"],
    ["file:///z.ets", "😀new"],
  ])
  assert.deepEqual([...documents], [
    ["file:///z.ets", "😀old"],
    ["file:///a.ets", "const value = 1"],
  ])
  assert.deepEqual(documentVersions, new Map(originalVersions))
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

test("atomically rejects a TextDocumentEdit for an unknown URI", () => {
  const knownUri = "file:///known.ets"
  const unknownUri = "file:///unknown.ets"
  const documents = new Map([[knownUri, "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      documentChanges: [{
        textDocument: { uri: unknownUri, version: 1 },
        edits: [],
      }],
    }, {
      documentVersions: new Map([[unknownUri, 1]]),
    }),
    /unknown document URI.*file:\/\/\/unknown\.ets/i,
  )
  assert.deepEqual([...documents], [[knownUri, "known"]])
})

test("rejects a TextDocumentEdit without explicit controlled snapshot metadata", () => {
  const uri = "file:///known.ets"
  const documents = new Map([[uri, "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      documentChanges: [{
        textDocument: { uri, version: null },
        edits: [],
      }],
    }),
    /missing controlled snapshot version.*file:\/\/\/known\.ets/i,
  )
})

test("atomically rejects a TextDocumentEdit whose version is stale", () => {
  const uri = "file:///known.ets"
  const documents = new Map([[uri, "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      documentChanges: [{
        textDocument: { uri, version: 6 },
        edits: [{
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          newText: "stale",
        }],
      }],
    }, {
      documentVersions: new Map([[uri, 7]]),
    }),
    /version mismatch.*file:\/\/\/known\.ets.*expected 7.*received 6/i,
  )
  assert.deepEqual([...documents], [[uri, "known"]])
})

test("rejects a non-integer open document version", () => {
  const uri = "file:///known.ets"
  const documents = new Map([[uri, "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      documentChanges: [{
        textDocument: { uri, version: 7.5 },
        edits: [],
      }],
    }, {
      documentVersions: new Map([[uri, 7.5]]),
    }),
    /controlled snapshot version.*integer or null.*file:\/\/\/known\.ets/i,
  )
})

test("atomically rejects resource operations in documentChanges", () => {
  const uri = "file:///known.ets"
  const documents = new Map([[uri, "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      documentChanges: [
        {
          textDocument: { uri, version: 1 },
          edits: [{
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
            newText: "changed",
          }],
        },
        { kind: "create", uri: "file:///created.ets" },
      ],
    }, {
      documentVersions: new Map([[uri, 1]]),
    }),
    /resource operations.*not supported.*create/i,
  )
  assert.deepEqual([...documents], [[uri, "known"]])
})

test("atomically rejects overlapping edits in a TextDocumentEdit", () => {
  const uri = "file:///known.ets"
  const documents = new Map([[uri, "abcdef"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      documentChanges: [{
        textDocument: { uri, version: 1 },
        edits: [
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
        ],
      }],
    }, {
      documentVersions: new Map([[uri, 1]]),
    }),
    /overlapping TextEdits/i,
  )
  assert.deepEqual([...documents], [[uri, "abcdef"]])
})

test("atomically rejects an out-of-bounds edit in a TextDocumentEdit", () => {
  const uri = "file:///known.ets"
  const documents = new Map([[uri, "short"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      documentChanges: [{
        textDocument: { uri, version: 1 },
        edits: [{
          range: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 6 },
          },
          newText: "!",
        }],
      }],
    }, {
      documentVersions: new Map([[uri, 1]]),
    }),
    /out of bounds.*line 0, character 6/i,
  )
  assert.deepEqual([...documents], [[uri, "short"]])
})

test("atomically rejects a WorkspaceEdit that mixes changes and documentChanges", () => {
  const documents = new Map([["file:///known.ets", "known"]])

  assert.throws(
    () => applyWorkspaceEdit(documents, {
      changes: {
        "file:///known.ets": [{
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          newText: "changed",
        }],
      },
      documentChanges: [],
    }),
    /cannot combine changes and documentChanges/i,
  )
  assert.deepEqual([...documents], [["file:///known.ets", "known"]])
})
