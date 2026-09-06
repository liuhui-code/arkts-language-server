import assert from "node:assert/strict"
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
      capabilities: supportedClientCapabilities(),
    },
  })

  const initialized = await server.response(1)
  assert.deepEqual(initialized.result.capabilities.codeActionProvider, {
    codeActionKinds: ["quickfix"],
    resolveProvider: true,
  })
  assertLspCapabilityContract(
    initialized.result.capabilities,
    CURRENT_LSP_CAPABILITY_CONTRACT,
  )
})

test("records mature editor providers as required public capabilities", () => {
  const providers = [
    "documentFormattingProvider",
    "documentHighlightProvider",
    "foldingRangeProvider",
    "typeDefinitionProvider",
  ]
  assert.deepEqual(CURRENT_LSP_CAPABILITY_CONTRACT.absent, [])
  for (const provider of providers) {
    assert.equal(
      CURRENT_LSP_CAPABILITY_CONTRACT.allowedTopLevel.includes(provider),
      true,
      `${provider} must be part of the exact public capability surface`,
    )
    assert.deepEqual(
      CURRENT_LSP_CAPABILITY_CONTRACT.required.find(({ path }) => path === provider),
      { path: provider, expected: true },
      `${provider} must remain required once executable evidence exists`,
    )
  }
})

test("omits code actions when any client prerequisite is missing", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-capability-negative-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const cases = [
    ["code-action literal capability object", (capabilities) => {
      delete capabilities.textDocument.codeAction.codeActionLiteralSupport
    }],
    ["literal quickfix", (capabilities) => {
      capabilities.textDocument.codeAction
        .codeActionLiteralSupport.codeActionKind.valueSet = ["refactor"]
    }],
    ["opaque data", (capabilities) => {
      capabilities.textDocument.codeAction.dataSupport = false
    }],
    ["resolve edit", (capabilities) => {
      capabilities.textDocument.codeAction.resolveSupport.properties = ["command"]
    }],
    ["versioned document changes", (capabilities) => {
      capabilities.workspace.workspaceEdit.documentChanges = false
    }],
  ]

  for (const [index, [missing, removeSupport]] of cases.entries()) {
    const capabilities = supportedClientCapabilities()
    removeSupport(capabilities)
    const server = new LspProcess({
      env: { ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, `case-${index}`) },
    })
    try {
      server.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { processId: process.pid, rootUri: null, capabilities },
      })
      const initialized = await server.response(1)
      assert.equal(
        initialized.result.capabilities.codeActionProvider,
        undefined,
        `must not advertise without ${missing} support`,
      )
    } finally {
      await server.close()
    }
  }
})

for (const failureHandling of ["transactional", "textOnlyTransactional"]) {
  test(`advertises prepare rename for ${failureHandling} workspace edits`, async (t) => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-rename-capability-"))
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
    const server = new LspProcess({
      env: { ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs") },
    })
    try {
      server.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          processId: process.pid,
          rootUri: null,
          capabilities: renameCapableClientCapabilities(failureHandling),
        },
      })
      const initialized = await server.response(1)
      assert.deepEqual(
        initialized.result.capabilities.renameProvider,
        { prepareProvider: true },
        failureHandling,
      )
    } finally {
      await server.close()
    }
  })
}

test("omits rename when any client safety prerequisite is missing", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-rename-negative-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const cases = [
    ["versioned document changes", (capabilities) => {
      capabilities.workspace.workspaceEdit.documentChanges = false
    }],
    ["prepare support", (capabilities) => {
      delete capabilities.textDocument.rename
    }],
    ["workspace edit failure handling", (capabilities) => {
      delete capabilities.workspace.workspaceEdit.failureHandling
    }],
    ["transactional failure handling", (capabilities) => {
      capabilities.workspace.workspaceEdit.failureHandling = "abort"
    }],
  ]

  for (const [index, [missing, removeSupport]] of cases.entries()) {
    const capabilities = renameCapableClientCapabilities("transactional")
    removeSupport(capabilities)
    const server = new LspProcess({
      env: { ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, `case-${index}`) },
    })
    try {
      server.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { processId: process.pid, rootUri: null, capabilities },
      })
      const initialized = await server.response(1)
      assert.equal(
        initialized.result.capabilities.renameProvider,
        undefined,
        `must not advertise rename without ${missing}`,
      )
    } finally {
      await server.close()
    }
  }
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

function supportedClientCapabilities() {
  return {
    general: { positionEncodings: ["utf-8", "utf-16"] },
    workspace: {
      workspaceEdit: {
        documentChanges: true,
        failureHandling: "transactional",
      },
    },
    textDocument: {
      codeAction: {
        codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix"] } },
        dataSupport: true,
        resolveSupport: { properties: ["edit"] },
      },
      rename: { prepareSupport: true },
    },
  }
}

function renameCapableClientCapabilities(failureHandling) {
  const capabilities = supportedClientCapabilities()
  capabilities.workspace.workspaceEdit.failureHandling = failureHandling
  capabilities.textDocument.rename = { prepareSupport: true }
  return capabilities
}
