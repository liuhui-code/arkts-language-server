#!/usr/bin/env node

import fs from "node:fs"
import { createInterface } from "node:readline"

const auditPath = process.env.ARKTS_INDEX_TEST_AUDIT
let committedGeneration = 0
let state = "warming"
let searchCount = 0
let exiting = false

audit({ event: "started", pid: process.pid })

const input = createInterface({ input: process.stdin })
input.on("line", (line) => {
  if (exiting) return
  const request = JSON.parse(line)
  audit({ event: "request", request })
  if (request.protocol !== 1) {
    respond(request.id, false, undefined, { code: "protocol_mismatch", message: "protocol must be 1" })
    return
  }

  switch (request.method) {
    case "initialize":
      respond(request.id, true, {
        workspaceIdentity: `file://${request.params.workspaceRoot}`,
        status: status(),
      })
      break
    case "refresh":
      committedGeneration = request.params.generation
      state = "ready"
      respond(request.id, true, { status: status(), rejectedDocuments: [] })
      break
    case "search":
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "event-before-search") {
        process.stdout.write(`${JSON.stringify({
          protocol: 1,
          event: "catalogProgress",
          params: { discovered: 42, indexed: 21 },
        })}\n`)
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "exit-on-search") {
        exiting = true
        process.stderr.write("SECRET_SOURCE_TEXT".repeat(16_384), () => process.exit(17))
        break
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "malformed-response") {
        process.stdout.write("{not-json}\n")
        break
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "protocol-mismatch") {
        process.stdout.write(`${JSON.stringify({ protocol: 2, id: request.id, ok: true, result: {} })}\n`)
        break
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "unknown-response-id") {
        process.stdout.write(`${JSON.stringify({ protocol: 1, id: request.id + 100, ok: true, result: {} })}\n`)
        break
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "blank-protocol-line") {
        process.stdout.write("\n")
      }
      searchCount += 1
      const searchResult = {
        items: [
          {
            name: "FixtureService",
            kind: "class",
            uri: "file:///workspace/FixtureService.ets",
            range: {
              start: { line: 2, character: 1 },
              end: { line: 2, character: 15 },
            },
            containerName: "FixtureModule",
          },
          {
            name: "topLevel",
            kind: "function",
            uri: "file:///workspace/functions.ets",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 8 },
            },
            containerName: null,
          },
        ],
        servedGeneration: committedGeneration,
        completeness: state === "ready" ? "ready" : "stale",
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "delayed-search" && searchCount === 1) {
        setTimeout(() => respond(request.id, true, searchResult), 250)
      } else {
        respond(request.id, true, searchResult)
      }
      break
    case "status":
      respond(request.id, true, status())
      break
    case "shutdown":
      process.stdout.write(`${JSON.stringify(ok(request.id, {}))}\n`, () => process.exit(0))
      break
    default:
      respond(request.id, false, undefined, { code: "method_not_found", message: "unknown method" })
  }
})

function status() {
  return {
    state,
    committedGeneration,
    completeness: state === "ready" ? "ready" : "stale",
    rejectedCount: 0,
  }
}

function ok(id, result) {
  return { protocol: 1, id, ok: true, result }
}

function respond(id, success, result, error) {
  const response = success ? ok(id, result) : { protocol: 1, id, ok: false, error }
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

function audit(entry) {
  if (auditPath) fs.appendFileSync(auditPath, `${JSON.stringify(entry)}\n`)
}
