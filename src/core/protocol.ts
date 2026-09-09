export interface SemanticDocumentPosition {
  path: string
  line: number
  column: number
  content?: string
  contentGeneration?: number
  documentVersion?: number
  workspaceRoot?: string
  allowSnippets?: boolean
  completionDiscovery?: SemanticCompletionDiscovery
}

export interface SemanticCompletionDiscoveryCandidate {
  exportedName: string
  kind: string
  uri: string
  ordinal: number
  declarationIdentity?: string
  importSpecifier?: string
  moduleId?: string
  targetScope?: string
}

export interface SemanticCompletionDiscovery {
  candidates: readonly SemanticCompletionDiscoveryCandidate[]
  incomplete: boolean
}

export interface SemanticReplayDocument {
  path: string
  content: string
  contentGeneration: number
  documentVersion?: number
}

export interface SemanticDocumentSync {
  path: string
  content: string
  documentVersion: number
  workspaceRoot?: string
}

export interface SemanticResponseState {
  path: string
  contentGeneration: number
  documentVersion?: number
  dependencyGeneration: number
  documentCacheHit: boolean
  dependencyClosureCacheHit: boolean
  queryCacheHit: boolean
  loadedDocumentCount: number
  syntaxReady: boolean
  typeStatus?: "ready" | "partial" | "unsupported"
  typeEngine?: string
  typeEngineVersion?: string
  typeGeneration?: number
}

export interface SemanticLatencySummary {
  count: number
  p50Us: number
  p95Us: number
  maxUs: number
}

export interface SemanticRuntimeState {
  rssBytes: number
  heapUsedBytes: number
  heapTotalBytes: number
  externalBytes: number
  uptimeMs: number
  providerLatencies: Record<string, SemanticLatencySummary>
}

export const SEMANTIC_PROTOCOL_VERSION = 6

export type SemanticRequestMethod =
  | "health"
  | "restoreDocuments"
  | "didOpen"
  | "didChange"
  | "didClose"
  | "prepareDocument"
  | "gotoDefinition"
  | "findUsages"
  | "diagnostics"
  | "completion"
  | "resolveCompletion"
  | "signatureHelp"
  | "listCodeActions"
  | "resolveCodeAction"
  | "prepareRename"
  | "rename"

export interface SemanticRequest {
  id: string
  method: SemanticRequestMethod
  position?: SemanticDocumentPosition
  action?: SemanticCodeActionRequest
  completion?: SemanticCompletionItem
  newName?: string
  documents?: SemanticReplayDocument[]
  document?: SemanticDocumentSync
  documentPath?: string
}

export interface SemanticCompletionItem {
  label: string
  detail: string
  kind: string
  insertText?: string
  filterText?: string
  sortText?: string
  source?: "workspace" | "arkts" | "arkui" | "sdk" | "type" | "fallback"
  documentation?: string
  replacementRange?: SemanticTextRange
  commitCharacters?: string[]
  isSnippet?: true
  definitionTarget?: SemanticDefinitionTarget
  additionalTextEdits?: SemanticCompletionTextEdit[]
  data?: Record<string, unknown>
}

export interface SemanticCompletionItemList {
  items: SemanticCompletionItem[]
  isIncomplete: boolean
}

export interface SemanticCompletionTextEdit {
  path: string
  range: SemanticTextRange
  newText: string
  expectedVersion?: number
}

export interface SemanticSignatureParameter {
  label: string
  documentation?: string
}

export interface SemanticSignature {
  label: string
  documentation?: string
  parameters: SemanticSignatureParameter[]
}

export interface SemanticSignatureHelp {
  signatures: SemanticSignature[]
  activeSignature: number
  activeParameter: number
}

export interface SemanticHoverInfo {
  signature: string
  documentation?: string
  range: SemanticTextRange
}

export type SemanticDocumentHighlightKind = "text" | "read" | "write"

export interface SemanticDocumentHighlight {
  range: SemanticTextRange
  kind: SemanticDocumentHighlightKind
}

export interface SemanticInlayHint {
  position: { line: number; column: number }
  label: string
  kind: "type" | "parameter"
  paddingLeft?: boolean
  paddingRight?: boolean
}

export type SemanticCallHierarchyItemKind =
  | "file"
  | "module"
  | "struct"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "property"
  | "constructor"
  | "variable"
  | "constant"

export interface SemanticCallHierarchyItemInfo {
  path: string
  name: string
  kind: SemanticCallHierarchyItemKind
  sourceFingerprint?: string
  detail?: string
  range: SemanticTextRange
  selectionRange: SemanticTextRange
}

export interface SemanticCallHierarchyOutgoingCallInfo {
  to: SemanticCallHierarchyItemInfo
  fromRanges: SemanticTextRange[]
}

export interface SemanticCallHierarchyIncomingCallInfo {
  from: SemanticCallHierarchyItemInfo
  fromRanges: SemanticTextRange[]
}

export type SemanticCallHierarchyFailureReason =
  | "project-membership-incomplete"
  | "source-outside-workspace"
  | "source-unavailable"
  | "source-unmappable"
  | "result-limit-exceeded"

export type SemanticCallHierarchyPrepareQueryResult =
  | { status: "complete"; items: SemanticCallHierarchyItemInfo[] }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }

export type SemanticCallHierarchyOutgoingQueryResult =
  | { status: "complete"; calls: SemanticCallHierarchyOutgoingCallInfo[] }
  | { status: "stale-item" }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }

export type SemanticCallHierarchyIncomingQueryResult =
  | { status: "complete"; calls: SemanticCallHierarchyIncomingCallInfo[] }
  | { status: "stale-item" }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }

export type SemanticDocumentSymbolKind =
  | "struct"
  | "class"
  | "interface"
  | "enum"
  | "enumMember"
  | "function"
  | "method"
  | "property"
  | "constructor"
  | "module"
  | "type"
  | "variable"

export interface SemanticDocumentSymbolInfo {
  name: string
  detail?: string
  kind: SemanticDocumentSymbolKind
  range: SemanticTextRange
  selectionRange: SemanticTextRange
  children?: SemanticDocumentSymbolInfo[]
}

export interface SemanticDefinitionTarget {
  path: string
  line: number
  column: number
}

export interface SemanticTextRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface SemanticDefinitionCandidate {
  path: string
  range: SemanticTextRange
}

export interface SemanticUsageResult extends SemanticDefinitionTarget {
  preview: string
  kind: "semantic"
  confidence: "exact"
}

export interface SemanticDiagnostic {
  source: "language"
  severity: "error" | "warning"
  code: number | string
  path: string
  range: SemanticTextRange
  message: string
}

export interface SemanticNumericDiagnostic extends SemanticDiagnostic {
  code: number
}

export type SemanticCodeActionKind =
  | "quickfix"
  | "refactor.extract"
  | "refactor.inline"
  | "refactor.rewrite"
  | "source"
  | "generate"
  | "template"

export type SemanticCodeActionSafety = "safe" | "needsPreview" | "risky"

export interface SemanticCodeAction {
  id: string
  title: string
  kind: SemanticCodeActionKind
  provider: "arkts" | "workspace" | "template" | "fallback"
  safety: SemanticCodeActionSafety
  disabledReason?: string
  editId?: string
  data?: Record<string, unknown>
}

export interface SemanticCodeActionRequest {
  id: string
  data?: Record<string, unknown>
}

export interface SemanticCodeActionList {
  actions: SemanticCodeAction[]
}

export interface SemanticEditConflict {
  path: string
  message: string
}

export type SemanticWorkspaceEditOperation =
  | {
      kind: "text"
      path: string
      range: SemanticTextRange
      newText: string
      expectedVersion?: number
      expectedContentVersion?: string
    }
  | { kind: "createFile"; path: string; content: string; overwrite: boolean }
  | { kind: "renameFile"; oldPath: string; newPath: string; overwrite: boolean }
  | { kind: "deleteFile"; path: string; recursive: boolean }

export interface SemanticWorkspaceEditPlan {
  id: string
  title: string
  operations: SemanticWorkspaceEditOperation[]
  conflicts: SemanticEditConflict[]
  affectedFiles: string[]
  undoLabel: string
  requiresPreview: boolean
}

export interface SemanticPrepareRenameResult {
  range: SemanticTextRange
  placeholder: string
}

export interface SemanticUnsupportedResult {
  status: "unsupported"
  reason: string
}

export type SemanticResponsePayload =
  | { status: "ready"; protocolVersion: number; capabilities: string[] }
  | { status: "ready"; path: string; documentVersion: number; contentGeneration: number }
  | { status: "ready"; path: string; contentGeneration: number; typeStatus: string; typeGeneration?: number }
  | { status: "closed"; path: string }
  | { restoredDocumentCount: number }
  | SemanticDefinitionTarget
  | SemanticUsageResult[]
  | SemanticDiagnostic[]
  | { definition: SemanticDefinitionTarget | null; definitionCandidates?: SemanticDefinitionCandidate[] }
  | SemanticCompletionItem[]
  | SemanticCompletionItem
  | SemanticSignatureHelp
  | SemanticCodeActionList
  | SemanticWorkspaceEditPlan
  | SemanticPrepareRenameResult
  | SemanticUnsupportedResult
  | null

export interface SemanticResponse {
  id: string
  ok: boolean
  payload: SemanticResponsePayload
  state?: SemanticResponseState
  runtime?: SemanticRuntimeState
  error?: string
}
