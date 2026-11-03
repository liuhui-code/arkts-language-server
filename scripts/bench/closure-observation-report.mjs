import fs from "node:fs"
import { createHash } from "node:crypto"

export function snapshotClosureArtifacts(paths) {
  return Object.fromEntries(Object.entries(paths).map(([name, file]) =>
    [name + "Sha256", createHash("sha256").update(fs.readFileSync(file)).digest("hex")]))
}
export function closureArtifactsUnchanged(paths, before) {
  try {
    const after = snapshotClosureArtifacts(paths)
    return Object.keys(before).length === Object.keys(after).length
      && Object.entries(before).every(([name, hash]) => after[name] === hash)
  } catch { return false }
}

/** Consume receipts only. Unreturned compiler calls remain interrupted, never synthetic returns. */
export function readClosureObservation(trace) {
  let marker
  try {
    if (fs.existsSync(trace + ".status")) {
      const stat = fs.statSync(trace + ".status")
      if (!stat.isFile() || stat.size > 1024) throw Error("invalid-status-marker")
      const value = JSON.parse(fs.readFileSync(trace + ".status", "utf8"))
      if (!value || Array.isArray(value) || Object.keys(value).sort().join(",") !== "reason,status"
        || value.status !== "unavailable" || !["sink-error", "observer-error", "event-capacity"].includes(value.reason)) {
        throw Error("invalid-status-marker")
      }
      marker = { status: value.status, reason: value.reason }
    }
  }
  catch { marker = { status: "incomplete", reason: "invalid-status-marker" } }
  if (!fs.existsSync(trace)) return { status: "unavailable", reason: "missing-trace", events: [], ...marker }
  const events = [], workers = new Set(), commands = new Set(), programs = new Map()
  const commandIds = new Set(), programIds = new Set()
  let invalid
  const allowed = new Set(["observer-ready", "prepare", "owner-create", "command-start", "command-return",
    "program-start", "program-return", "program-throw", "phase-return", "phase-throw"])
  try {
    const stat = fs.statSync(trace)
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw Error("unreadable-or-oversize-trace")
    for (const line of fs.readFileSync(trace, "utf8").split("\n").filter(Boolean)) {
      if (events.length >= 16384) { invalid = "reader-event-capacity"; break }
      let event
      try { event = JSON.parse(line) } catch { invalid = "malformed-json"; break }
      if (event?.schema !== 1 || !allowed.has(event.kind) || !Number.isSafeInteger(event.pid)
        || !Number.isSafeInteger(event.threadId)) { invalid = "invalid-event"; break }
      events.push(event)
      const worker = `${event.pid}:${event.threadId}`
      if (event.kind === "observer-ready") {
        if (workers.has(worker)) invalid = "duplicate-observer-ready"
        workers.add(worker); continue
      }
      if (!workers.has(worker)) invalid = "missing-observer-ready"
      if (event.kind.startsWith("command-")) {
        const key = `${worker}:${event.epoch}:${event.commandId}`
        if (!Number.isSafeInteger(event.epoch) || !Number.isSafeInteger(event.commandId)) invalid = "invalid-command-identity"
        if (event.kind === "command-start") {
          if (commandIds.has(key)) invalid = "duplicate-command-start"
          commandIds.add(key); commands.add(key)
        } else if (!commands.delete(key)) invalid = "unmatched-command-terminal"
      }
      if (event.kind.startsWith("program-")) {
        const key = `${worker}:${event.buildId}`, command = `${worker}:${event.epoch}:${event.commandId}`
        if (!commands.has(command)) invalid = "program-outside-command"
        if (!Number.isSafeInteger(event.buildId)) invalid = "invalid-build-identity"
        if (event.kind === "program-start") {
          if (programIds.has(key)) invalid = "duplicate-program-start"
          programIds.add(key); programs.set(key, command)
        } else {
          if (!programs.has(key)) invalid = "unmatched-program-terminal"
          else if (programs.get(key) !== command) invalid = "mismatched-program-command"
          programs.delete(key)
        }
      }
    }
  } catch { invalid = "unreadable-trace" }
  if (!workers.size) invalid ??= "missing-observer-ready"
  if (!commandIds.size) invalid ??= "missing-command-receipt"
  const reason = invalid ?? (commands.size || programs.size ? "unterminated-calls" : undefined)
  return { status: invalid ? "incomplete" : reason ? "interrupted" : "complete", ...(reason ? { reason } : {}),
    ...marker, openPrograms: programs.size, openCommands: commands.size, events }
}

/** Fresh-process lifecycle tokens differ; all other public response and terminal fields stay comparable. */
export function comparableClosureVariant(variant) {
  const normalized = value => Array.isArray(value) ? value.map(normalized)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "semanticGeneration").map(([key, item]) => [key, normalized(item)])) : value
  return normalized({ preparation: variant.preparation, status: variant.status,
    definitions: variant.definitions.map(result => result.payload), failure: variant.failure ?? null, closed: variant.closed })
}


/** Equal failures are parity evidence, never successful acceptance. */
export function closureBaselineStatus(report) {
  if (!report.inputUnchanged || !report.artifactsUnchanged || report.payloadParity === false) return "INVALID"
  if (report.variants.some(v => v.mode === "on" && v.observation.status !== "complete")) return "INCOMPLETE_OBSERVATION"
  const healthy = variant => !variant.failure && variant.definitions?.length === 2
    && variant.definitions.every(result => result.exact) && ["ready", "degraded"].includes(variant.preparation?.semanticState)
    && !variant.status?.error && ["ready", "degraded"].includes(variant.status?.result?.semanticState)
    && !variant.closed?.error && !variant.closed?.shutdown?.error && variant.closed?.shutdown?.result === null
    && variant.closed?.exit?.code === 0 && variant.closed?.exit?.signal === null
  return report.variants.length > 0 && report.variants.every(healthy) ? "PASS" : "OBSERVED_FAILURE"
}
