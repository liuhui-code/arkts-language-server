#!/usr/bin/env node

import path from "node:path"
import fs from "node:fs"
import readline from "node:readline"
import { pathToFileURL } from "node:url"

let workspaceRoot = process.cwd()
let workspaceIdentity = pathToFileURL(workspaceRoot).href
let generation = 0
let committedGeneration = 0
let catalogTimer

const input = readline.createInterface({ input: process.stdin })
input.on("line", (line) => {
  const request = JSON.parse(line)
  audit(request)
  switch (request.method) {
    case "initialize": {
      workspaceRoot = request.params.workspaceRoot
      workspaceIdentity = pathToFileURL(workspaceRoot).href
      respond(request.id, {
        workspaceIdentity,
        status: status("idle", "warming", "stale", null),
      })
      break
    }
    case "catalog/start": {
      generation += 1
      respond(request.id, {
        accepted: true,
        generation,
        status: status("discovering", "warming", "stale", generation),
      })
      progress(status("discovering", "warming", "stale", generation))
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "stalled-catalog") break
      const catalogDelay = process.env.ARKTS_INDEX_TEST_SCENARIO === "slow-catalog"
        || process.env.ARKTS_INDEX_TEST_SCENARIO === "cancel-without-terminal"
        ? 1_000
        : 20
      catalogTimer = setTimeout(() => {
        const fileCount = workspaceRoot.endsWith("workspace-b") ? 2 : 1
        progress({
          ...status("discovering", "warming", "stale", generation),
          discovered: fileCount,
          totalFiles: fileCount,
        })
      progress({
        ...status("ready", "ready", "ready", null),
        committedGeneration: generation,
          discovered: fileCount,
          indexed: fileCount,
        totalFiles: fileCount,
      })
      committedGeneration = generation
        if (process.env.ARKTS_INDEX_TEST_SCENARIO === "exit-after-ready") {
          setTimeout(() => process.exit(17), 20)
        }
      }, catalogDelay)
      break
    }
    case "catalog/cancel": {
      clearTimeout(catalogTimer)
      respond(request.id, {
        cancelled: true,
        generation: request.params.generation,
        status: status("cancelling", "warming", "stale", generation),
      })
      if (process.env.ARKTS_INDEX_TEST_SCENARIO !== "cancel-without-terminal") {
        progress(status("cancelled", "warming", "stale", null))
      }
      break
    }
    case "search": {
      const uri = pathToFileURL(path.join(workspaceRoot, "ProductionIndexedType.ets")).href
      const excluded = request.params.excludedUris?.includes(uri) ?? false
      respond(request.id, {
        items: request.params.query === "ProductionIndexedType" && !excluded ? [{
          name: "ProductionIndexedType",
          kind: "class",
          uri,
          range: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 27 },
          },
        }] : [],
        servedGeneration: generation,
        completeness: "ready",
      })
      break
    }
    case "status":
      respond(request.id, status("ready", "ready", "ready", null))
      break
    case "shutdown":
      clearTimeout(catalogTimer)
      if (process.env.ARKTS_INDEX_TEST_SCENARIO === "delayed-shutdown") {
        setTimeout(() => respond(request.id, {}), 500)
      } else {
        respond(request.id, {})
      }
      break
    default:
      process.stdout.write(`${JSON.stringify({
        protocol: 1,
        id: request.id,
        ok: false,
        error: { code: "METHOD_NOT_FOUND", message: "unsupported scripted method" },
      })}\n`)
  }
})

function status(phase, state, completeness, buildingGeneration) {
  return {
    state,
    completeness,
    committedGeneration,
    phase,
    buildingGeneration,
    discovered: 0,
    indexed: 0,
    rejected: 0,
    policySkipped: 0,
    ignored: 0,
  }
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ protocol: 1, id, ok: true, result })}\n`)
}

function progress(catalogStatus) {
  process.stdout.write(`${JSON.stringify({
    protocol: 1,
    event: "catalog/progress",
    params: { workspaceIdentity, status: catalogStatus },
  })}\n`)
}

function audit(request) {
  const auditPath = process.env.ARKTS_INDEX_TEST_AUDIT
  if (auditPath) fs.appendFileSync(auditPath, `${JSON.stringify(request)}\n`)
}
