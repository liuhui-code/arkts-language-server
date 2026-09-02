#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { pathToFileURL } from "node:url"

const auditPath = process.env.ARKTS_INDEX_TEST_AUDIT
let committedGeneration = 0
let state = "warming"
let searchCount = 0
let exiting = false
let workspaceRoot = process.cwd()
let workspaceIdentity = pathToFileURL(workspaceRoot).href

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
      workspaceRoot = request.params.workspaceRoot
      workspaceIdentity = pathToFileURL(workspaceRoot).href
      respond(request.id, true, {
        workspaceIdentity: process.env.ARKTS_INDEX_TEST_SCENARIO === "wrong-workspace-identity"
          ? pathToFileURL(path.dirname(workspaceRoot)).href
          : workspaceIdentity,
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
          event: "catalog/progress",
          params: {
            workspaceIdentity,
            status: {
              ...status(),
              phase: "activating",
              buildingGeneration: 1,
              discovered: 42,
              indexed: 21,
              rejected: 0,
              policySkipped: 0,
              ignored: 0,
              totalFiles: 42,
            },
          },
        })}\n`)
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "unknown-event") {
        process.stdout.write(`${JSON.stringify({
          protocol: 1,
          event: "catalog/unknown",
          params: {},
        })}\n`)
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "exit-on-search") {
        exiting = true
        process.stderr.write("SECRET_SOURCE_TEXT".repeat(16_384), () => process.exit(17))
        break
      }
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "request-error-on-search") {
        respond(request.id, false, undefined, { code: "busy", message: "index is busy" })
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
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "never-answer-search") break
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "invalid-search-result") {
        respond(request.id, true, {
          items: "not-an-array",
          servedGeneration: committedGeneration,
          completeness: "ready",
        })
        break
      }
      searchCount += 1
      const fixtureServiceUri = process.env.ARKTS_INDEX_TEST_SCENARIO === "outside-root-result"
        ? pathToFileURL(path.join(path.dirname(workspaceRoot), "Outside.ets")).href
        : pathToFileURL(path.join(workspaceRoot, "FixtureService.ets")).href
      const searchResult = {
        items: [
          {
            name: "FixtureService",
            kind: "class",
            uri: fixtureServiceUri,
            range: {
              start: { line: 2, character: 1 },
              end: { line: 2, character: 15 },
            },
            containerName: "FixtureModule",
          },
          {
            name: "topLevel",
            kind: "function",
            uri: pathToFileURL(path.join(workspaceRoot, "functions.ets")).href,
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

process.on("SIGTERM", () => {
  audit({ event: "terminated", signal: "SIGTERM" })
  process.exit(0)
})
