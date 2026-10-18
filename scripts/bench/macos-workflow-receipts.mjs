import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

import { checkPreparedLocations, checkPreparedPayload } from "./prepared-query-report.mjs"

/** Retain each actual attempt before awaiting the public framed response. */
export function createWorkflowReceiver(session, input, receipts) {
  return async (method, params, timeoutMs = 30_000) => {
    const receipt = { method, params,
      documentVersion: session.documentVersions.get(params.textDocument?.uri) ?? null,
      request: { jsonrpc: "2.0", id: session.nextRequestId, method, params }, timeoutMs, status: "PENDING" }
    receipts.push(receipt)
    const startedAt = performance.now()
    let response
    try {
      response = await session.request(method, params, { timeoutMs })
      receipt.response = response
      receipt.status = response.error ? "ERROR" : "RECEIVED"
    } catch (error) {
      receipt.status = error.message.startsWith("Timed out waiting for LSP response ") ? "TIMEOUT" : "FAILED"
      receipt.failure = { name: error.name, message: error.message, code: error.code ?? null }
      throw error
    } finally { receipt.elapsedMs = performance.now() - startedAt }
    if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`)
    const kind = method.replace("textDocument/", "")
    if (input.oracle && ["definition", "references"].includes(kind)) {
      const result = kind === "definition" && !Array.isArray(response.result)
        ? response.result ? [response.result] : [] : response.result
      receipt.correctness = checkPreparedLocations(result, input.oracle[kind], input.workspace,
        new Map([[pathToFileURL(input.entryPath).href, input.source]]))
      if (!receipt.correctness.equal) throw new Error(`WORKFLOW_ORACLE_MISMATCH=${kind}`)
    }
    if (input.oracle?.completion && kind === "completion") {
      const snapshot = input.oracle.completion.snapshots.find(item => item.query.documentVersion === receipt.documentVersion)
      receipt.correctness = checkPreparedPayload(response.result, { kind: "completion", result: snapshot?.result })
      if (!snapshot || !isDeepStrictEqual(params, {
        textDocument: { uri: pathToFileURL(input.entryPath).href },
        position: snapshot.query.position, context: snapshot.query.context,
      })) {
        receipt.correctness.equal = false
        receipt.correctness.invalid.push("completion request differs from the bound snapshot")
      }
      receipt.correctness.sourceSha256 = snapshot?.sourceSha256 ?? null
      receipt.correctness.documentVersion = receipt.documentVersion
      if (!receipt.correctness.equal) throw new Error("WORKFLOW_ORACLE_MISMATCH=completion")
    }
    return response
  }
}

/** Observe the original transport sends; SENT is not a server acknowledgement. */
export function recordWorkflowModuleVisit(session, document, visits) {
  const visit = { status: "PENDING", startedMonotonicMs: performance.now() }
  visits.push(visit)
  const send = session.transport.send
  try {
    session.transport.send = function (message) {
      const result = send.call(this, message)
      if (message.method === "textDocument/didOpen") visit.open = structuredClone(message)
      if (message.method === "textDocument/didClose") visit.close = structuredClone(message)
      return result
    }
    session.openDocument(document)
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: document.uri } } })
    visit.status = "SENT"
  } catch (error) {
    visit.status = "FAILED"
    visit.error = { name: error.name, message: error.message, code: error.code ?? null }
    throw error
  } finally {
    session.transport.send = send
    visit.completedMonotonicMs = performance.now()
  }
}
