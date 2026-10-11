import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { completeLogEvents } from "./complete-log-events.mjs"

export async function navigation(session, uri) {
  const position = { line: 1, character: 28 }
  const definition = await session.request("textDocument/definition",
    { textDocument: { uri }, position }, { timeoutMs: 20_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  const references = await session.request("textDocument/references", {
    textDocument: { uri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  assert.equal(references.error, undefined, JSON.stringify(references.error))
  return {
    definition: definition.result,
    references: references.result.toSorted((a, b) => a.range.start.line - b.range.start.line),
  }
}

export function location(uri, source, line, symbol) {
  const character = source.split("\n")[line].indexOf(symbol)
  assert.ok(character >= 0)
  return { uri, range: {
    start: { line, character }, end: { line, character: character + symbol.length },
  } }
}

export function diagnostic(session, uri, version) {
  return session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 20_000)
}

export async function waitForEvent(logs, predicate, afterEntry = 0) {
  const file = path.join(logs, "server.log")
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const entries = completeLogEvents(file)
      const entry = entries.slice(afterEntry).find(predicate)
      if (entry) return entry
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail("timed out waiting for semantic lifecycle event")
}
