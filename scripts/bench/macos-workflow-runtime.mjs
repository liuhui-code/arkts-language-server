import fs from "node:fs"
import path from "node:path"

/** Warm caches append multiple sessions; retain all original bytes, select only the actual PID. */
export function readWorkflowRuntimeLog(cacheDirectory, targetPid) {
  let rawJsonLines = null
  try {
    rawJsonLines = fs.readFileSync(path.join(cacheDirectory, "logs", "server.log"), "utf8")
    const rows = rawJsonLines.trim().split("\n").filter(Boolean).map(JSON.parse)
    if (rows.some(row => !row || row.schema !== 1 || !Number.isSafeInteger(row.pid)
      || row.pid <= 0 || typeof row.event !== "string" || typeof row.ts !== "string")) {
      throw new Error("MACOS_RUNTIME_LOG_INVALID_SCHEMA")
    }
    return { rawJsonLines, events: rows.filter(row => row.pid === targetPid), logError: null }
  } catch (error) {
    return { rawJsonLines, events: [], logError: {
      name: error.name, message: error.message, code: error.code ?? null,
    } }
  }
}
