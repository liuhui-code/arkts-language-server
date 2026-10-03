import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { startIndexRejectionObserver } from "../scripts/bench/reference-index-rejection-observer.mjs"

const sqliteAvailable = spawnSync("sqlite3", ["-version"], { stdio: "ignore" }).status === 0

test("index rejection observer captures the committed row or reports missing SQLite", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-observer-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const cacheDir = path.join(root, "cache")
  const databaseDir = path.join(cacheDir, "workspaces", "one")
  fs.mkdirSync(databaseDir, { recursive: true })
  const database = path.join(databaseDir, "symbols-v2.sqlite3")
  const targetUri = "file:///private/tmp/Settings/common/HomeInitData.ets"
  if (sqliteAvailable) execFileSync("sqlite3", [database, `
    CREATE TABLE metadata(id INTEGER PRIMARY KEY, committed_generation INTEGER);
    INSERT INTO metadata VALUES (1, 7);
    CREATE TABLE exports(document_uri TEXT, exported_name TEXT, start_line INTEGER,
      start_character INTEGER, end_line INTEGER, end_character INTEGER,
      reference_searchable INTEGER, declaration_identity TEXT);
    INSERT INTO exports VALUES ('${targetUri}', 'HomeInitData', 16, 13, 16, 25, 1, 'target');
  `])
  else fs.writeFileSync(database, "")
  const logPath = path.join(root, "server.log")
  fs.writeFileSync(logPath, "")
  const observer = startIndexRejectionObserver({ logPath, cacheDir })
  fs.appendFileSync(logPath, `${JSON.stringify({
    event: "references.index.fallback", reason: "candidate-ineligible",
    targetUri, targetLine: 17, targetCharacter: 13,
    completeness: "ready", servedGeneration: 7,
  })}\n`)
  const captures = observer.stop()
  assert.equal(captures.length, 1)
  if (!sqliteAvailable) {
    assert.match(captures[0].snapshotError, /sqlite3|ENOENT/u)
    assert.equal(captures[0].targetSpanMatches, null)
    return
  }
  assert.equal(captures[0].snapshot.generation, 7)
  assert.equal(captures[0].generationMatches, true)
  assert.equal(captures[0].snapshot.rows[0].startLine, 16)
  assert.equal(captures[0].targetSpanMatches, false)
})

test("index rejection observer does not classify an unmatched generation", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-observer-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const cacheDir = path.join(root, "cache")
  const databaseDir = path.join(cacheDir, "workspaces", "one")
  fs.mkdirSync(databaseDir, { recursive: true })
  const database = path.join(databaseDir, "symbols-v2.sqlite3")
  if (sqliteAvailable) execFileSync("sqlite3", [database, `
    CREATE TABLE metadata(id INTEGER PRIMARY KEY, committed_generation INTEGER);
    INSERT INTO metadata VALUES (1, 8);
    CREATE TABLE exports(document_uri TEXT, exported_name TEXT, start_line INTEGER,
      start_character INTEGER, end_line INTEGER, end_character INTEGER,
      reference_searchable INTEGER, declaration_identity TEXT);
  `])
  else fs.writeFileSync(database, "")
  const logPath = path.join(root, "server.log")
  fs.writeFileSync(logPath, "")
  const observer = startIndexRejectionObserver({ logPath, cacheDir })
  fs.appendFileSync(logPath, `${JSON.stringify({
    event: "references.index.fallback", reason: "candidate-ineligible",
    targetUri: "file:///private/tmp/Settings/common/HomeInitData.ets",
    targetLine: 17, targetCharacter: 13, servedGeneration: 7,
  })}\n`)
  const captures = observer.stop()
  assert.equal(captures.length, 1)
  if (!sqliteAvailable) {
    assert.match(captures[0].snapshotError, /sqlite3|ENOENT/u)
    assert.equal(captures[0].generationMatches, null)
    return
  }
  assert.equal(captures[0].snapshot.generation, 8)
  assert.equal(captures[0].generationMatches, false)
  assert.equal(captures[0].targetSpanMatches, null)
})
