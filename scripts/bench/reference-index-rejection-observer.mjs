import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

// Diagnostic-only observer. It never supplies or filters semantic results.
export function startIndexRejectionObserver({ logPath, cacheDir }) {
  let offset = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0
  let pending = Buffer.alloc(0)
  const captures = []
  const poll = () => {
    if (!fs.existsSync(logPath)) return
    const contents = fs.readFileSync(logPath)
    if (contents.length < offset) {
      offset = 0
      pending = Buffer.alloc(0)
    }
    if (contents.length === offset) return
    pending = Buffer.concat([pending, contents.subarray(offset)])
    offset = contents.length
    for (let newline = pending.indexOf(10); newline !== -1; newline = pending.indexOf(10)) {
      const line = pending.subarray(0, newline).toString("utf8")
      pending = pending.subarray(newline + 1)
      let event
      try { event = JSON.parse(line) } catch { continue }
      if (event.event !== "references.index.fallback"
        || event.reason !== "candidate-ineligible") continue
      try {
        const snapshot = readIndexSnapshot(cacheDir, event.targetUri)
        const generationMatches = snapshot.generation === event.servedGeneration
        captures.push({ event, snapshot, generationMatches,
          targetSpanMatches: generationMatches ? snapshot.rows.some(row => (
            row.startLine === event.targetLine && row.endLine === event.targetLine
            && row.startCharacter <= event.targetCharacter
            && event.targetCharacter < row.endCharacter
          )) : null })
      } catch (error) {
        captures.push({ event, snapshotError: error.message,
          generationMatches: null, targetSpanMatches: null })
      }
    }
  }
  const timer = setInterval(poll, 20)
  timer.unref()
  return {
    stop() {
      clearInterval(timer)
      poll()
      return captures
    },
  }
}

function readIndexSnapshot(cacheDir, targetUri) {
  const workspaceDirectory = path.join(cacheDir, "workspaces")
  const databases = fs.readdirSync(workspaceDirectory)
    .map(name => path.join(workspaceDirectory, name, "symbols-v2.sqlite3"))
    .filter(file => fs.existsSync(file))
  if (databases.length !== 1) {
    throw new Error(`expected one private index database, found ${databases.length}`)
  }
  const escapedUri = targetUri.replaceAll("'", "''")
  const sql = `BEGIN; SELECT metadata.committed_generation AS generation,
    exports.document_uri AS documentUri, exports.exported_name AS exportedName,
    exports.start_line AS startLine, exports.start_character AS startCharacter,
    exports.end_line AS endLine, exports.end_character AS endCharacter,
    exports.reference_searchable AS referenceSearchable,
    exports.declaration_identity AS declarationIdentity
    FROM metadata LEFT JOIN exports ON exports.document_uri = '${escapedUri}'
    WHERE metadata.id = 1 ORDER BY exports.start_line, exports.start_character; COMMIT;`
  const output = execFileSync("sqlite3", ["-readonly", "-json", databases[0], sql],
    { encoding: "utf8", timeout: 5_000 })
  const rows = JSON.parse(output)
  if (rows.length === 0) throw new Error("private index metadata is missing")
  return { generation: rows[0].generation,
    rows: rows.filter(row => typeof row.documentUri === "string")
      .map(({ generation, ...row }) => row) }
}
