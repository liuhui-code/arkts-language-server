import {
  CodeActionKind,
  DocumentHighlightKind,
  LSPErrorCodes,
  MarkupKind,
  ResponseError,
  SignatureHelpTriggerKind,
  SymbolKind,
  type ClientCapabilities,
  type Connection,
  type DocumentSymbol,
  type ServerCapabilities,
  type SymbolInformation,
} from "vscode-languageserver/node.js"

/*
 * Keep the protocol conversion in this adapter; semantic contracts remain
 * editor-neutral and the extracted core has no vscode-languageserver import.
 */
import type {
  SemanticDocumentSymbol,
  SemanticDocumentHighlight,
  SemanticDocumentTextEdit,
  SemanticEnginePort,
  SemanticFoldingRange,
  SemanticHover,
  SemanticPrepareRenameOutcome,
  SemanticReferencesOutcome,
  SemanticRenameOutcome,
  SemanticSignatureHelp,
  SemanticSignatureHelpTriggerReason,
} from "../contracts/semantic-engine.js"
import type { SemanticRequestRunner } from "./semantic-request-runner.js"

interface SemanticCapabilityDependencies {
  connection: Connection
  semantic: SemanticEnginePort
  requests: SemanticRequestRunner
}

interface SemanticCapabilityRegistration {
  capabilities: ServerCapabilities
  configure(clientCapabilities: ClientCapabilities): void
}

export function registerSemanticCapabilities({
  connection,
  semantic,
  requests,
}: SemanticCapabilityDependencies): SemanticCapabilityRegistration {
  let hierarchicalDocumentSymbols = false
  let documentSymbolKindValueSet: readonly SymbolKind[] | undefined
  let hoverMarkupKind: MarkupKind = MarkupKind.Markdown
  let lineFoldingOnly = false
  let foldingRangeLimit: number | undefined
  let foldingRangeKinds: ReadonlySet<string> | undefined
  const capabilities: ServerCapabilities = {
    documentHighlightProvider: true,
    documentFormattingProvider: true,
    documentSymbolProvider: true,
    foldingRangeProvider: true,
    hoverProvider: true,
    referencesProvider: true,
    signatureHelpProvider: {
      triggerCharacters: ["(", ",", "<"],
      retriggerCharacters: [")"],
    },
  }

  connection.onSignatureHelp(async (params, token) => {
    return requests.run({
      method: "textDocument/signatureHelp",
      documentUri: params.textDocument.uri,
      token,
      fallback: null as SemanticSignatureHelp | null,
      execute: (document, signal) => semantic.signatureHelp({
        document,
        position: params.position,
        triggerReason: toSemanticSignatureHelpTriggerReason(params.context),
        signal,
      }),
    })
  })

  connection.onHover(async (params, token) => {
    const result = await requests.run({
      method: "textDocument/hover",
      documentUri: params.textDocument.uri,
      token,
      fallback: null as SemanticHover | null,
      execute: (document, signal) => semantic.hover({
        document,
        position: params.position,
        signal,
      }),
    })
    return result ? toLspHover(result, hoverMarkupKind) : null
  })

  connection.onDocumentHighlight(async (params, token) => {
    const result = await requests.run({
      method: "textDocument/documentHighlight",
      documentUri: params.textDocument.uri,
      token,
      fallback: [] as SemanticDocumentHighlight[],
      execute: (document, signal) => semantic.documentHighlights({
        document,
        position: params.position,
        signal,
      }),
    })
    return result.map((highlight) => ({
      range: highlight.range,
      kind: toLspDocumentHighlightKind(highlight.kind),
    }))
  })

  connection.onFoldingRanges(async (params, token) => {
    const result = await requests.run({
      method: "textDocument/foldingRange",
      documentUri: params.textDocument.uri,
      token,
      fallback: [] as SemanticFoldingRange[],
      execute: (document, signal) => semantic.foldingRanges({
        document,
        lineFoldingOnly,
        rangeLimit: foldingRangeLimit,
        signal,
      }),
    })
    return result.map((range) => ({
      startLine: range.startLine,
      startCharacter: range.startCharacter,
      endLine: range.endLine,
      endCharacter: range.endCharacter,
      kind: range.kind && (!foldingRangeKinds || foldingRangeKinds.has(range.kind))
        ? range.kind
        : undefined,
    }))
  })

  connection.onDocumentFormatting(async (params, token) => {
    return requests.run({
      method: "textDocument/formatting",
      documentUri: params.textDocument.uri,
      token,
      fallback: [] as SemanticDocumentTextEdit[],
      execute: (document, signal) => semantic.formatDocument({
        document,
        options: {
          tabSize: params.options.tabSize,
          insertSpaces: params.options.insertSpaces,
          trimTrailingWhitespace: params.options.trimTrailingWhitespace,
        },
        signal,
      }),
    })
  })

  connection.onReferences(async (params, token) => {
    const outcome = await requests.run<SemanticReferencesOutcome | { status: "stale" }>({
      method: "textDocument/references",
      documentUri: params.textDocument.uri,
      token,
      fallback: { status: "stale" },
      scope: "workspace",
      execute: (document, signal) => semantic.references({
        document,
        position: params.position,
        includeDeclaration: params.context.includeDeclaration,
        signal,
      }),
    })
    if (outcome.status === "stale") {
      throw new ResponseError(
        LSPErrorCodes.ContentModified,
        "References request is stale",
      )
    }
    if (outcome.status === "incomplete") {
      throw new ResponseError(
        LSPErrorCodes.RequestFailed,
        "References require a complete workspace snapshot",
      )
    }
    return outcome.references
  })

  connection.onPrepareRename(async (params, token) => {
    const outcome = await requests.run<SemanticPrepareRenameOutcome | { status: "stale" }>({
      method: "textDocument/prepareRename",
      documentUri: params.textDocument.uri,
      token,
      fallback: { status: "stale" },
      scope: "workspace",
      execute: (document, signal) => semantic.prepareRename({
        document,
        position: params.position,
        signal,
      }),
    })
    if (outcome.status === "stale") throw staleRename()
    if (outcome.status !== "ready") throw unavailableRename()
    return { range: outcome.range, placeholder: outcome.placeholder }
  })

  connection.onRenameRequest(async (params, token) => {
    const outcome = await requests.run<SemanticRenameOutcome | { status: "stale" }>({
      method: "textDocument/rename",
      documentUri: params.textDocument.uri,
      token,
      fallback: { status: "stale" },
      scope: "workspace",
      execute: (document, signal) => semantic.rename({
        document,
        position: params.position,
        newName: params.newName,
        signal,
      }),
    })
    if (outcome.status === "stale") throw staleRename()
    if (outcome.status === "invalid-name") {
      throw new ResponseError(
        -32602,
        "Rename requires a valid identifier.",
      )
    }
    if (outcome.status !== "complete") throw unavailableRename()
    return { documentChanges: groupRenameEdits(outcome.edits) }
  })

  connection.onDocumentSymbol(async (params, token) => {
    const result = await requests.run({
      method: "textDocument/documentSymbol",
      documentUri: params.textDocument.uri,
      token,
      fallback: [] as SemanticDocumentSymbol[],
      execute: (document, signal) => semantic.documentSymbols({ document, signal }),
    })
    return hierarchicalDocumentSymbols
      ? result.map((symbol) => toLspDocumentSymbol(symbol, documentSymbolKindValueSet))
      : result.flatMap((symbol) =>
        toLspSymbolInformation(symbol, params.textDocument.uri, documentSymbolKindValueSet))
  })

  return {
    capabilities,
    configure(clientCapabilities) {
      hoverMarkupKind = preferredHoverMarkupKind(clientCapabilities)
      const foldingRange = clientCapabilities.textDocument?.foldingRange
      lineFoldingOnly = foldingRange?.lineFoldingOnly === true
      foldingRangeLimit = foldingRange?.rangeLimit
      foldingRangeKinds = foldingRange?.foldingRangeKind?.valueSet
        ? new Set(foldingRange.foldingRangeKind.valueSet)
        : undefined
      hierarchicalDocumentSymbols = clientCapabilities.textDocument
        ?.documentSymbol?.hierarchicalDocumentSymbolSupport === true
      documentSymbolKindValueSet = clientCapabilities.textDocument?.documentSymbol
        ?.symbolKind?.valueSet
      if (supportsResolvableQuickFixes(clientCapabilities)) {
        capabilities.codeActionProvider = {
          codeActionKinds: [CodeActionKind.QuickFix],
          resolveProvider: true,
        }
      } else {
        delete capabilities.codeActionProvider
      }
      if (supportsTransactionalRename(clientCapabilities)) {
        capabilities.renameProvider = { prepareProvider: true }
      } else {
        delete capabilities.renameProvider
      }
    },
  }
}

function toLspDocumentHighlightKind(
  kind: SemanticDocumentHighlight["kind"],
): DocumentHighlightKind {
  switch (kind) {
    case "write": return DocumentHighlightKind.Write
    case "read": return DocumentHighlightKind.Read
    default: return DocumentHighlightKind.Text
  }
}

function toSemanticSignatureHelpTriggerReason(
  context: unknown,
): SemanticSignatureHelpTriggerReason {
  if (!isRecord(context) || typeof context.isRetrigger !== "boolean") {
    return { kind: "invoked" }
  }
  if (context.triggerKind === SignatureHelpTriggerKind.TriggerCharacter) {
    if (context.isRetrigger) {
      return isSignatureHelpRetriggerCharacter(context.triggerCharacter)
        ? { kind: "retrigger", triggerCharacter: context.triggerCharacter }
        : { kind: "invoked" }
    }
    return isSignatureHelpTriggerCharacter(context.triggerCharacter)
      ? { kind: "characterTyped", triggerCharacter: context.triggerCharacter }
      : { kind: "invoked" }
  }
  return context.triggerKind === SignatureHelpTriggerKind.ContentChange
    && context.isRetrigger
    && context.triggerCharacter === undefined
    ? { kind: "retrigger" }
    : { kind: "invoked" }
}

function isSignatureHelpTriggerCharacter(value: unknown): value is "(" | "," | "<" {
  return value === "(" || value === "," || value === "<"
}

function isSignatureHelpRetriggerCharacter(
  value: unknown,
): value is "(" | "," | "<" | ")" {
  return value === ")" || isSignatureHelpTriggerCharacter(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function preferredHoverMarkupKind(clientCapabilities: ClientCapabilities): MarkupKind {
  const formats = clientCapabilities.textDocument?.hover?.contentFormat
  return formats?.find((format) => (
    format === MarkupKind.Markdown || format === MarkupKind.PlainText
  )) ?? MarkupKind.Markdown
}

function supportsResolvableQuickFixes(clientCapabilities: ClientCapabilities): boolean {
  const codeAction = clientCapabilities.textDocument?.codeAction
  return clientCapabilities.workspace?.workspaceEdit?.documentChanges === true
    && codeAction?.codeActionLiteralSupport?.codeActionKind.valueSet
      .includes(CodeActionKind.QuickFix) === true
    && codeAction.dataSupport === true
    && codeAction.resolveSupport?.properties.includes("edit") === true
}

function supportsTransactionalRename(clientCapabilities: ClientCapabilities): boolean {
  const workspaceEdit = clientCapabilities.workspace?.workspaceEdit
  return workspaceEdit?.documentChanges === true
    && (
      workspaceEdit.failureHandling === "transactional"
      || workspaceEdit.failureHandling === "textOnlyTransactional"
    )
    && clientCapabilities.textDocument?.rename?.prepareSupport === true
}

function toLspDocumentSymbol(
  symbol: SemanticDocumentSymbol,
  symbolKindValueSet: readonly SymbolKind[] | undefined,
): DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: negotiatedSymbolKind(symbol.kind, symbolKindValueSet),
    range: symbol.range,
    selectionRange: symbol.selectionRange,
    children: symbol.children?.map((child) =>
      toLspDocumentSymbol(child, symbolKindValueSet)),
  }
}

function toLspSymbolInformation(
  symbol: SemanticDocumentSymbol,
  uri: string,
  symbolKindValueSet: readonly SymbolKind[] | undefined,
  containerName?: string,
): SymbolInformation[] {
  const current: SymbolInformation = {
    name: symbol.name,
    kind: negotiatedSymbolKind(symbol.kind, symbolKindValueSet),
    location: { uri, range: symbol.range },
    containerName,
  }
  return [
    current,
    ...(symbol.children ?? []).flatMap((child) =>
      toLspSymbolInformation(child, uri, symbolKindValueSet, symbol.name)),
  ]
}

export function negotiatedSymbolKind(
  kind: string,
  valueSet: readonly SymbolKind[] | undefined,
): SymbolKind {
  const preferred = semanticSymbolKind(kind)
  const fallbacks = kind === "struct"
    ? [SymbolKind.Class, SymbolKind.Object, SymbolKind.Variable]
    : kind === "enumMember"
      ? [SymbolKind.Enum, SymbolKind.Constant, SymbolKind.Variable]
      : kind === "type"
        ? [SymbolKind.Variable, SymbolKind.Class, SymbolKind.Object]
        : [SymbolKind.Variable, SymbolKind.Object, SymbolKind.File]
  return firstSupportedSymbolKind([preferred, ...fallbacks], valueSet)
}

function semanticSymbolKind(kind: string): SymbolKind {
  switch (kind) {
    case "struct": return SymbolKind.Struct
    case "class": return SymbolKind.Class
    case "interface": return SymbolKind.Interface
    case "enum": return SymbolKind.Enum
    case "enumMember": return SymbolKind.EnumMember
    case "function": return SymbolKind.Function
    case "method": return SymbolKind.Method
    case "property": return SymbolKind.Property
    case "constructor": return SymbolKind.Constructor
    case "module": return SymbolKind.Module
    case "type": return SymbolKind.TypeParameter
    case "variable": return SymbolKind.Variable
    default: return SymbolKind.Variable
  }
}

function firstSupportedSymbolKind(
  candidates: readonly SymbolKind[],
  valueSet: readonly SymbolKind[] | undefined,
): SymbolKind {
  const supports = (kind: SymbolKind) => valueSet
    ? valueSet.includes(kind)
    : kind >= SymbolKind.File && kind <= SymbolKind.Array
  return candidates.find(supports)
    ?? valueSet?.find((kind) => kind >= SymbolKind.File && kind <= SymbolKind.TypeParameter)
    ?? SymbolKind.File
}

function groupRenameEdits(
  edits: Extract<SemanticRenameOutcome, { status: "complete" }>["edits"],
) {
  const changes: Array<{
    textDocument: { uri: string; version: number | null }
    edits: Array<{ range: (typeof edits)[number]["range"]; newText: string }>
  }> = []
  for (const edit of edits) {
    const current = changes.at(-1)
    if (current?.textDocument.uri === edit.uri) {
      if (current.textDocument.version !== edit.expectedVersion) throw unavailableRename()
      current.edits.push({ range: edit.range, newText: edit.newText })
      continue
    }
    changes.push({
      textDocument: { uri: edit.uri, version: edit.expectedVersion },
      edits: [{ range: edit.range, newText: edit.newText }],
    })
  }
  return changes
}

function staleRename(): ResponseError<void> {
  return new ResponseError(LSPErrorCodes.ContentModified, "Rename request is stale")
}

function unavailableRename(): ResponseError<void> {
  return new ResponseError(
    LSPErrorCodes.RequestFailed,
    "Rename is not available at this position.",
  )
}

function toLspHover(hover: SemanticHover, markupKind: MarkupKind) {
  const sections = [markupKind === MarkupKind.Markdown
    ? `\`\`\`arkts\n${hover.signature}\n\`\`\``
    : hover.signature]
  if (hover.documentation) sections.push(hover.documentation)
  return {
    contents: {
      kind: markupKind,
      value: sections.join("\n\n"),
    },
    range: hover.range,
  }
}
