#!/usr/bin/env node
import fs from "node:fs"
import readline from "node:readline"
import { pathToFileURL } from "node:url"

let workspaceIdentity
let held = false
const auditPath = process.env.ARKTS_INDEX_TEST_AUDIT
const releasePath = process.env.ARKTS_INDEX_TEST_RELEASE
const status = { state: "ready", committedGeneration: 7 }
const audit = value => fs.appendFileSync(auditPath, `${JSON.stringify(value)}\n`)
const respond = (id, result) => process.stdout.write(
  `${JSON.stringify({ protocol: 1, id, ok: true, result })}\n`,
)

readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line)
  audit(request)
  if (request.method === "initialize") {
    workspaceIdentity = pathToFileURL(request.params.workspaceRoot).href
    respond(request.id, { workspaceIdentity, status })
  } else if (request.method === "status" && !held) {
    held = true
    audit({ event: "status.held" })
    const timer = setInterval(() => {
      if (!fs.existsSync(releasePath)) return
      clearInterval(timer)
      audit({ event: "status.released" })
      respond(request.id, status)
    }, 10)
  } else if (request.method === "status") respond(request.id, status)
  else if (request.method === "class-bindings/resolve") {
    respond(request.id, { workspaceIdentity, servedGeneration: 7,
      completeness: "ready", binding: { kind: "unknown" } })
  } else respond(request.id, {})
})
