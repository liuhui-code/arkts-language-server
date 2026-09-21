#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { pathToFileURL } from "node:url"

let root = process.cwd()
let warming = false
const auditPath = process.env.ARKTS_INDEX_TEST_AUDIT
const input = readline.createInterface({ input: process.stdin })

const status = () => ({
  state: warming ? "warming" : "ready",
  completeness: warming ? "stale" : "ready",
  committedGeneration: 1,
  phase: warming ? "discovering" : "ready",
  buildingGeneration: warming ? 2 : null,
  discovered: 3,
  indexed: 3,
  totalFiles: 3,
  rejected: 0,
  policySkipped: 0,
  ignored: 0,
})

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ protocol: 1, id, ok: true, result })}\n`)
}

input.on("line", line => {
  const request = JSON.parse(line)
  if (auditPath) fs.appendFileSync(auditPath, `${JSON.stringify(request)}\n`)
  switch (request.method) {
    case "initialize":
      root = request.params.workspaceRoot
      respond(request.id, {
        workspaceIdentity: pathToFileURL(root).href,
        status: status(),
      })
      break
    case "catalog/start":
      respond(request.id, { accepted: true, generation: 1, status: status() })
      process.stdout.write(`${JSON.stringify({
        protocol: 1,
        event: "catalog/progress",
        params: { workspaceIdentity: pathToFileURL(root).href, status: status() },
      })}\n`)
      break
    case "references/candidates": {
      const uri = name => pathToFileURL(path.join(root, name)).href
      const anchor = process.env.ARKTS_INDEX_TEST_ANCHOR === "definition"
        ? "Target.ets" : "Query.ets"
      const supported = request.params.declarationUri === uri(anchor)
      respond(request.id, {
        supported,
        complete: supported,
        identityComplete: supported,
        identityUris: supported ? [uri("Target.ets"), uri("Query.ets")] : [],
        declarationUri: supported ? uri("Target.ets") : null,
        declarationIdentity: supported ? "target-thing" : null,
        names: supported ? ["Thing"] : [],
        uris: supported ? [uri("Target.ets"), uri("Query.ets")] : [],
        servedGeneration: 1,
        completeness: "ready",
      })
      if (supported) warming = true
      break
    }
    case "status":
      respond(request.id, status())
      break
    case "shutdown":
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
