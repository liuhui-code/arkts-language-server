#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { pathToFileURL } from "node:url"

let root = process.cwd()
let candidatesServed = false
let held = false
const auditPath = process.env.ARKTS_INDEX_TEST_AUDIT
const releasePath = process.env.ARKTS_INDEX_TEST_RELEASE
const sdkSourceProof = process.env.ARKTS_INDEX_TEST_SDK_SOURCE_PROOF === "1"
const projectSourceProof = process.env.ARKTS_INDEX_TEST_PROJECT_SOURCE_PROOF === "1"
const targetPath = projectSourceProof ? "module/src/tablet/Target.ets" : "Target.ets"
const queryPath = projectSourceProof ? "module/src/main/ets/Query.ets" : "Query.ets"
const usePath = projectSourceProof ? "module/src/main/ets/Use.ets"
  : process.env.ARKTS_INDEX_TEST_USE_PATH ?? "Use.ets"
const status = () => ({ state: "ready", completeness: "ready", committedGeneration: 1,
  phase: "ready", buildingGeneration: null, discovered: 3, indexed: 3, totalFiles: 3,
  rejected: 0, policySkipped: 0, ignored: 0 })
const uri = name => pathToFileURL(path.join(root, name)).href
const audit = value => fs.appendFileSync(auditPath, `${JSON.stringify(value)}\n`)
const respond = (id, result) => process.stdout.write(
  `${JSON.stringify({ protocol: 1, id, ok: true, result })}\n`,
)

readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line)
  audit(request)
  switch (request.method) {
    case "initialize":
      root = request.params.workspaceRoot
      respond(request.id, { workspaceIdentity: pathToFileURL(root).href, status: status() })
      break
    case "catalog/start":
      respond(request.id, { accepted: true, generation: 1, status: status() })
      process.stdout.write(`${JSON.stringify({ protocol: 1, event: "catalog/progress",
        params: { workspaceIdentity: pathToFileURL(root).href, status: status() } })}\n`)
      break
    case "references/candidates": {
      const terminal = sdkSourceProof && request.params.sourceResolutions?.find(value => (
        value.bindingUri === uri(queryPath) && value.sourceSpecifier === "@ohos.example"
        && /^sdk:[0-9a-f]{64}$/.test(value.externalTerminalIdentity ?? "")
      ))
      const projectResolution = projectSourceProof && request.params.sourceResolutions?.find(value => (
        value.bindingUri === uri(queryPath) && value.sourceSpecifier === "snapshot/Target"
        && value.resolvedSourceUri === uri(targetPath) && value.externalTerminalIdentity === undefined
      ))
      const supported = !candidatesServed || Boolean(terminal || projectResolution)
      candidatesServed = true
      const uris = [uri(targetPath), uri(queryPath), uri(usePath)]
      const identityComplete = supported && (!(sdkSourceProof || projectSourceProof)
        || Boolean(terminal || projectResolution))
      respond(request.id, { supported, complete: supported, identityComplete,
        identityUris: identityComplete ? uris : [], declarationUri: supported ? uri(targetPath) : null,
        declarationIdentity: supported ? "target-thing" : null, names: supported ? ["Thing"] : [],
        uris: supported ? uris : [], servedGeneration: 1, completeness: "ready",
        ...(sdkSourceProof ? { bindings: [{ kind: "import", uri: uri(queryPath),
          importedName: "Thing", localName: "SdkThing", sourceSpecifier: "@ohos.example",
          sourceResolution: terminal ? "external" : "unsupported",
          ...(terminal ? { externalTerminalIdentity: terminal.externalTerminalIdentity } : {}),
        }] } : {}),
        ...(projectSourceProof ? { bindings: [{ kind: "import", uri: uri(queryPath),
          importedName: "Thing", localName: "Thing", sourceSpecifier: "snapshot/Target",
          sourceResolution: projectResolution ? "unique" : "unsupported",
          ...(projectResolution ? { resolvedSourceUri: uri(targetPath) } : {}),
        }] } : {}),
      })
      break
    }
    case "status":
      if (candidatesServed && !held) {
        held = true
        audit({ event: "status.held" })
        const timer = setInterval(() => {
          if (!fs.existsSync(releasePath)) return
          clearInterval(timer)
          audit({ event: "status.released" })
          respond(request.id, status())
        }, 10)
      } else respond(request.id, status())
      break
    case "exports/search":
      respond(request.id, { items: [{ exportedName: "Thing", kind: "type", uri: uri(targetPath),
        range: { start: { line: 0, character: 12 }, end: { line: 0, character: 17 } },
        ordinal: 0, declarationIdentity: "target-thing" }],
        servedGeneration: 1, completeness: "ready" })
      break
    case "shutdown":
      respond(request.id, {})
      break
    default:
      process.stdout.write(`${JSON.stringify({ protocol: 1, id: request.id, ok: false,
        error: { code: "method_not_found", message: "unsupported fixture method" } })}\n`)
  }
})
