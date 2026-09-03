import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  assertLspCapabilityContract,
  CURRENT_LSP_CAPABILITY_CONTRACT,
} from "./support/capability-contract.mjs"
import { LspProcess } from "./support/lsp-process.mjs"

test("production initialize advertises exactly the implemented LSP capability contract", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-capability-contract-"))
  const server = new LspProcess({
    env: { ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs") },
  })
  t.after(async () => {
    await server.close()
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  })

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: null,
      capabilities: {
        general: { positionEncodings: ["utf-8", "utf-16"] },
      },
    },
  })

  const initialized = await server.response(1)
  assertLspCapabilityContract(
    initialized.result.capabilities,
    CURRENT_LSP_CAPABILITY_CONTRACT,
  )
})

test("capability contract failures report one concise difference per path", () => {
  const contract = {
    allowedTopLevel: ["hoverProvider"],
    required: [{ path: "hoverProvider", expected: true }],
    absent: ["renameProvider"],
  }

  assertContractError(
    () => assertLspCapabilityContract(
      { hoverProvider: false, renameProvider: true },
      contract,
    ),
    [
      "LSP capability contract mismatch:",
      "- hoverProvider: expected true, received false",
      "- renameProvider: must be absent, received true",
    ].join("\n"),
  )
})

function assertContractError(action, expectedMessage) {
  try {
    action()
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) return
    throw error
  }
  throw new Error("Expected the capability contract to fail")
}
