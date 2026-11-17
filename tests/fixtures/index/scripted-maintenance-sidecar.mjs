#!/usr/bin/env node
import fs from "node:fs"
import { createInterface } from "node:readline"
import { pathToFileURL } from "node:url"

const scenario = process.env.ARKTS_INDEX_TEST_SCENARIO
const audit = process.env.ARKTS_INDEX_TEST_AUDIT
let identity, input, active, heldRead, heldStart
let qualified = false
let head = 0
let stopGate, fileTask
const epoch = "fixture-reader-epoch"
const domain = "fixture-producer"
const send = value => process.stdout.write(`${JSON.stringify({ protocol: 1, ...value })}\n`)
const result = (id, value, extra = {}) => send({ id, ok: true, result: value, ...extra })
const snapshot = () => ({ workspaceIdentity: identity, factsDomain: domain, storeId: "fixture-store", head })
const q = () => ({ ...snapshot(), qualificationId: `q-${input.revision}`, input,
  scanComplete: true, rejected: 0, fingerprint: "fixture-complete-input" })
const task = () => ({ statusScope: "task", attemptId: active.attemptId, input })
function terminal(outcome = "qualified", published = false) {
  return { event: "maintenance/terminal", attemptId: active.attemptId, input,
    currentInput: outcome === "qualified", phase: outcome === "qualified" ? "completed" : "cancelled",
    outcome, dataPublished: outcome === "qualified" && published, qualification: outcome === "qualified" ? q() : null,
    indexedDocuments: 1, writtenDocuments: published ? 1 : 0, factRowsWritten: published ? 10 : 0, reusedDocuments: published ? 0 : 1, error: null }
}
function ack(request) { result(request.id, { accepted: true, status: task() }) }
function ready() {
  qualified = true
  const published = head === 0
  if (published) head = 1
  const value = terminal("qualified", published)
  if (scenario === "wrong-task") value.attemptId = "foreign-task"
  if (scenario === "wrong-proof") value.qualification.factsDomain = "foreign-producer"
  send(value)
}
// A test-only external gate uses stat polling, not the machine's FSEvents quota.
function waitRelease(action) {
  const release = process.env.ARKTS_INDEX_TEST_RELEASE
  const check = () => {
    if (!fs.existsSync(release)) return
    stopGate?.()
    action()
  }
  fs.watchFile(release, { interval: 5 }, check)
  stopGate = () => fs.unwatchFile(release, check)
  check()
}
function finishFile() {
  const task = fileTask
  if (!task) return
  fileTask = undefined
  head++
  send({ ...task, event: "maintenance/terminal", scope: "file", phase: "completed",
    currentInput: false, outcome: "data-updated", dataPublished: true, qualification: null,
    snapshot: snapshot(), writtenDocuments: 1, factRowsWritten: 10 })
}
const protocol = createInterface({ input: process.stdin })
protocol.on("line", line => {
  const request = JSON.parse(line)
  fs.appendFileSync(audit, `${JSON.stringify(request)}\n`)
  switch (request.method) {
    case "initialize":
      identity = pathToFileURL(request.params.workspaceRoot).href
      if (scenario === "unnegotiated-event") send({ event: "maintenance/progress", attemptId: "unsolicited",
        input: { issuer: "unassigned", revision: 1 }, discovered: 0, indexed: 0, rejected: 0 })
      result(request.id, { workspaceIdentity: identity, capabilities: ["versioned-file-maintenance-v1"],
        factsDomain: domain, readerEpoch: epoch, status: { state: "warming", committedGeneration: 0 } })
      break
    case "maintenance/start":
      if (fileTask) {
        const status = { statusScope: "task", attemptId: fileTask.attemptId, input: fileTask.input,
          activeMaintenanceTasks: 1, pendingUriCount: 0 }
        if (scenario === "file-terminal-before-refusal") finishFile()
        result(request.id, { accepted: false, status })
        break
      }
      input = request.params.input
      active = request.params
      qualified = false
      if (scenario === "hold-start-ack") {
        heldStart = request
        waitRelease(() => { ack(heldStart); heldStart = undefined })
        break
      }
      if (scenario === "terminal-before-ack") { ready(); ack(request); break }
      ack(request)
      if (scenario === "silent" || scenario === "cancel-terminal-before-ack") break
      if (scenario?.startsWith("validation-")) {
        const validation = { stage: "QuickCheck", vmSteps: 1000, activitySequence: 1, stageElapsedMs: 4 }
        if (scenario === "validation-stage") validation.stage = "invented"
        if (scenario === "validation-steps") validation.vmSteps = -1
        if (scenario === "validation-activity") validation.activitySequence = "1"
        if (scenario === "validation-elapsed") validation.stageElapsedMs = null
        send({ event: "maintenance/progress", attemptId: active.attemptId, input,
          discovered: 1, indexed: 1, rejected: 0, validation })
      }
      if (scenario === "reset-counters") {
        for (const indexed of [1, 0, 1]) send({ event: "maintenance/progress", attemptId: active.attemptId,
          input, discovered: 1, indexed, rejected: 0 })
      }
      ready()
      if (heldRead && scenario === "late-read") {
        result(heldRead.request.id, heldRead.value, heldRead.extra)
        heldRead = undefined
      }
      break
    case "maintenance/changes":
      input = request.params.input
      qualified = false
      fileTask = { attemptId: "native-file-controlled", input, uri: request.params.changes[0].uri }
      if (scenario === "hold-change-ack") {
        waitRelease(() => {
          result(request.id, { accepted: true, status: { statusScope: "task", observedInput: request.params.input } })
          finishFile()
        })
      } else {
        result(request.id, { accepted: true, status: { statusScope: "task", observedInput: input } })
        if (scenario !== "file-terminal-before-refusal") waitRelease(finishFile)
      }
      break
    case "maintenance/cancel":
      send(terminal("cancelled"))
      result(request.id, { accepted: true, status: task() })
      break
    case "search":
    case "index/status": {
      const value = { format: "versioned", snapshot: snapshot(), qualification: qualified ? q() : null,
        completeness: qualified ? "ready" : "stale",
        ...(request.method === "search" ? { items: [], servedGeneration: head }
          : { statusScope: "data", state: qualified ? "ready" : "warming", committedGeneration: head }) }
      const extra = { readerEpoch: scenario === "wrong-read-epoch" ? "previous-epoch" : epoch,
        requestToken: request.params.requestToken }
      if (request.method === "search" && (scenario === "held-read" || scenario === "late-read")) {
        heldRead = { request, value, extra }; break
      }
      result(request.id, value, extra)
      break
    }
    case "index/cancel":
      result(request.id, { accepted: !!heldRead })
      if (heldRead) {
        send({ id: heldRead.request.id, ok: false, ...heldRead.extra,
          error: { code: "cancelled", message: "read cancelled" } })
        heldRead = undefined
      }
      break
    case "shutdown": stopGate?.(); result(request.id, {}); protocol.close(); process.stdin.destroy(); break
    default: send({ id: request.id, ok: false, error: { code: "method_not_found", message: request.method } })
  }
})
