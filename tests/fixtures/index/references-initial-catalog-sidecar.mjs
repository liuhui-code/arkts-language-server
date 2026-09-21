#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { pathToFileURL } from "node:url"

let root = process.cwd()
let committedGeneration = 0
let buildingGeneration = null
let catalogTimer
let heldStatusTimer
const auditPath = process.env.ARKTS_INDEX_TEST_AUDIT
const input = readline.createInterface({ input: process.stdin })
let catalogScheduled = false

const uri = name => pathToFileURL(path.join(root, name)).href
const status = () => ({
  state: committedGeneration ? "ready" : "warming",
  completeness: committedGeneration ? "ready" : "stale",
  committedGeneration,
  phase: committedGeneration ? "ready" : "discovering",
  buildingGeneration,
  discovered: committedGeneration ? 3 : 0,
  indexed: committedGeneration ? 3 : 0,
  totalFiles: committedGeneration ? 3 : 0,
  rejected: 0,
  policySkipped: 0,
  ignored: 0,
})

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ protocol: 1, id, ok: true, result })}\n`)
}

function progress() {
  process.stdout.write(`${JSON.stringify({
    protocol: 1,
    event: "catalog/progress",
    params: { workspaceIdentity: pathToFileURL(root).href, status: status() },
  })}\n`)
}

function audit(value) {
  if (auditPath) fs.appendFileSync(auditPath, `${JSON.stringify(value)}\n`)
}

function scheduleReady() {
  if (["stalled-catalog", "held-status"].includes(process.env.ARKTS_INDEX_TEST_SCENARIO)) return
  if (committedGeneration || !buildingGeneration || catalogScheduled) return
  catalogScheduled = true
  catalogTimer = setTimeout(() => {
    committedGeneration = 1
    buildingGeneration = null
    audit({ event: "catalog-ready", committedGeneration })
    progress()
  }, 200)
}

input.on("line", line => {
  const request = JSON.parse(line)
  audit(request)
  switch (request.method) {
    case "initialize":
      root = request.params.workspaceRoot
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "delayed-open") {
        setTimeout(() => {
          audit({ event: "open-complete" })
          respond(request.id, { workspaceIdentity: pathToFileURL(root).href, status: status() })
        }, 1_000)
      } else {
        respond(request.id, { workspaceIdentity: pathToFileURL(root).href, status: status() })
      }
      break
    case "catalog/start":
      buildingGeneration = 1
      respond(request.id, { accepted: true, generation: 1, status: status() })
      progress()
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "delayed-open") scheduleReady()
      break
    case "references/candidates": {
      const supported = request.params.declarationUri === uri("Query.ets")
      const ready = committedGeneration === 1
      respond(request.id, {
        supported: ready && supported,
        complete: ready && supported,
        identityComplete: ready && supported,
        identityUris: ready && supported
          ? [uri("Target.ets"), uri("Query.ets"), uri("Use.ets")] : [],
        declarationUri: ready && supported ? uri("Target.ets") : null,
        declarationIdentity: ready && supported ? "target-thing" : null,
        names: ready && supported ? ["Thing"] : [],
        uris: ready && supported
          ? [uri("Target.ets"), uri("Query.ets"), uri("Use.ets")] : [],
        servedGeneration: committedGeneration,
        completeness: ready ? "ready" : "stale",
      })
      scheduleReady()
      break
    }
    case "status": {
      const current = status()
      audit({ event: "status-served", status: current })
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "held-status") {
        audit({ event: "status-held", id: request.id })
        heldStatusTimer = setTimeout(() => respond(request.id, current),
          Number(process.env.ARKTS_INDEX_TEST_STATUS_HOLD_MS ?? 10_000))
      } else {
        respond(request.id, current)
        scheduleReady()
      }
      break
    }
    case "shutdown":
      clearTimeout(catalogTimer)
      clearTimeout(heldStatusTimer)
      respond(request.id, {})
      break
    default:
      process.stdout.write(`${JSON.stringify({
        protocol: 1,
        id: request.id,
        ok: false,
        error: { code: "METHOD_NOT_FOUND", message: "unsupported test method" },
      })}\n`)
  }
})
