import fs from "node:fs"
import path from "node:path"

import { resolveLogPath } from "./log-path.js"

const LOG_SCHEMA = 1
const MAX_LOG_BYTES = 5 * 1024 * 1024

type LogField = string | number | boolean | null | undefined

export interface StructuredLogger {
  info(event: string, fields?: Readonly<Record<string, LogField>>): void
  error(event: string, fields?: Readonly<Record<string, LogField>>): void
}

export function createStructuredLogger(logPath = resolveLogPath()): StructuredLogger {
  return new FileStructuredLogger(logPath)
}

class FileStructuredLogger implements StructuredLogger {
  private fileAvailable = false

  constructor(private readonly logPath: string) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true })
      rotateIfNeeded(logPath)
      fs.appendFileSync(logPath, "")
      this.fileAvailable = true
    } catch (error) {
      this.writeStderr("warn", "logging.degraded", {
        outcome: "stderr-only",
        error: errorMessage(error),
      })
    }
  }

  info(event: string, fields: Readonly<Record<string, LogField>> = {}): void {
    this.write("info", event, fields)
  }

  error(event: string, fields: Readonly<Record<string, LogField>> = {}): void {
    this.write("error", event, fields)
  }

  private write(level: string, event: string, fields: Readonly<Record<string, LogField>>): void {
    const entry = logEntry(level, event, fields)
    const line = `${JSON.stringify(entry)}\n`
    process.stderr.write(line)
    if (!this.fileAvailable) return
    try {
      fs.appendFileSync(this.logPath, line)
    } catch (error) {
      this.fileAvailable = false
      this.writeStderr("warn", "logging.degraded", {
        outcome: "stderr-only",
        error: errorMessage(error),
      })
    }
  }

  private writeStderr(level: string, event: string, fields: Readonly<Record<string, LogField>>): void {
    process.stderr.write(`${JSON.stringify(logEntry(level, event, fields))}\n`)
  }
}

function logEntry(level: string, event: string, fields: Readonly<Record<string, LogField>>) {
  return {
    ...withoutUndefined(fields),
    schema: LOG_SCHEMA,
    ts: new Date().toISOString(),
    level,
    event,
    pid: process.pid,
  }
}

function withoutUndefined(fields: Readonly<Record<string, LogField>>): Record<string, Exclude<LogField, undefined>> {
  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, Exclude<LogField, undefined>] => entry[1] !== undefined),
  )
}

function rotateIfNeeded(logPath: string): void {
  let size = 0
  try {
    size = fs.statSync(logPath).size
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  if (size < MAX_LOG_BYTES) return
  const previousPath = `${logPath}.1`
  try {
    fs.rmSync(previousPath, { force: true })
    fs.renameSync(logPath, previousPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
