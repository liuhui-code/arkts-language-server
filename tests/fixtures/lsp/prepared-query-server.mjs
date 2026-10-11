// Boundary fixture: catalog progress is not evidence of semantic readiness.
import fs from "node:fs"

const documents = new Map()
const catalogRequestId = "prepared-query-catalog"
const catalogToken = "prepared-query-catalog-progress"
const mode = process.env.ARKTS_TEST_PREPARED_MODE
let pending = Buffer.alloc(0)
let referenceRequests = 0
let completionSequence = 0
const completionItems = new Map()
const versions = new Map()
const preparedCallItems = new Map()
let rootUri

process.stdin.on("data", chunk => {
  pending = Buffer.concat([pending, chunk])
  while (true) {
    const headerEnd = pending.indexOf("\r\n\r\n")
    if (headerEnd < 0) return
    const header = pending.subarray(0, headerEnd).toString("ascii")
    const match = /^Content-Length:\s*(\d+)$/mi.exec(header)
    if (!match) process.exit(2)
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + Number(match[1])
    if (pending.length < bodyEnd) return
    const message = JSON.parse(pending.subarray(bodyStart, bodyEnd).toString("utf8"))
    pending = pending.subarray(bodyEnd)
    receive(message)
  }
})

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }))
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}

function diagnose(uri, version) {
  if (mode === "no-diagnostics") return
  if (["edit-reference-superseded-diagnostic", "late-v2-diagnostics"].includes(mode) && version === 1) return
  send({ method: "textDocument/publishDiagnostics", params: {
    uri, version, diagnostics: [],
  } })
}

function offsetAt(text, position) {
  const lines = text.split("\n")
  let offset = 0
  for (let line = 0; line < position.line; line++) offset += lines[line].length + 1
  return offset + position.character
}

function receive(message) {
  if (message.method === "initialize") {
    rootUri = message.params.rootUri
    send({ id: message.id, result: { capabilities: {
      textDocumentSync: 2,
      referencesProvider: true,
      definitionProvider: true,
      typeDefinitionProvider: true,
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: ["(", ","] },
      completionProvider: { resolveProvider: true },
      implementationProvider: true,
      ...(mode === "fake-ready" ? { experimental: { fakeSemanticReady: true } } : {}),
    } } })
  } else if (message.method === "initialized") {
    send({ id: catalogRequestId, method: "window/workDoneProgress/create", params: {
      token: catalogToken,
    } })
  } else if (message.id === catalogRequestId && !message.method && !message.error) {
    send({ method: "$/progress", params: { token: catalogToken, value: {
      kind: "begin", title: "ArkTS workspace index",
    } } })
    send({ method: "$/progress", params: { token: catalogToken, value: {
      kind: "end", message: "ready",
    } } })
  } else if (message.method === "arkts/semanticReadiness" && mode === "missing-ready-proof") {
    send({ id: message.id, result: { rootUri, semanticState: "ready", semanticGeneration: "ready",
      readyCapabilities: [], unavailableReasons: [], unavailableInput: null, inputIdentity: null, coverage: null } })
  } else if (message.method === "arkts/semanticReadiness" && mode === "reported-readiness") {
    const reported = message.params.prepare === false
      ? process.env.ARKTS_TEST_PREPARED_READINESS_VALIDATION ?? process.env.ARKTS_TEST_PREPARED_READINESS
      : process.env.ARKTS_TEST_PREPARED_READINESS
    send({ id: message.id, result: JSON.parse(reported) })
  } else if (message.method === "textDocument/didOpen") {
    const { uri, version, text } = message.params.textDocument
    documents.set(uri, text)
    versions.set(uri, version)
    diagnose(uri, version)
  } else if (message.method === "textDocument/didChange") {
    const { uri, version } = message.params.textDocument
    let text = documents.get(uri) ?? ""
    for (const change of message.params.contentChanges) {
      text = change.range
        ? text.slice(0, offsetAt(text, change.range.start)) + change.text
          + text.slice(offsetAt(text, change.range.end))
        : change.text
    }
    documents.set(uri, text)
    versions.set(uri, version)
    diagnose(uri, version)
  } else if (message.method === "textDocument/prepareRename") {
    send({ id: message.id, result: { placeholder: "Thing", range: thingRange() } })
  } else if (message.method === "textDocument/rename") {
    const uri = message.params.textDocument.uri
    send({ id: message.id, result: { documentChanges: [{ textDocument: { uri,
      version: mode === "wrong-rename-version" ? versions.get(uri) + 1 : versions.get(uri) },
      edits: [{ range: thingRange(), newText: message.params.newName }] }] } })
  } else if (message.method === "textDocument/prepareCallHierarchy") {
    const uri = message.params.textDocument.uri
    const item = { name: "Thing", kind: 12, tags: [1], detail: "public Thing 😀", uri,
      range: thingRange(), selectionRange: thingRange(), data: { arktsCallHierarchy: { protocol: 1, rootUri } } }
    preparedCallItems.set(uri, item)
    send({ id: message.id, result: [item] })
  } else if (["callHierarchy/outgoingCalls", "callHierarchy/incomingCalls"].includes(message.method)) {
    const item = preparedCallItems.get(message.params.item.uri)
    if (JSON.stringify(item) !== JSON.stringify(message.params.item)) {
      send({ id: message.id, error: { code: -32602, message: "Not the genuine prepared item" } })
    } else send({ id: message.id, result: [{ [message.method.endsWith("outgoingCalls") ? "to" : "from"]: item,
      fromRanges: [thingRange()] }] })
  } else if (["textDocument/references", "textDocument/definition", "textDocument/typeDefinition",
    "textDocument/implementation"].includes(message.method)) {
    if (message.method === "textDocument/references") {
      referenceRequests++
      if (mode === "timeout" && referenceRequests === 1) return
      if (mode === "break-edit-oracle" && referenceRequests === 11) {
        fs.writeFileSync(process.env.ARKTS_TEST_PREPARED_ORACLE, "{")
      }
    }
    const uri = message.params.textDocument.uri
    const lines = (documents.get(uri) ?? "").split(/\r?\n/u)
    const firstLine = lines[0]
    const locations = [{ uri, range: {
      start: { line: 0, character: mode === "wrong-range" ? 1 : 0 },
      end: { line: 0, character: firstLine.length },
    } }]
    if (["edit-reference", "edit-reference-superseded-diagnostic"].includes(mode)
      && message.method === "textDocument/references" && lines[1] === "Thing") {
      locations.push({ uri, range: {
        start: { line: 1, character: 0 }, end: { line: 1, character: 5 },
      } })
    }
    if (mode === "late-v2-diagnostics" && message.method === "textDocument/references"
      && referenceRequests === 1) {
      setTimeout(() => send({ id: message.id, result: locations }), 450)
    } else {
      send({ id: message.id, result: locations })
    }
  } else if (message.method === "textDocument/completion") {
    const item = {
      label: "Thing", labelDetails: { detail: "()", description: "./Thing" },
      kind: 7, detail: "class Thing", filterText: "Thing", sortText: "01", insertText: "Thing",
      insertTextFormat: 1, commitCharacters: [".", ","], documentation: { kind: "markdown", value: "item docs 😀" },
      textEdit: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "Thing" },
      data: { arktsCompletionId: `00000000-0000-4000-8000-${String(++completionSequence).padStart(12, "0")}` },
    }
    if (mode === "invalid-completion-handle") item.data.arktsCompletionId = "not-a-uuid"
    if (mode === "semantic-completion-data") item.data.origin = "unrecognized semantic metadata"
    completionItems.set(item.data.arktsCompletionId, item)
    send({ id: message.id, result: { isIncomplete: true, items: [item] } })
  } else if (message.method === "completionItem/resolve") {
    const item = completionItems.get(message.params.data?.arktsCompletionId)
    if (!item) send({ id: message.id, error: { code: -32602, message: "Unknown completion handle" } })
    else send({ id: message.id, result: { ...item, detail: "resolved class Thing",
      data: mode === "wrong-resolve-handle" ? { arktsCompletionId: "deadbeef-0000-4000-8000-000000000000" } : item.data,
      documentation: { kind: "markdown", value: "resolved docs 😀" },
      additionalTextEdits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        newText: 'import { Thing } from "./Thing";\n' }] } })
  } else if (message.method === "textDocument/signatureHelp") {
    send({ id: message.id, result: { signatures: [{ label: "call(count: number, label: string): string",
      documentation: { kind: "markdown", value: "signature docs 😀" },
      parameters: [{ label: [5, 18], documentation: "count docs" }, { label: "label: string" }] }],
    activeSignature: 0, activeParameter: 1 } })
  } else if (message.method === "textDocument/hover") {
    send({ id: message.id, result: { contents: { kind: "markdown", value: "```arkts\nconst Thing: string\n```" },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } } })
  } else if (message.method === "shutdown") {
    send({ id: message.id, result: null })
  } else if (message.method === "exit") {
    process.exit(0)
  } else if (message.method && message.id !== undefined) {
    send({ id: message.id, error: { code: -32601, message: "Method not found" } })
  }
}

function thingRange() {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
}
