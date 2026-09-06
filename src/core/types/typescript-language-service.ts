import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

import { discoverHarmonySdk } from "../sdk/discovery.js"
import type {
  SemanticCallHierarchyItemInfo,
  SemanticCallHierarchyFailureReason,
  SemanticCallHierarchyIncomingCallInfo,
  SemanticCallHierarchyIncomingQueryResult,
  SemanticCallHierarchyItemKind,
  SemanticCallHierarchyOutgoingCallInfo,
  SemanticCallHierarchyOutgoingQueryResult,
  SemanticCallHierarchyPrepareQueryResult,
  SemanticCompletionItem,
  SemanticCompletionItemList,
  SemanticCompletionTextEdit,
  SemanticDefinitionCandidate,
  SemanticDiagnostic,
  SemanticDocumentHighlight,
  SemanticDocumentHighlightKind,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
  SemanticDocumentSymbolKind,
  SemanticHoverInfo,
  SemanticInlayHint,
  SemanticSignatureHelp,
  SemanticTextRange,
  SemanticUsageResult,
} from "../protocol.js"
import { resolveHarmonySdkModule } from "../sdk/module-resolver.js"
import { createArktsVirtualDocument, type ArktsVirtualDocument } from "../virtual/arkts-virtual-document.js"
import type {
  ProjectMembershipSnapshot,
  SemanticWorkspaceView,
} from "../workspace/document-store.js"
import { CooperativeWork } from "./cooperative-work.js"
import type {
  SemanticCodeFixCandidate,
  SemanticPrepareRenameQueryResult,
  SemanticResolvedCodeFix,
  SemanticReferenceQueryResult,
  SemanticRenameQueryResult,
  SemanticSignatureHelpTriggerReason,
  SemanticTypeEngineState,
} from "./type-engine.js"
import {
  mapTypescriptDiagnosticGroups,
  mapTypescriptDiagnostics,
  typescriptTypeDetail,
  typescriptTypeStatus,
} from "./typescript-language-helpers.js"
import { lineColumnToOffset, offsetToLineColumn, spanToRange } from "./text-position.js"

const MAX_SCRIPTS = 512
const MAX_SCRIPT_BYTES = 16 * 1024 * 1024
const MAX_LAZY_SNAPSHOTS = 128
const MAX_LAZY_SNAPSHOT_BYTES = 8 * 1024 * 1024
const MAX_COMPLETIONS = 128
const MAX_CALL_HIERARCHY_PREPARE_ITEMS = 16
const MAX_CALL_HIERARCHY_EDGES = 256
const MAX_CALL_HIERARCHY_RANGES_PER_EDGE = 64
const MAX_CALL_HIERARCHY_TOTAL_RANGES = 2_048
const MAX_SOURCE_FILE_BYTES = 4 * 1_024 * 1_024
const MIN_MODULE_EXPORT_PREFIX_LENGTH = 2
const ENGINE_VERSION = `typescript-${ts.version}-arkts-v2`

interface ScriptRecord {
  path: string
  content: string
  sourceContent: string
  virtualDocument: ArktsVirtualDocument
  version: number
  documentVersion?: number
  overlay: boolean
  sourceFingerprint: string
  bytes: number
  lastAccess: number
}

interface LazySnapshotRecord {
  path: string
  content: string
  virtualDocument: ArktsVirtualDocument
  snapshot: ts.IScriptSnapshot
  sourceFingerprint: string
  bytes: number
}

const COMPLETION_PREFIX_MATCH = 0
const COMPLETION_CAMEL_MATCH = 1
const COMPLETION_SUBSEQUENCE_MATCH = 2

type CompletionMatchQuality =
  | typeof COMPLETION_PREFIX_MATCH
  | typeof COMPLETION_CAMEL_MATCH
  | typeof COMPLETION_SUBSEQUENCE_MATCH

interface CompletionCandidate {
  entry: ts.CompletionEntry
  filterText: string | undefined
  providerIndex: number
}

interface SafeCodeFix extends SemanticCodeFixCandidate {
  edits: Array<{
    path: string
    range: SemanticTextRange
    newText: string
  }>
}

type RenameConflictPreflight =
  | "not-applicable"
  | "clear"
  | "conflict"
  | "indeterminate"

export interface TypeScriptLanguageServiceEngineOptions {
  checkpoint?: () => void
  hostCancellationToken?: ts.HostCancellationToken
  readSourceFile?: (filePath: string) => string | null
  lazySnapshotLimits?: {
    maxFiles?: number
    maxBytes?: number
  }
}

export class TypeScriptLanguageServiceEngine {
  private readonly scripts = new Map<string, ScriptRecord>()
  private readonly projectMembershipPaths = new Set<string>()
  private readonly projectContentVersions = new Map<string, number>()
  private readonly lazySnapshots = new Map<string, LazySnapshotRecord>()
  private readonly sdkDeclarationPaths: string[]
  private membershipFileNames: string[]
  private combinedFileNames: string[] | undefined
  private readonly options: ts.CompilerOptions
  private readonly service: ts.LanguageService
  private readonly checkpoint: (() => void) | undefined
  private readonly readSourceFile: (filePath: string) => string | null
  private readonly maxLazySnapshots: number
  private readonly maxLazySnapshotBytes: number
  private accessClock = 0
  private generation = 0
  private scriptBytes = 0
  private lazySnapshotBytes = 0
  private projectMembershipStatus: ProjectMembershipSnapshot["status"] | "none" = "none"
  private projectMembershipReason: ProjectMembershipSnapshot["reason"]
  private projectMembershipRevision = 0
  private projectContentRevision = 0

  constructor(
    private readonly rootPath: string,
    {
      checkpoint,
      hostCancellationToken,
      readSourceFile = safeRead,
      lazySnapshotLimits = {},
    }: TypeScriptLanguageServiceEngineOptions = {},
  ) {
    this.checkpoint = checkpoint
    this.readSourceFile = readSourceFile
    this.maxLazySnapshots = cacheLimit(
      lazySnapshotLimits.maxFiles,
      MAX_LAZY_SNAPSHOTS,
      "lazy snapshot files",
    )
    this.maxLazySnapshotBytes = cacheLimit(
      lazySnapshotLimits.maxBytes,
      MAX_LAZY_SNAPSHOT_BYTES,
      "lazy snapshot bytes",
    )
    this.options = {
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      experimentalDecorators: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    }
    this.sdkDeclarationPaths = discoverSdkAmbientDeclarations()
    this.membershipFileNames = [...this.sdkDeclarationPaths]
    this.service = ts.createLanguageService(
      this.createHost(hostCancellationToken),
      ts.createDocumentRegistry(),
    )
  }

  prepare(workspace: SemanticWorkspaceView): SemanticTypeEngineState {
    const protectedPaths = new Set<string>()
    this.updateProjectMembership(workspace.projectMembership)
    this.updateProjectContent(workspace.contentRevision, workspace.changedPaths)
    this.removeProjectFiles(workspace.removedPaths)
    for (const document of workspace.documents) {
      const filePath = path.resolve(document.path)
      protectedPaths.add(filePath)
      this.updateScript(
        filePath,
        document.content,
        document.documentVersion,
        document.overlay,
      )
    }
    this.evict(protectedPaths)
    return {
      status: workspace.state.syntaxReady ? typescriptTypeStatus(workspace.state.path) : "unsupported",
      engine: "typescript-language-service",
      version: ENGINE_VERSION,
      generation: this.generation,
    }
  }

  cacheState() {
    return {
      projectMembership: {
        status: this.projectMembershipStatus,
        ...(this.projectMembershipReason ? { reason: this.projectMembershipReason } : {}),
        revision: this.projectMembershipRevision,
        paths: this.projectMembershipPaths.size,
      },
      residentScripts: {
        files: this.scripts.size,
        bytes: this.scriptBytes,
        maxFiles: MAX_SCRIPTS,
        maxBytes: MAX_SCRIPT_BYTES,
      },
      lazySnapshots: {
        files: this.lazySnapshots.size,
        bytes: this.lazySnapshotBytes,
        maxFiles: this.maxLazySnapshots,
        maxBytes: this.maxLazySnapshotBytes,
      },
    }
  }

  scriptFileNames(): string[] {
    if (this.combinedFileNames) return this.combinedFileNames
    const extras = [...this.scripts.keys()].filter((filePath) => (
      !this.projectMembershipPaths.has(filePath)
      && !this.sdkDeclarationPaths.includes(filePath)
    ))
    if (extras.length === 0) return this.membershipFileNames
    this.combinedFileNames = [...extras, ...this.membershipFileNames]
    return this.combinedFileNames
  }

  complete(position: SemanticDocumentPosition): SemanticCompletionItemList {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) {
      return work.finish({ items: [], isIncomplete: false })
    }
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const prefix = completionPrefix(script.sourceContent, sourceOffset)
    const memberAccess = script.sourceContent.slice(0, sourceOffset - prefix.length).endsWith(".")
    work.boundary()
    const info = this.service.getCompletionsAtPosition(filePath, offset, {
      includeCompletionsForImportStatements: true,
      includeCompletionsForModuleExports:
        !memberAccess && hasMinimumCodePointLength(prefix, MIN_MODULE_EXPORT_PREFIX_LENGTH),
      includeCompletionsWithInsertText: true,
    })
    work.boundary()
    if (!info) return work.finish({ items: [], isIncomplete: false })
    const normalizedPrefix = prefix.toLowerCase()
    const defaultReplacementRange = info.optionalReplacementSpan
      ? script.virtualDocument.generatedSpanToSourceRange(
          info.optionalReplacementSpan.start,
          info.optionalReplacementSpan.length,
        )
      : prefix.length > 0
        ? spanToRange(script.sourceContent, sourceOffset - prefix.length, prefix.length)
        : undefined
    const candidates: CompletionCandidate[] = []
    let tierBuckets: [CompletionCandidate[], CompletionCandidate[], CompletionCandidate[]] = [
      [],
      [],
      [],
    ]
    let tierMatchCount = 0
    let tierSortText = ""
    let hasTier = false
    let matchingOverflow = false
    let truncated = false
    let scannedEntries = 0
    let stoppedEarly = false
    const flushTier = (): void => {
      const remaining = MAX_COMPLETIONS - candidates.length
      const chosen: CompletionCandidate[] = []
      for (const bucket of tierBuckets) {
        const available = remaining - chosen.length
        if (available <= 0) break
        chosen.push(...bucket.slice(0, available))
      }
      if (tierMatchCount > chosen.length) matchingOverflow = true
      chosen.sort(work.comparator((left, right) => left.providerIndex - right.providerIndex))
      candidates.push(...chosen)
      tierBuckets = [[], [], []]
      tierMatchCount = 0
    }
    for (let providerIndex = 0; providerIndex < info.entries.length; providerIndex += 1) {
      const entry = info.entries[providerIndex]
      scannedEntries += 1
      if (!hasTier) {
        tierSortText = entry.sortText
        hasTier = true
      } else if (entry.sortText !== tierSortText) {
        flushTier()
        if (candidates.length >= MAX_COMPLETIONS) {
          truncated = true
          stoppedEarly = true
          break
        }
        tierSortText = entry.sortText
      }
      const filterText = entry.filterText
      const quality = completionMatchQuality(filterText ?? entry.name, normalizedPrefix)
      if (quality !== undefined) {
        tierMatchCount += 1
        const bucket = tierBuckets[quality]
        const remaining = MAX_COMPLETIONS - candidates.length
        if (bucket.length < remaining) {
          bucket.push({ entry, filterText, providerIndex })
        }
      }
      work.item()
      if (
        quality === COMPLETION_PREFIX_MATCH
        && tierBuckets[COMPLETION_PREFIX_MATCH].length >= MAX_COMPLETIONS - candidates.length
      ) {
        flushTier()
        truncated = scannedEntries < info.entries.length
        stoppedEarly = true
        break
      }
    }
    if (!stoppedEarly && hasTier) flushTier()
    const objectLiteralPropertyCompletion = candidates.some(({ entry }) => (
      entry.kind === ts.ScriptElementKind.memberVariableElement
    )) && isObjectLiteralPropertyCompletion(this.service, filePath, offset, work)
    const completions: SemanticCompletionItem[] = candidates.map(({ entry, filterText }) => {
      const completion: SemanticCompletionItem = {
        label: entry.name,
        detail: typescriptTypeDetail(entry, filePath),
        kind: completionKind(entry.kind, objectLiteralPropertyCompletion),
        insertText: entry.insertText,
        filterText,
        sortText: entry.sortText,
        source: "type",
        replacementRange: entry.replacementSpan
          ? script.virtualDocument.generatedSpanToSourceRange(
              entry.replacementSpan.start,
              entry.replacementSpan.length,
            )
          : defaultReplacementRange,
        data: {
          provider: "typescript",
          engineVersion: ENGINE_VERSION,
          documentVersion: position.documentVersion,
          entryName: entry.name,
          entrySource: entry.source,
          entryData: entry.data,
        },
      }
      work.item()
      return completion
    })
    return work.finish({
      items: completions,
      isIncomplete: info.isIncomplete === true || truncated || matchingOverflow,
    })
  }

  resolveCompletion(
    position: SemanticDocumentPosition,
    item: SemanticCompletionItem,
  ): SemanticCompletionItem {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    const data = item.data
    if (!script || data?.provider !== "typescript" || data.engineVersion !== ENGINE_VERSION) {
      return work.finish(item)
    }
    const entryName = typeof data.entryName === "string" ? data.entryName : item.label
    const entrySource = typeof data.entrySource === "string" ? data.entrySource : undefined
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    work.boundary()
    const details = this.service.getCompletionEntryDetails(
      filePath,
      offset,
      entryName,
      {},
      entrySource,
      { includeCompletionsForModuleExports: true },
      data.entryData as ts.CompletionEntryData | undefined,
    )
    work.boundary()
    if (!details) return work.finish(item)
    const detail = completionDisplayPartsText(details.displayParts ?? [], work) || item.detail
    const documentation = completionOptionalDisplayParts(
      details.documentation ?? [],
      work,
    ) ?? item.documentation
    return work.finish({
      ...item,
      detail,
      documentation,
      additionalTextEdits: this.mapCompletionEdits(
        filePath,
        position.documentVersion,
        details,
        work,
      ),
      data: { ...data, resolved: true },
    })
  }

  define(position: SemanticDocumentPosition): SemanticDefinitionCandidate[] {
    const work = new CooperativeWork(this.checkpoint)
    return this.definitionCandidates(
      position,
      (filePath, offset) => this.service.getDefinitionAtPosition(filePath, offset),
      work,
    )
  }

  typeDefinitions(position: SemanticDocumentPosition): SemanticDefinitionCandidate[] {
    const work = new CooperativeWork(this.checkpoint)
    return this.definitionCandidates(
      position,
      (filePath, offset) => this.service.getTypeDefinitionAtPosition(filePath, offset),
      work,
    )
  }

  implementations(position: SemanticDocumentPosition): SemanticDefinitionCandidate[] {
    const work = new CooperativeWork(this.checkpoint)
    return this.definitionCandidates(
      position,
      (filePath, offset) => this.nonDeclarationImplementations(filePath, offset, work),
      work,
    )
  }

  prepareCallHierarchy(
    position: SemanticDocumentPosition,
  ): SemanticCallHierarchyPrepareQueryResult {
    const prepared = this.prepareCallHierarchyAt(position)
    if (prepared.status !== "complete") return prepared
    return prepared
  }

  outgoingCalls(
    position: SemanticDocumentPosition,
    item: SemanticCallHierarchyItemInfo,
  ): SemanticCallHierarchyOutgoingQueryResult {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return { status: "incomplete", reason: "source-unavailable" }
    const prepared = this.prepareCallHierarchyAt(position)
    if (prepared.status !== "complete") return prepared
    if (!prepared.items.some((candidate) => sameCallHierarchyItem(candidate, item))) {
      return { status: "stale-item" }
    }

    const sourceOffset = exactSourceOffset(
      script.sourceContent,
      position.line,
      position.column,
    )
    if (sourceOffset === undefined) return { status: "stale-item" }
    const generatedOffset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    if (script.virtualDocument.toSourceOffset(generatedOffset) !== sourceOffset) {
      return { status: "incomplete", reason: "source-unmappable" }
    }

    const calls = this.service.provideCallHierarchyOutgoingCalls(filePath, generatedOffset)
    if (calls.length > MAX_CALL_HIERARCHY_EDGES) {
      return { status: "incomplete", reason: "result-limit-exceeded" }
    }
    const grouped = new Map<string, SemanticCallHierarchyOutgoingCallInfo>()
    let totalRanges = 0
    let rawRanges = 0
    for (const call of calls) {
      rawRanges += call.fromSpans.length
      if (
        call.fromSpans.length > MAX_CALL_HIERARCHY_RANGES_PER_EDGE
        || rawRanges > MAX_CALL_HIERARCHY_TOTAL_RANGES
      ) return { status: "incomplete", reason: "result-limit-exceeded" }
      const mappedTarget = this.mapCallHierarchyItem(call.to)
      if (mappedTarget.status === "incomplete") return mappedTarget
      const target = mappedTarget.item
      const targetKey = callHierarchyItemKey(target)
      let edge = grouped.get(targetKey)
      if (!edge) {
        if (grouped.size >= MAX_CALL_HIERARCHY_EDGES) {
          return { status: "incomplete", reason: "result-limit-exceeded" }
        }
        edge = { to: target, fromRanges: [] }
        grouped.set(targetKey, edge)
      }
      const seenRanges = new Set(edge.fromRanges.map(semanticRangeKey))
      for (const span of call.fromSpans) {
        const range = exactSourceRange(script, span)
        if (!range) return { status: "incomplete", reason: "source-unmappable" }
        const rangeKey = semanticRangeKey(range)
        if (seenRanges.has(rangeKey)) continue
        if (
          edge.fromRanges.length >= MAX_CALL_HIERARCHY_RANGES_PER_EDGE
          || totalRanges >= MAX_CALL_HIERARCHY_TOTAL_RANGES
        ) return { status: "incomplete", reason: "result-limit-exceeded" }
        seenRanges.add(rangeKey)
        edge.fromRanges.push(range)
        totalRanges += 1
      }
      edge.fromRanges.sort(compareSemanticRanges)
    }

    const normalized = [...grouped.values()].sort((left, right) => (
      compareCallHierarchyItems(left.to, right.to)
    ))
    return { status: "complete", calls: normalized }
  }

  incomingCalls(
    position: SemanticDocumentPosition,
    item: SemanticCallHierarchyItemInfo,
  ): SemanticCallHierarchyIncomingQueryResult {
    if (this.projectMembershipStatus !== "complete") {
      return { status: "incomplete", reason: "project-membership-incomplete" }
    }
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return { status: "incomplete", reason: "source-unavailable" }
    const prepared = this.prepareCallHierarchyAt(position)
    if (prepared.status !== "complete") return prepared
    if (!prepared.items.some((candidate) => sameCallHierarchyItem(candidate, item))) {
      return { status: "stale-item" }
    }

    const sourceOffset = exactSourceOffset(
      script.sourceContent,
      position.line,
      position.column,
    )
    if (sourceOffset === undefined) return { status: "stale-item" }
    const generatedOffset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    if (script.virtualDocument.toSourceOffset(generatedOffset) !== sourceOffset) {
      return { status: "incomplete", reason: "source-unmappable" }
    }

    const calls = this.service.provideCallHierarchyIncomingCalls(filePath, generatedOffset)
    if (calls.length > MAX_CALL_HIERARCHY_EDGES) {
      return { status: "incomplete", reason: "result-limit-exceeded" }
    }
    const grouped = new Map<string, SemanticCallHierarchyIncomingCallInfo>()
    let totalRanges = 0
    let rawRanges = 0
    for (const call of calls) {
      rawRanges += call.fromSpans.length
      if (
        call.fromSpans.length > MAX_CALL_HIERARCHY_RANGES_PER_EDGE
        || rawRanges > MAX_CALL_HIERARCHY_TOTAL_RANGES
      ) return { status: "incomplete", reason: "result-limit-exceeded" }
      const mappedCaller = this.mapCallHierarchyItem(call.from)
      if (mappedCaller.status === "incomplete") return mappedCaller
      const caller = mappedCaller.item
      const callerView = this.callHierarchySourceView(path.resolve(call.from.file))
      if (callerView.status === "incomplete") return callerView
      const callerKey = callHierarchyItemKey(caller)
      let edge = grouped.get(callerKey)
      if (!edge) {
        if (grouped.size >= MAX_CALL_HIERARCHY_EDGES) {
          return { status: "incomplete", reason: "result-limit-exceeded" }
        }
        edge = { from: caller, fromRanges: [] }
        grouped.set(callerKey, edge)
      }
      const seenRanges = new Set(edge.fromRanges.map(semanticRangeKey))
      for (const span of call.fromSpans) {
        const range = exactSourceRange(callerView.view, span)
        if (!range) return { status: "incomplete", reason: "source-unmappable" }
        const rangeKey = semanticRangeKey(range)
        if (seenRanges.has(rangeKey)) continue
        if (
          edge.fromRanges.length >= MAX_CALL_HIERARCHY_RANGES_PER_EDGE
          || totalRanges >= MAX_CALL_HIERARCHY_TOTAL_RANGES
        ) return { status: "incomplete", reason: "result-limit-exceeded" }
        seenRanges.add(rangeKey)
        edge.fromRanges.push(range)
        totalRanges += 1
      }
      edge.fromRanges.sort(compareSemanticRanges)
    }

    const normalized = [...grouped.values()].sort((left, right) => (
      compareCallHierarchyItems(left.from, right.from)
    ))
    return { status: "complete", calls: normalized }
  }

  inlayHints(
    position: SemanticDocumentPosition,
    requestedRange: SemanticTextRange,
  ): SemanticInlayHint[] {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish([])
    script.lastAccess = ++this.accessClock

    const sourceStart = exactSourceOffset(
      script.sourceContent,
      requestedRange.startLine,
      requestedRange.startColumn,
    )
    const sourceEnd = exactSourceOffset(
      script.sourceContent,
      requestedRange.endLine,
      requestedRange.endColumn,
    )
    if (sourceStart === undefined || sourceEnd === undefined || sourceEnd < sourceStart) {
      return work.finish([])
    }
    const generatedStart = script.virtualDocument.toGeneratedOffset(sourceStart)
    const generatedEnd = script.virtualDocument.toGeneratedOffset(sourceEnd)
    if (
      script.virtualDocument.toSourceOffset(generatedStart) !== sourceStart
      || script.virtualDocument.toSourceOffset(generatedEnd) !== sourceEnd
      || generatedEnd < generatedStart
    ) return work.finish([])

    work.boundary()
    const rawHints = this.service.provideInlayHints(
      filePath,
      { start: generatedStart, length: generatedEnd - generatedStart },
      {
        includeInlayParameterNameHints: "all",
        includeInlayParameterNameHintsWhenArgumentMatchesName: false,
        includeInlayVariableTypeHints: true,
        includeInlayVariableTypeHintsWhenTypeMatchesName: false,
        interactiveInlayHints: false,
      },
    )
    work.boundary()
    const hints: SemanticInlayHint[] = []
    for (const hint of rawHints) {
      const kind = hint.kind === ts.InlayHintKind.Parameter
        ? "parameter" as const
        : hint.kind === ts.InlayHintKind.Type
          ? "type" as const
          : undefined
      if (kind) {
        const label = hint.text || inlayHintDisplayText(hint.displayParts, work)
        if (label.length > 0) {
          const sourceOffset = exactSourcePosition(script, hint.position)
          if (
            sourceOffset !== undefined
            && sourceOffset >= sourceStart
            && sourceOffset < sourceEnd
          ) {
            hints.push({
              position: offsetToLineColumn(script.sourceContent, sourceOffset),
              label,
              kind,
              paddingLeft: hint.whitespaceBefore || undefined,
              paddingRight: hint.whitespaceAfter || undefined,
            })
          }
        }
      }
      work.item()
    }
    return work.finish(hints)
  }

  private nonDeclarationImplementations(
    filePath: string,
    offset: number,
    work: CooperativeWork,
  ): readonly ts.ImplementationLocation[] {
    work.boundary()
    const rawDefinitions = this.service.getDefinitionAtPosition(filePath, offset) ?? []
    work.boundary()
    const declarations = new Set<string>()
    for (const definition of rawDefinitions) {
      declarations.add(typescriptSpanKey(path.resolve(definition.fileName), definition.textSpan))
      work.item()
    }
    work.boundary()
    const rawImplementations = this.service.getImplementationAtPosition(filePath, offset) ?? []
    work.boundary()
    const implementations: ts.ImplementationLocation[] = []
    for (const implementation of rawImplementations) {
      if (!declarations.has(typescriptSpanKey(
        path.resolve(implementation.fileName),
        implementation.textSpan,
      ))) implementations.push(implementation)
      work.item()
    }
    return implementations
  }

  private prepareCallHierarchyAt(
    position: SemanticDocumentPosition,
  ): SemanticCallHierarchyPrepareQueryResult {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return { status: "incomplete", reason: "source-unavailable" }
    const pathFailure = callHierarchyPathFailure(this.rootPath, filePath, script.overlay)
    if (pathFailure) return { status: "incomplete", reason: pathFailure }
    script.lastAccess = ++this.accessClock
    const sourceOffset = exactSourceOffset(
      script.sourceContent,
      position.line,
      position.column,
    )
    if (sourceOffset === undefined) return { status: "complete", items: [] }
    const generatedOffset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    if (script.virtualDocument.toSourceOffset(generatedOffset) !== sourceOffset) {
      return { status: "incomplete", reason: "source-unmappable" }
    }
    const value = this.service.prepareCallHierarchy(filePath, generatedOffset)
    const items = value ? (Array.isArray(value) ? value : [value]) : []
    if (items.length > MAX_CALL_HIERARCHY_PREPARE_ITEMS) {
      return { status: "incomplete", reason: "result-limit-exceeded" }
    }
    const mapped: SemanticCallHierarchyItemInfo[] = []
    const seen = new Set<string>()
    for (const item of items) {
      const mappedCandidate = this.mapCallHierarchyItem(item)
      if (mappedCandidate.status === "incomplete") return mappedCandidate
      const candidate = mappedCandidate.item
      const key = callHierarchyItemKey(candidate)
      if (seen.has(key)) continue
      if (mapped.length >= MAX_CALL_HIERARCHY_PREPARE_ITEMS) {
        return { status: "incomplete", reason: "result-limit-exceeded" }
      }
      seen.add(key)
      mapped.push(candidate)
    }
    mapped.sort(compareCallHierarchyItems)
    return { status: "complete", items: mapped }
  }

  private mapCallHierarchyItem(
    item: ts.CallHierarchyItem,
  ):
    | { status: "complete"; item: SemanticCallHierarchyItemInfo }
    | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason } {
    const filePath = path.resolve(item.file)
    const resolvedView = this.callHierarchySourceView(filePath)
    if (resolvedView.status === "incomplete") return resolvedView
    const sourceView = resolvedView.view
    const selectionRange = exactSourceRange(sourceView, item.selectionSpan)
    const kind = callHierarchyItemKind(item, sourceView)
    if (!selectionRange || !kind) return { status: "incomplete", reason: "source-unmappable" }
    const mappedSpan = exactSourceBoundaryRange(sourceView, item.span)
    return {
      status: "complete",
      item: {
        path: filePath,
        name: item.name,
        kind,
        sourceFingerprint: sourceView.sourceFingerprint,
        range: mappedSpan ? unionSemanticRanges(mappedSpan, selectionRange) : selectionRange,
        selectionRange,
        ...(item.containerName ? { detail: item.containerName } : {}),
      },
    }
  }

  private callHierarchySourceView(
    filePath: string,
  ):
    | { status: "complete"; view: ScriptRecord | LazySnapshotRecord }
    | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason } {
    const resident = this.scripts.get(filePath)
    const pathFailure = callHierarchyPathFailure(this.rootPath, filePath, resident?.overlay === true)
    if (pathFailure) return { status: "incomplete", reason: pathFailure }
    if (resident) return { status: "complete", view: resident }
    const lazy = this.loadLazySnapshot(filePath)
    if (lazy) return { status: "complete", view: lazy }
    return { status: "incomplete", reason: "source-unavailable" }
  }

  private definitionCandidates(
    position: SemanticDocumentPosition,
    getDefinitions: (
      filePath: string,
      offset: number,
    ) => readonly { fileName: string; textSpan: ts.TextSpan }[] | undefined,
    work: CooperativeWork,
  ): SemanticDefinitionCandidate[] {
    work.boundary()
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish([])
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    work.boundary()
    const definitions = getDefinitions(filePath, offset) ?? []
    work.boundary()
    const seen = new Set<string>()
    const candidates: SemanticDefinitionCandidate[] = []
    for (const definition of definitions) {
      const targetPath = path.resolve(definition.fileName)
      const targetScript = this.scripts.get(targetPath)
      const targetLazy = targetScript ? undefined : this.loadLazySnapshot(targetPath)
      const content = targetScript?.sourceContent
        ?? targetLazy?.virtualDocument.sourceContent
        ?? safeRead(targetPath)
      if (content !== null) {
        const range = targetScript
          ? targetScript.virtualDocument.generatedSpanToSourceRange(
              definition.textSpan.start,
              definition.textSpan.length,
            )
          : targetLazy
            ? targetLazy.virtualDocument.generatedSpanToSourceRange(
                definition.textSpan.start,
                definition.textSpan.length,
              )
            : spanToRange(content, definition.textSpan.start, definition.textSpan.length)
        const key = [
          targetPath,
          range.startLine,
          range.startColumn,
          range.endLine,
          range.endColumn,
        ].join(":")
        if (!seen.has(key)) {
          seen.add(key)
          candidates.push({ path: targetPath, range })
        }
      }
      work.item()
    }
    return work.finish(candidates)
  }

  usages(position: SemanticDocumentPosition): SemanticUsageResult[] {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return []
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const references = this.service.getReferencesAtPosition(filePath, offset) ?? []
    const definitions = new Set((this.service.getDefinitionAtPosition(filePath, offset) ?? [])
      .map((definition) => `${path.resolve(definition.fileName)}:${definition.textSpan.start}:${definition.textSpan.length}`))
    const seen = new Set<string>()
    return references.flatMap((reference) => {
      const targetPath = path.resolve(reference.fileName)
      const spanKey = `${targetPath}:${reference.textSpan.start}:${reference.textSpan.length}`
      if (definitions.has(spanKey)) return []
      const targetScript = this.scripts.get(targetPath)
      const content = targetScript?.sourceContent ?? safeRead(targetPath)
      if (content === null) return []
      const targetOffset = targetScript
        ? targetScript.virtualDocument.toSourceOffset(reference.textSpan.start)
        : reference.textSpan.start
      const target = offsetToLineColumn(content, targetOffset)
      const key = `${targetPath}:${target.line}:${target.column}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{
        path: targetPath,
        line: target.line,
        column: target.column,
        preview: content.split("\n")[target.line - 1]?.trim() ?? "",
        kind: "semantic" as const,
        confidence: "exact" as const,
      }]
    })
  }

  references(
    position: SemanticDocumentPosition,
    includeDeclaration: boolean,
  ): SemanticReferenceQueryResult {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    if (this.projectMembershipStatus !== "complete") {
      return work.finish({ status: "incomplete", reason: "project-membership-incomplete" })
    }
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish({ status: "incomplete", reason: "source-unavailable" })
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    work.boundary()
    const definitions = this.service.getDefinitionAtPosition(filePath, offset) ?? []
    work.boundary()
    if (definitions.length === 0) return work.finish({ status: "complete", references: [] })

    const canonicalDefinitionKeys = new Set<string>()
    for (const definition of definitions) {
      canonicalDefinitionKeys.add(
        typescriptSpanKey(path.resolve(definition.fileName), definition.textSpan),
      )
      work.item()
    }
    const sourceViews = new Map<string, ScriptRecord | LazySnapshotRecord>()
    const references: SemanticDefinitionCandidate[] = []
    const seen = new Set<string>()
    for (const definition of definitions) {
      work.boundary()
      const symbols = this.service.findReferences(
        definition.fileName,
        definition.textSpan.start,
      ) ?? []
      work.boundary()
      for (const symbol of symbols) {
        for (const reference of symbol.references) {
          const targetPath = path.resolve(reference.fileName)
          work.item()
          const isCanonicalDefinition = reference.isDefinition === true
            || canonicalDefinitionKeys.has(typescriptSpanKey(targetPath, reference.textSpan))
          if (!includeDeclaration && isCanonicalDefinition) continue
          if (!isWithinRoot(this.rootPath, targetPath)) {
            return work.finish({ status: "incomplete", reason: "source-outside-workspace" })
          }
          let sourceView = sourceViews.get(targetPath)
          if (!sourceView) {
            sourceView = this.scripts.get(targetPath) ?? this.loadLazySnapshot(targetPath)
            if (!sourceView) {
              return work.finish({ status: "incomplete", reason: "source-unavailable" })
            }
            sourceViews.set(targetPath, sourceView)
          }
          const range = exactSourceRange(sourceView, reference.textSpan)
          if (!range) return work.finish({ status: "incomplete", reason: "source-unmappable" })
          const key = semanticLocationKey(targetPath, range)
          if (seen.has(key)) continue
          seen.add(key)
          references.push({ path: targetPath, range })
        }
      }
    }
    work.boundary()
    references.sort(work.comparator(compareSemanticLocations))
    return work.finish({ status: "complete", references })
  }

  diagnostics(position: SemanticDocumentPosition): SemanticDiagnostic[] {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish([])
    script.lastAccess = ++this.accessClock
    work.boundary()
    const syntacticDiagnostics = this.service.getSyntacticDiagnostics(filePath)
    work.boundary()
    const semanticDiagnostics = this.service.getSemanticDiagnostics(filePath)
    work.boundary()
    const diagnostics = mapTypescriptDiagnosticGroups(
      filePath,
      script.virtualDocument,
      [syntacticDiagnostics, semanticDiagnostics],
      work,
    )
    return work.finish(diagnostics)
  }

  codeActions(
    position: SemanticDocumentPosition,
    requestedRange: SemanticTextRange,
  ): SemanticCodeFixCandidate[] {
    return this.safeCodeFixes(position, requestedRange).map(({ edits: _edits, ...action }) => action)
  }

  resolveCodeAction(
    position: SemanticDocumentPosition,
    requestedRange: SemanticTextRange,
    fingerprint: string,
  ): SemanticResolvedCodeFix | null {
    const documentVersion = position.documentVersion
    if (documentVersion === undefined || !Number.isSafeInteger(documentVersion)) return null
    const action = this.safeCodeFixes(position, requestedRange)
      .find((candidate) => candidate.fingerprint === fingerprint)
    if (!action) return null
    return {
      ...action,
      edits: action.edits.map((edit) => ({
        ...edit,
        expectedVersion: documentVersion,
      })),
    }
  }

  private safeCodeFixes(
    position: SemanticDocumentPosition,
    requestedRange: SemanticTextRange,
  ): SafeCodeFix[] {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return []
    script.lastAccess = ++this.accessClock

    const diagnostics = [
      ...this.service.getSyntacticDiagnostics(filePath),
      ...this.service.getSemanticDiagnostics(filePath),
    ]
    const seen = new Set<string>()
    const candidates: SafeCodeFix[] = []
    for (const diagnostic of diagnostics) {
      if (diagnostic.start === undefined) continue
      const [mappedDiagnostic] = mapTypescriptDiagnostics(
        filePath,
        script.virtualDocument,
        [diagnostic],
      )
      if (!mappedDiagnostic || !sameTextRange(mappedDiagnostic.range, requestedRange)) continue
      const actions = this.service.getCodeFixesAtPosition(
        filePath,
        diagnostic.start,
        diagnostic.start + (diagnostic.length ?? 1),
        [diagnostic.code],
        ts.getDefaultFormatCodeSettings(documentEol(script.sourceContent)),
        { allowTextChangesInNewFiles: false },
      )
      for (const action of actions) {
        if (action.fixName !== "spelling") continue
        const safe = safeCodeFix(filePath, script, action)
        if (!safe || seen.has(safe.fingerprint)) continue
        seen.add(safe.fingerprint)
        candidates.push({
          title: action.description,
          kind: "quickfix",
          diagnostic: mappedDiagnostic,
          fingerprint: safe.fingerprint,
          edits: safe.edits,
        })
      }
    }
    return candidates.sort((left, right) => (
      left.title.localeCompare(right.title) || left.fingerprint.localeCompare(right.fingerprint)
    ))
  }

  documentSymbols(position: SemanticDocumentPosition): SemanticDocumentSymbolInfo[] {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish([])
    script.lastAccess = ++this.accessClock
    work.boundary()
    const tree = this.service.getNavigationTree(filePath)
    work.boundary()
    const symbols = navigationSymbols(tree.childItems ?? [], script, work)
    work.boundary()
    symbols.sort(work.comparator(compareDocumentSymbols))
    return work.finish(symbols)
  }

  documentHighlights(position: SemanticDocumentPosition): SemanticDocumentHighlight[] {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish([])
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    if (script.virtualDocument.toSourceOffset(offset) !== sourceOffset) return work.finish([])
    work.boundary()
    const groups = this.service.getDocumentHighlights(filePath, offset, [filePath]) ?? []
    work.boundary()
    const highlights: SemanticDocumentHighlight[] = []
    const seen = new Set<string>()
    for (const group of groups) {
      if (path.resolve(group.fileName) !== filePath) return work.finish([])
      for (const span of group.highlightSpans) {
        const range = exactSourceRange(script, span.textSpan)
        const kind = documentHighlightKind(span.kind)
        if (!range || !kind) return work.finish([])
        const key = semanticLocationKey(filePath, range)
        if (!seen.has(key)) {
          seen.add(key)
          highlights.push({ range, kind })
        }
        work.item()
      }
      work.item()
    }
    work.boundary()
    highlights.sort(work.comparator(compareDocumentHighlights))
    return work.finish(highlights)
  }

  hover(position: SemanticDocumentPosition): SemanticHoverInfo | null {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return null
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const info = this.service.getQuickInfoAtPosition(filePath, offset)
    if (!info) return null

    return {
      signature: ts.displayPartsToString(info.displayParts ?? []),
      documentation: quickInfoDocumentation(info),
      range: script.virtualDocument.generatedSpanToSourceRange(
        info.textSpan.start,
        info.textSpan.length,
      ),
    }
  }

  prepareRename(position: SemanticDocumentPosition): SemanticPrepareRenameQueryResult {
    if (this.projectMembershipStatus !== "complete") {
      return { status: "incomplete", reason: "project-membership-incomplete" }
    }
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return { status: "incomplete", reason: "source-unavailable" }
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const info = this.service.getRenameInfo(filePath, offset, { allowRenameOfImportPath: false })
    if (!info.canRename) return { status: "unavailable" }
    const range = exactSourceRange(script, info.triggerSpan)
    if (!range) return { status: "incomplete", reason: "source-unmappable" }
    const placeholderStart = script.virtualDocument.toSourceOffset(info.triggerSpan.start)
    const placeholderEnd = script.virtualDocument.toSourceOffset(
      info.triggerSpan.start + info.triggerSpan.length,
    )
    return {
      status: "ready",
      range,
      placeholder: script.sourceContent.slice(placeholderStart, placeholderEnd),
    }
  }

  rename(
    position: SemanticDocumentPosition,
    newName: string,
  ): SemanticRenameQueryResult {
    const work = new CooperativeWork(this.checkpoint)
    work.boundary()
    if (this.projectMembershipStatus !== "complete") {
      return work.finish({ status: "incomplete", reason: "project-membership-incomplete" })
    }
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish({ status: "incomplete", reason: "source-unavailable" })
    if (!isIdentifierText(newName)) return work.finish({ status: "invalid-name" })
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    work.boundary()
    const info = this.service.getRenameInfo(filePath, offset, { allowRenameOfImportPath: false })
    work.boundary()
    if (!info.canRename) return work.finish({ status: "unavailable" })
    work.boundary()
    const conflict = preflightTopLevelClassRenameConflict(
      this.service,
      filePath,
      info.triggerSpan.start,
      newName,
    )
    work.boundary()
    if (conflict === "conflict" || conflict === "indeterminate") {
      return work.finish({ status: "unavailable" })
    }
    work.boundary()
    const locations = this.service.findRenameLocations(filePath, offset, false, false, true) ?? []
    work.boundary()
    if (locations.length === 0) return work.finish({ status: "unavailable" })
    const sourceViews = new Map<string, ScriptRecord | LazySnapshotRecord>()
    const edits: Extract<SemanticRenameQueryResult, { status: "complete" }>["edits"] = []
    const seen = new Set<string>()
    for (const location of locations) {
      const targetPath = path.resolve(location.fileName)
      work.item()
      if (!isWithinRoot(this.rootPath, targetPath)) {
        return work.finish({ status: "incomplete", reason: "source-outside-workspace" })
      }
      let sourceView = sourceViews.get(targetPath)
      if (!sourceView) {
        sourceView = this.scripts.get(targetPath) ?? this.loadLazySnapshot(targetPath)
        if (!sourceView) return work.finish({ status: "incomplete", reason: "source-unavailable" })
        sourceViews.set(targetPath, sourceView)
      }
      const range = exactSourceRange(sourceView, location.textSpan)
      if (!range) return work.finish({ status: "incomplete", reason: "source-unmappable" })
      const newText = `${location.prefixText ?? ""}${newName}${location.suffixText ?? ""}`
      const key = semanticLocationKey(targetPath, range)
      if (seen.has(key)) continue
      seen.add(key)
      edits.push({
        path: targetPath,
        range,
        newText,
        expectedVersion: this.scripts.get(targetPath)?.documentVersion ?? null,
      })
    }
    work.boundary()
    edits.sort(work.comparator(compareTextEdits))
    work.boundary()
    if (hasOverlappingEdits(edits, work)) {
      return work.finish({ status: "incomplete", reason: "source-unmappable" })
    }
    return work.finish({ status: "complete", edits })
  }

  signatureHelp(
    position: SemanticDocumentPosition,
    triggerReason: SemanticSignatureHelpTriggerReason,
  ): SemanticSignatureHelp | null {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return null
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const info = this.service.getSignatureHelpItems(filePath, offset, {
      triggerReason,
    })
    if (!info) return null

    return {
      signatures: info.items.map((item) => {
        const separator = ts.displayPartsToString(item.separatorDisplayParts)
        const parameters = item.parameters.map((parameter) => ({
          label: ts.displayPartsToString(parameter.displayParts),
          documentation: optionalDisplayParts(parameter.documentation),
        }))
        return {
          label: `${ts.displayPartsToString(item.prefixDisplayParts)}${parameters.map((parameter) => parameter.label).join(separator)}${ts.displayPartsToString(item.suffixDisplayParts)}`,
          documentation: optionalDisplayParts(item.documentation),
          parameters,
        }
      }),
      activeSignature: info.selectedItemIndex,
      activeParameter: info.argumentIndex,
    }
  }

  dispose(): void {
    this.service.dispose()
    this.scripts.clear()
    this.projectMembershipPaths.clear()
    this.projectContentVersions.clear()
    this.lazySnapshots.clear()
    this.scriptBytes = 0
    this.lazySnapshotBytes = 0
  }

  private createHost(
    hostCancellationToken: ts.HostCancellationToken | undefined,
  ): ts.LanguageServiceHost {
    return {
      ...(hostCancellationToken
        ? { getCancellationToken: () => hostCancellationToken }
        : {}),
      getCompilationSettings: () => this.options,
      getCurrentDirectory: () => this.rootPath,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getProjectVersion: () => [
        this.generation,
        this.projectMembershipStatus,
        this.projectMembershipRevision,
        this.projectContentRevision,
      ].join(":"),
      getScriptFileNames: () => this.scriptFileNames(),
      getScriptKind: () => ts.ScriptKind.TS,
      getScriptSnapshot: (fileName) => {
        const filePath = path.resolve(fileName)
        const resident = this.scripts.get(filePath)
        if (resident) return ts.ScriptSnapshot.fromString(resident.content)
        const lazy = this.loadLazySnapshot(filePath)
        if (lazy) return lazy.snapshot
        const content = safeRead(filePath)
        return content === null ? undefined : ts.ScriptSnapshot.fromString(content)
      },
      getScriptVersion: (fileName) => {
        const filePath = path.resolve(fileName)
        const resident = this.scripts.get(filePath)
        return resident
          ? String(resident.version)
          : this.projectMembershipPaths.has(filePath)
            ? `content-${this.projectContentVersions.get(filePath) ?? 0}`
            : "0"
      },
      directoryExists: ts.sys.directoryExists,
      fileExists: (fileName) => {
        const filePath = path.resolve(fileName)
        return this.scripts.has(filePath) || isRegularBoundedFile(filePath)
      },
      getDirectories: ts.sys.getDirectories,
      readDirectory: ts.sys.readDirectory,
      readFile: (fileName) => {
        const filePath = path.resolve(fileName)
        return this.scripts.get(filePath)?.content
          ?? this.loadLazySnapshot(filePath)?.content
          ?? safeRead(filePath)
          ?? undefined
      },
      resolveModuleNames: (names, containingFile) => names.map((name) =>
        this.resolveModule(name, containingFile)),
    }
  }

  private resolveModule(name: string, containingFile: string): ts.ResolvedModule | undefined {
    if (!name.startsWith(".")) {
      const sdkRoot = discoverHarmonySdk().path
      const sdkModule = sdkRoot ? resolveHarmonySdkModule(sdkRoot, name) : null
      if (sdkModule) {
        return ({
          resolvedFileName: sdkModule,
          extension: sdkModule.endsWith(".d.ts") ? ts.Extension.Dts : ts.Extension.Ts,
          isExternalLibraryImport: true,
        } as ts.ResolvedModule)
      }
      return ts.resolveModuleName(name, containingFile, this.options, ts.sys).resolvedModule
    }
    const base = path.resolve(path.dirname(containingFile), name)
    const candidates = path.extname(base)
      ? [base]
      : [
          base + ".d.ets",
          base + ".d.ts",
          base + ".ets",
          base + ".ts",
          path.join(base, "index.d.ets"),
          path.join(base, "index.d.ts"),
          path.join(base, "index.ets"),
          path.join(base, "index.ts"),
        ]
    const resolved = candidates.find((candidate) =>
      this.scripts.has(path.resolve(candidate)) || isRegularBoundedFile(candidate))
    return resolved
      ? ({ resolvedFileName: resolved, extension: ts.Extension.Ts } as ts.ResolvedModule)
      : undefined
  }

  private updateScript(
    filePath: string,
    content: string,
    documentVersion?: number,
    overlay = false,
  ): void {
    this.removeLazySnapshot(filePath)
    const previous = this.scripts.get(filePath)
    if (previous?.sourceContent === content) {
      previous.documentVersion = documentVersion
      previous.overlay = overlay
      previous.lastAccess = ++this.accessClock
      return
    }
    if (previous) this.scriptBytes -= previous.bytes
    const virtualDocument = createArktsVirtualDocument(filePath, content)
    const bytes = Buffer.byteLength(content) + Buffer.byteLength(virtualDocument.generatedContent)
    this.scripts.set(filePath, {
      path: filePath,
      content: virtualDocument.generatedContent,
      sourceContent: content,
      virtualDocument,
      version: (previous?.version ?? 0) + 1,
      documentVersion,
      overlay,
      sourceFingerprint: fingerprintSource(content),
      bytes,
      lastAccess: ++this.accessClock,
    })
    if (!previous && !this.projectMembershipPaths.has(filePath)) this.combinedFileNames = undefined
    this.scriptBytes += bytes
    this.generation += 1
  }

  private removeScript(filePath: string): void {
    const previous = this.scripts.get(filePath)
    if (!previous) return
    this.scripts.delete(filePath)
    if (!this.projectMembershipPaths.has(filePath)) this.combinedFileNames = undefined
    this.scriptBytes -= previous.bytes
    this.generation += 1
  }

  private removeProjectFiles(removedPaths: string[] | undefined): void {
    let membershipChanged = false
    for (const removedPath of removedPaths ?? []) {
      const filePath = path.resolve(removedPath)
      membershipChanged = this.projectMembershipPaths.delete(filePath) || membershipChanged
      this.projectContentVersions.delete(filePath)
      this.removeScript(filePath)
      this.removeLazySnapshot(filePath)
    }
    if (!membershipChanged) return
    this.membershipFileNames = [
      ...this.projectMembershipPaths,
      ...this.sdkDeclarationPaths.filter((filePath) => !this.projectMembershipPaths.has(filePath)),
    ]
    this.combinedFileNames = undefined
    this.generation += 1
  }

  private updateProjectMembership(membership: ProjectMembershipSnapshot | undefined): void {
    if (!membership) return
    if (
      membership.status === this.projectMembershipStatus
      && membership.revision === this.projectMembershipRevision
    ) return

    this.projectMembershipStatus = membership.status
    this.projectMembershipReason = membership.reason
    this.projectMembershipRevision = membership.revision
    if (membership.status === "partial") {
      for (const filePath of this.projectMembershipPaths) this.removeScript(filePath)
      this.projectMembershipPaths.clear()
      this.projectContentVersions.clear()
      this.clearLazySnapshots()
      this.membershipFileNames = [...this.sdkDeclarationPaths]
      this.combinedFileNames = undefined
      this.generation += 1
      return
    }

    const nextPaths = new Set(membership.paths.map((filePath) => path.resolve(filePath)))
    for (const filePath of this.scripts.keys()) {
      if (isWithinRoot(this.rootPath, filePath) && !nextPaths.has(filePath)) {
        this.removeScript(filePath)
      }
    }
    for (const filePath of this.projectMembershipPaths) {
      if (nextPaths.has(filePath)) continue
      this.removeLazySnapshot(filePath)
      this.projectContentVersions.delete(filePath)
    }
    for (const filePath of this.lazySnapshots.keys()) {
      if (!nextPaths.has(filePath)) this.removeLazySnapshot(filePath)
    }
    this.projectMembershipPaths.clear()
    for (const filePath of nextPaths) this.projectMembershipPaths.add(filePath)
    this.membershipFileNames = [
      ...this.projectMembershipPaths,
      ...this.sdkDeclarationPaths.filter((filePath) => !this.projectMembershipPaths.has(filePath)),
    ]
    this.combinedFileNames = undefined
    this.generation += 1
  }

  private updateProjectContent(
    contentRevision: number | undefined,
    changedPaths: string[] | undefined,
  ): void {
    if (contentRevision !== undefined) this.projectContentRevision = contentRevision
    for (const changedPath of changedPaths ?? []) {
      const filePath = path.resolve(changedPath)
      this.projectContentVersions.set(filePath, this.projectContentRevision)
      this.removeScript(filePath)
      this.removeLazySnapshot(filePath)
    }
  }

  private loadLazySnapshot(filePath: string): LazySnapshotRecord | undefined {
    if (!this.projectMembershipPaths.has(filePath)) return undefined
    const cached = this.lazySnapshots.get(filePath)
    if (cached) {
      this.lazySnapshots.delete(filePath)
      this.lazySnapshots.set(filePath, cached)
      return cached
    }
    if (!isRegularBoundedFile(filePath)) return undefined
    const sourceContent = this.readSourceFile(filePath)
    if (sourceContent === null) return undefined
    const virtualDocument = createArktsVirtualDocument(filePath, sourceContent)
    const content = virtualDocument.generatedContent
    const record: LazySnapshotRecord = {
      path: filePath,
      content,
      virtualDocument,
      snapshot: ts.ScriptSnapshot.fromString(content),
      sourceFingerprint: fingerprintSource(sourceContent),
      bytes: Buffer.byteLength(sourceContent) + Buffer.byteLength(content),
    }
    if (record.bytes <= this.maxLazySnapshotBytes && this.maxLazySnapshots > 0) {
      this.lazySnapshots.set(filePath, record)
      this.lazySnapshotBytes += record.bytes
      this.evictLazySnapshots()
    }
    return record
  }

  private removeLazySnapshot(filePath: string): void {
    const cached = this.lazySnapshots.get(filePath)
    if (!cached) return
    this.lazySnapshots.delete(filePath)
    this.lazySnapshotBytes -= cached.bytes
  }

  private clearLazySnapshots(): void {
    this.lazySnapshots.clear()
    this.lazySnapshotBytes = 0
  }

  private evictLazySnapshots(): void {
    while (
      this.lazySnapshots.size > this.maxLazySnapshots
      || this.lazySnapshotBytes > this.maxLazySnapshotBytes
    ) {
      const oldestPath = this.lazySnapshots.keys().next().value
      if (oldestPath === undefined) return
      this.removeLazySnapshot(oldestPath)
    }
  }

  private mapCompletionEdits(
    currentPath: string,
    documentVersion: number | undefined,
    details: ts.CompletionEntryDetails,
    work: CooperativeWork,
  ): SemanticCompletionTextEdit[] | undefined {
    work.boundary()
    let action: ts.CodeAction | undefined
    for (const candidate of details.codeActions ?? []) {
      let accepted = !candidate.commands?.length
      if (accepted) {
        const changes = candidate.changes
        accepted = changes.length > 0
        if (accepted) {
          for (const change of changes) {
            const belongsToCurrentDocument = !change.isNewFile
              && path.resolve(change.fileName) === currentPath
            work.item()
            if (!belongsToCurrentDocument) {
              accepted = false
              break
            }
          }
        }
      }
      work.item()
      if (accepted) {
        action = candidate
        break
      }
    }
    work.boundary()
    if (!action) return undefined
    const script = this.scripts.get(currentPath)
    if (!script) return undefined
    const edits: SemanticCompletionTextEdit[] = []
    for (const change of action.changes) {
      const textChanges = change.textChanges
      for (const textChange of textChanges) {
        const span = textChange.span
        edits.push({
          path: currentPath,
          range: script.virtualDocument.generatedSpanToSourceRange(span.start, span.length),
          newText: textChange.newText,
          expectedVersion: documentVersion,
        })
        work.item()
      }
      work.item()
    }
    work.boundary()
    return edits
  }

  private evict(protectedPaths: Set<string>): void {
    const candidates = [...this.scripts.values()]
      .filter((script) => !protectedPaths.has(script.path))
      .sort((left, right) => left.lastAccess - right.lastAccess)
    for (const script of candidates) {
      if (this.scripts.size <= MAX_SCRIPTS && this.scriptBytes <= MAX_SCRIPT_BYTES) break
      this.scripts.delete(script.path)
      this.scriptBytes -= script.bytes
      this.generation += 1
    }
  }
}

function completionPrefix(content: string, offset: number): string {
  let start = offset
  while (start > 0) {
    let previousStart = start - 1
    const trailingUnit = content.charCodeAt(previousStart)
    if (
      trailingUnit >= 0xdc00
      && trailingUnit <= 0xdfff
      && previousStart > 0
    ) {
      const leadingUnit = content.charCodeAt(previousStart - 1)
      if (leadingUnit >= 0xd800 && leadingUnit <= 0xdbff) previousStart -= 1
    }
    const codePoint = content.codePointAt(previousStart)
    if (
      codePoint === undefined
      || !ts.isIdentifierPart(codePoint, ts.ScriptTarget.Latest)
    ) break
    start = previousStart
  }
  if (start === offset) return ""
  const firstCodePoint = content.codePointAt(start)
  return firstCodePoint !== undefined
    && ts.isIdentifierStart(firstCodePoint, ts.ScriptTarget.Latest)
    ? content.slice(start, offset)
    : ""
}

function hasMinimumCodePointLength(value: string, minimum: number): boolean {
  let length = 0
  for (const _codePoint of value) {
    length += 1
    if (length >= minimum) return true
  }
  return false
}

function completionMatchQuality(
  candidate: string,
  normalizedPrefix: string,
): CompletionMatchQuality | undefined {
  if (normalizedPrefix.length === 0) return COMPLETION_PREFIX_MATCH
  const normalizedCandidate = candidate.toLowerCase()
  if (normalizedCandidate.startsWith(normalizedPrefix)) return COMPLETION_PREFIX_MATCH
  let prefixIndex = 0
  for (let candidateIndex = 0; candidateIndex < normalizedCandidate.length; candidateIndex += 1) {
    if (
      normalizedCandidate.charCodeAt(candidateIndex)
      !== normalizedPrefix.charCodeAt(prefixIndex)
    ) continue
    prefixIndex += 1
    if (prefixIndex === normalizedPrefix.length) {
      return matchesCamelCompletion(candidate, normalizedCandidate, normalizedPrefix)
        ? COMPLETION_CAMEL_MATCH
        : COMPLETION_SUBSEQUENCE_MATCH
    }
  }
  return undefined
}

function matchesCamelCompletion(
  candidate: string,
  normalizedCandidate: string,
  normalizedPrefix: string,
): boolean {
  let searchStart = 0
  let previousMatch = -2
  for (let prefixIndex = 0; prefixIndex < normalizedPrefix.length; prefixIndex += 1) {
    let match = -1
    for (let candidateIndex = searchStart; candidateIndex < normalizedCandidate.length; candidateIndex += 1) {
      if (
        normalizedCandidate.charCodeAt(candidateIndex)
          !== normalizedPrefix.charCodeAt(prefixIndex)
        || (
          prefixIndex === 0
            ? !isCompletionWordBoundary(candidate, candidateIndex)
            : candidateIndex !== previousMatch + 1
              && !isCompletionWordBoundary(candidate, candidateIndex)
        )
      ) continue
      match = candidateIndex
      break
    }
    if (match < 0) return false
    previousMatch = match
    searchStart = match + 1
  }
  return true
}

function isCompletionWordBoundary(candidate: string, index: number): boolean {
  if (index === 0) return true
  const previous = candidate.charCodeAt(index - 1)
  const current = candidate.charCodeAt(index)
  if (previous === 0x5f || previous === 0x2d || previous === 0x2e || previous === 0x2f) {
    return true
  }
  const previousIsLower = previous >= 0x61 && previous <= 0x7a
  const previousIsUpper = previous >= 0x41 && previous <= 0x5a
  const previousIsDigit = previous >= 0x30 && previous <= 0x39
  const currentIsLower = current >= 0x61 && current <= 0x7a
  const currentIsUpper = current >= 0x41 && current <= 0x5a
  if (previousIsDigit && (currentIsLower || currentIsUpper)) return true
  if (!currentIsUpper) return false
  if (previousIsLower) return true
  const next = candidate.charCodeAt(index + 1)
  const nextIsLower = next >= 0x61 && next <= 0x7a
  return previousIsUpper && nextIsLower
}

function completionKind(
  kind: ts.ScriptElementKind,
  objectLiteralPropertyCompletion = false,
): string {
  if (kind === ts.ScriptElementKind.memberFunctionElement) return "method"
  if (kind === ts.ScriptElementKind.memberVariableElement) {
    return objectLiteralPropertyCompletion ? "property" : "field"
  }
  if (kind === ts.ScriptElementKind.functionElement) return "function"
  if (kind === ts.ScriptElementKind.classElement) return "class"
  if (kind === ts.ScriptElementKind.enumElement) return "enum"
  if (kind === ts.ScriptElementKind.interfaceElement) return "interface"
  if (kind === ts.ScriptElementKind.keyword) return "keyword"
  if (kind === ts.ScriptElementKind.constElement || kind === ts.ScriptElementKind.letElement) return "variable"
  return "property"
}

function isObjectLiteralPropertyCompletion(
  service: ts.LanguageService,
  filePath: string,
  position: number,
  work: CooperativeWork,
): boolean {
  const sourceFile = service.getProgram()?.getSourceFile(filePath)
  if (!sourceFile) return false
  const probePosition = Math.max(0, position - 1)
  let current: ts.Node | undefined = syntaxNodeAtPosition(sourceFile, probePosition, work)
  while (current && !ts.isObjectLiteralExpression(current)) {
    work.item()
    current = current.parent
  }
  const objectLiteral = current
  if (!objectLiteral || position > objectLiteral.getEnd()) return false
  if (
    position === objectLiteral.getEnd()
    && objectLiteral.getLastToken(sourceFile)?.kind === ts.SyntaxKind.CloseBraceToken
  ) return false
  const property = nodeAtPosition(objectLiteral.properties, probePosition, sourceFile, work)
  if (!property) return true
  if (!ts.isShorthandPropertyAssignment(property) && !ts.isPropertyAssignment(property)) {
    return false
  }
  if (ts.isComputedPropertyName(property.name)) return false
  return probePosition >= property.name.getStart(sourceFile)
    && position <= property.name.getEnd()
}

function syntaxNodeAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
  work: CooperativeWork,
): ts.Node {
  let current: ts.Node = sourceFile
  while (true) {
    const child = nodeAtPosition(current.getChildren(sourceFile), position, sourceFile, work, true)
    if (!child) return current
    current = child
  }
}

function nodeAtPosition<T extends ts.Node>(
  nodes: readonly T[],
  position: number,
  sourceFile: ts.SourceFile,
  work: CooperativeWork,
  includeLeadingTrivia = false,
): T | undefined {
  let low = 0
  let high = nodes.length - 1
  while (low <= high) {
    work.item()
    const middle = low + Math.floor((high - low) / 2)
    const node = nodes[middle]
    const start = includeLeadingTrivia ? node.getFullStart() : node.getStart(sourceFile)
    if (position < start) {
      high = middle - 1
    } else if (position >= node.getEnd()) {
      low = middle + 1
    } else {
      return node
    }
  }
  return undefined
}

function safeCodeFix(
  currentPath: string,
  script: ScriptRecord,
  action: ts.CodeFixAction,
): Pick<SafeCodeFix, "fingerprint" | "edits"> | undefined {
  if (action.commands?.length || action.changes.length === 0) return undefined
  const normalizedChanges: Array<{
    fileName: string
    textChanges: Array<{ start: number; length: number; newText: string }>
  }> = []
  const edits: SafeCodeFix["edits"] = []
  const spans: Array<{ start: number; end: number }> = []
  for (const change of action.changes) {
    if (
      change.isNewFile
      || path.resolve(change.fileName) !== currentPath
      || change.textChanges.length === 0
    ) return undefined
    const textChanges: Array<{ start: number; length: number; newText: string }> = []
    for (const textChange of change.textChanges) {
      const { start, length } = textChange.span
      const sourceStart = script.virtualDocument.toSourceOffset(start)
      const sourceEnd = script.virtualDocument.toSourceOffset(start + length)
      if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(length)
        || start < 0
        || length < 0
        || start + length > script.content.length
        || script.virtualDocument.toGeneratedOffset(
          sourceStart,
        ) !== start
        || script.virtualDocument.toGeneratedOffset(
          sourceEnd,
        ) !== start + length
        || script.content.slice(start, start + length)
          !== script.sourceContent.slice(sourceStart, sourceEnd)
      ) return undefined
      textChanges.push({ start, length, newText: textChange.newText })
      spans.push({ start, end: start + length })
      edits.push({
        path: currentPath,
        range: script.virtualDocument.generatedSpanToSourceRange(start, length),
        newText: textChange.newText,
      })
    }
    normalizedChanges.push({
      fileName: path.resolve(change.fileName),
      textChanges,
    })
  }
  spans.sort((left, right) => left.start - right.start || left.end - right.end)
  for (let index = 1; index < spans.length; index += 1) {
    if (spans[index].start < spans[index - 1].end) return undefined
  }
  const fingerprint = `sha256:${createHash("sha256").update(JSON.stringify({
    fixName: action.fixName,
    description: action.description,
    changes: normalizedChanges,
  })).digest("hex")}`
  return { fingerprint, edits }
}

function sameTextRange(left: SemanticTextRange, right: SemanticTextRange): boolean {
  return left.startLine === right.startLine
    && left.startColumn === right.startColumn
    && left.endLine === right.endLine
    && left.endColumn === right.endColumn
}

function documentEol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n"
}

function optionalDisplayParts(parts: ts.SymbolDisplayPart[]) {
  const value = ts.displayPartsToString(parts)
  return value || undefined
}

function completionDisplayPartsText(
  parts: readonly ts.SymbolDisplayPart[],
  work: CooperativeWork,
): string {
  work.boundary()
  const mapped: string[] = []
  for (const part of parts) {
    mapped.push(part.text)
    work.item()
  }
  return work.finish(mapped.join(""))
}

function completionOptionalDisplayParts(
  parts: readonly ts.SymbolDisplayPart[],
  work: CooperativeWork,
): string | undefined {
  return completionDisplayPartsText(parts, work) || undefined
}

function inlayHintDisplayText(
  parts: readonly { text: string }[] | undefined,
  work: CooperativeWork,
): string {
  const mapped: string[] = []
  for (const part of parts ?? []) {
    mapped.push(part.text)
    work.item()
  }
  return mapped.join("")
}

function discoverSdkAmbientDeclarations(): string[] {
  const sdkRoot = discoverHarmonySdk().path
  if (!sdkRoot) return []
  const prelude = [
    path.join(sdkRoot, "ets", "component", "common.d.ts"),
    path.join(sdkRoot, "ets", "component", "arkui.d.ts"),
  ].find((candidate) => fs.existsSync(candidate))
  return prelude ? [prelude] : []
}

function quickInfoDocumentation(info: ts.QuickInfo): string | undefined {
  const documentation = optionalDisplayParts(info.documentation ?? [])
  const tags = (info.tags ?? []).map((tag) => {
    const text = optionalDisplayParts(tag.text ?? [])
    return `@${tag.name}${text ? ` ${text}` : ""}`
  })
  return [documentation, ...tags].filter((part): part is string => Boolean(part)).join("\n\n") || undefined
}

interface NavigationTraversalFrame {
  item?: ts.NavigationTree
  span?: ts.TextSpan
  kind?: SemanticDocumentSymbolKind | null
  childItems: readonly ts.NavigationTree[]
  nextChildIndex: number
  symbols: SemanticDocumentSymbolInfo[]
}

function navigationSymbols(
  items: readonly ts.NavigationTree[],
  script: ScriptRecord,
  work: CooperativeWork,
): SemanticDocumentSymbolInfo[] {
  const root: NavigationTraversalFrame = {
    childItems: items,
    nextChildIndex: 0,
    symbols: [],
  }
  const stack = [root]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame.nextChildIndex < frame.childItems.length) {
      const item = frame.childItems[frame.nextChildIndex]
      frame.nextChildIndex += 1
      const span = item.spans[0]
      work.item()
      if (!span) continue
      stack.push({
        item,
        span,
        kind: documentSymbolKind(item, script),
        childItems: item.childItems ?? [],
        nextChildIndex: 0,
        symbols: [],
      })
      continue
    }

    stack.pop()
    if (!frame.item || !frame.span) return frame.symbols
    frame.symbols.sort(work.comparator(compareDocumentSymbols))
    const parent = stack[stack.length - 1]
    if (!frame.kind) {
      for (const symbol of frame.symbols) {
        parent.symbols.push(symbol)
        work.item()
      }
      continue
    }
    const nameSpan = frame.item.nameSpan ?? { start: frame.span.start, length: 0 }
    parent.symbols.push({
      name: frame.item.text,
      kind: frame.kind,
      range: script.virtualDocument.generatedSpanToSourceRange(
        frame.span.start,
        frame.span.length,
      ),
      selectionRange: script.virtualDocument.generatedSpanToSourceRange(
        nameSpan.start,
        nameSpan.length,
      ),
      children: frame.symbols.length > 0 ? frame.symbols : undefined,
    })
    work.item()
  }
  return root.symbols
}

function documentSymbolKind(
  item: ts.NavigationTree,
  script: ScriptRecord,
): SemanticDocumentSymbolKind | null {
  switch (item.kind) {
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return isArktsStruct(item, script) ? "struct" : "class"
    case ts.ScriptElementKind.interfaceElement: return "interface"
    case ts.ScriptElementKind.enumElement: return "enum"
    case ts.ScriptElementKind.enumMemberElement: return "enumMember"
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return "function"
    case ts.ScriptElementKind.memberFunctionElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return "method"
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
      return "property"
    case ts.ScriptElementKind.constructorImplementationElement: return "constructor"
    case ts.ScriptElementKind.moduleElement: return "module"
    case ts.ScriptElementKind.typeElement: return "type"
    case ts.ScriptElementKind.constElement:
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.variableUsingElement:
    case ts.ScriptElementKind.variableAwaitUsingElement:
      return "variable"
    default: return null
  }
}

function callHierarchyItemKind(
  item: ts.CallHierarchyItem,
  sourceView: ScriptRecord | LazySnapshotRecord,
): SemanticCallHierarchyItemKind | undefined {
  switch (item.kind) {
    case ts.ScriptElementKind.scriptElement: return "file"
    case ts.ScriptElementKind.moduleElement: return "module"
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return isArktsCallHierarchyStruct(item, sourceView) ? "struct" : "class"
    case ts.ScriptElementKind.interfaceElement: return "interface"
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return "function"
    case ts.ScriptElementKind.memberFunctionElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return "method"
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
      return "property"
    case ts.ScriptElementKind.constructorImplementationElement: return "constructor"
    case ts.ScriptElementKind.constElement: return "constant"
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
      return "variable"
    default: return undefined
  }
}

function isArktsCallHierarchyStruct(
  item: ts.CallHierarchyItem,
  sourceView: ScriptRecord | LazySnapshotRecord,
): boolean {
  const range = exactSourceBoundaryRange(sourceView, item.span)
  const selection = exactSourceRange(sourceView, item.selectionSpan)
  if (!range || !selection) return false
  const source = sourceView.virtualDocument.sourceContent
  const rangeStart = lineColumnToOffset(source, range.startLine, range.startColumn)
  const selectionStart = lineColumnToOffset(
    source,
    selection.startLine,
    selection.startColumn,
  )
  return /\bstruct\s*$/.test(source.slice(rangeStart, selectionStart))
}

function isArktsStruct(item: ts.NavigationTree, script: ScriptRecord): boolean {
  const span = item.spans[0]
  const nameSpan = item.nameSpan
  if (!span || !nameSpan) return false
  const sourceStart = script.virtualDocument.toSourceOffset(span.start)
  const sourceNameStart = script.virtualDocument.toSourceOffset(nameSpan.start)
  return /\bstruct\s*$/.test(script.sourceContent.slice(sourceStart, sourceNameStart))
}

function compareDocumentSymbols(
  left: SemanticDocumentSymbolInfo,
  right: SemanticDocumentSymbolInfo,
): number {
  return left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
}

function documentHighlightKind(
  kind: ts.HighlightSpanKind,
): SemanticDocumentHighlightKind | undefined {
  if (kind === ts.HighlightSpanKind.writtenReference) return "write"
  if (kind === ts.HighlightSpanKind.reference) return "read"
  if (kind === ts.HighlightSpanKind.definition || kind === ts.HighlightSpanKind.none) return "text"
  return undefined
}

function compareDocumentHighlights(
  left: SemanticDocumentHighlight,
  right: SemanticDocumentHighlight,
): number {
  return left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
}

function unionSemanticRanges(
  left: SemanticTextRange,
  right: SemanticTextRange,
): SemanticTextRange {
  const start = compareSemanticPositions(
    left.startLine,
    left.startColumn,
    right.startLine,
    right.startColumn,
  ) <= 0
    ? { line: left.startLine, column: left.startColumn }
    : { line: right.startLine, column: right.startColumn }
  const end = compareSemanticPositions(
    left.endLine,
    left.endColumn,
    right.endLine,
    right.endColumn,
  ) >= 0
    ? { line: left.endLine, column: left.endColumn }
    : { line: right.endLine, column: right.endColumn }
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  }
}

function compareSemanticPositions(
  leftLine: number,
  leftColumn: number,
  rightLine: number,
  rightColumn: number,
): number {
  return leftLine - rightLine || leftColumn - rightColumn
}

function compareSemanticRanges(
  left: SemanticTextRange,
  right: SemanticTextRange,
): number {
  return compareSemanticPositions(
    left.startLine,
    left.startColumn,
    right.startLine,
    right.startColumn,
  ) || compareSemanticPositions(
    left.endLine,
    left.endColumn,
    right.endLine,
    right.endColumn,
  )
}

function semanticRangeKey(range: SemanticTextRange): string {
  return [
    range.startLine,
    range.startColumn,
    range.endLine,
    range.endColumn,
  ].join(":")
}

function callHierarchyItemKey(item: SemanticCallHierarchyItemInfo): string {
  return JSON.stringify([
    item.path,
    item.selectionRange.startLine,
    item.selectionRange.startColumn,
    item.selectionRange.endLine,
    item.selectionRange.endColumn,
    item.name,
    item.kind,
  ])
}

function compareCallHierarchyItems(
  left: SemanticCallHierarchyItemInfo,
  right: SemanticCallHierarchyItemInfo,
): number {
  return compareOrdinalStrings(left.path, right.path)
    || compareSemanticRanges(left.selectionRange, right.selectionRange)
    || compareOrdinalStrings(left.name, right.name)
    || compareOrdinalStrings(left.kind, right.kind)
}

function compareOrdinalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function fingerprintSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex")
}

function sameCallHierarchyItem(
  left: SemanticCallHierarchyItemInfo,
  right: SemanticCallHierarchyItemInfo,
): boolean {
  return left.path === path.resolve(right.path)
    && left.name === right.name
    && left.kind === right.kind
    && sameTextRange(left.selectionRange, right.selectionRange)
}

function safeRead(filePath: string): string | null {
  let descriptor: number | undefined
  try {
    const initial = fs.lstatSync(filePath)
    if (!initial.isFile() && !initial.isSymbolicLink()) return null
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0),
    )
    const before = fs.fstatSync(descriptor)
    if (!before.isFile() || !isBoundedSourceSize(before.size)) return null
    const bytes = Buffer.allocUnsafe(before.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const bytesRead = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    const after = fs.fstatSync(descriptor)
    if (offset !== before.size || !sameSourceStat(before, after)) return null
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes.subarray(0, offset))
  } catch {
    return null
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor)
      } catch {
        // The read already failed closed.
      }
    }
  }
}

function isRegularBoundedFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath)
    return stat.isFile() && isBoundedSourceSize(stat.size)
  } catch {
    return false
  }
}

function isBoundedSourceSize(size: number): boolean {
  return Number.isSafeInteger(size) && size >= 0 && size <= MAX_SOURCE_FILE_BYTES
}

function sameSourceStat(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
}

function cacheLimit(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0 || value > fallback) {
    throw new RangeError(`${label} must be an integer between 0 and ${fallback}`)
  }
  return value
}

function isWithinRoot(rootPath: string, filePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function callHierarchyPathFailure(
  rootPath: string,
  filePath: string,
  allowMissingSource: boolean,
): SemanticCallHierarchyFailureReason | undefined {
  if (!isWithinRoot(rootPath, filePath)) return "source-outside-workspace"
  try {
    const realRoot = fs.realpathSync(rootPath)
    const realSource = allowMissingSource
      ? prospectiveRealPathSync(filePath)
      : fs.realpathSync(filePath)
    return isWithinRoot(realRoot, realSource) ? undefined : "source-outside-workspace"
  } catch {
    return "source-unavailable"
  }
}

function prospectiveRealPathSync(filePath: string): string {
  let cursor = filePath
  const suffix: string[] = []
  while (true) {
    try {
      return path.join(fs.realpathSync(cursor), ...suffix)
    } catch {
      const parent = path.dirname(cursor)
      if (parent === cursor) throw new Error(`No existing ancestor for ${filePath}`)
      suffix.unshift(path.basename(cursor))
      cursor = parent
    }
  }
}

function compareTextEdits(
  left: { path: string; range: SemanticTextRange },
  right: { path: string; range: SemanticTextRange },
) {
  return left.path.localeCompare(right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
}

function hasOverlappingEdits(
  edits: Array<{ path: string; range: SemanticTextRange }>,
  work: CooperativeWork,
): boolean {
  for (let index = 1; index < edits.length; index += 1) {
    work.item()
    const previous = edits[index - 1]
    const current = edits[index]
    if (previous.path !== current.path) continue
    if (
      current.range.startLine < previous.range.endLine
      || (
        current.range.startLine === previous.range.endLine
        && current.range.startColumn < previous.range.endColumn
      )
    ) return true
  }
  return false
}

function typescriptSpanKey(filePath: string, span: ts.TextSpan): string {
  return `${filePath}:${span.start}:${span.length}`
}

function exactSourceRange(
  sourceView: ScriptRecord | LazySnapshotRecord,
  span: ts.TextSpan,
): SemanticTextRange | undefined {
  if (
    !Number.isSafeInteger(span.start)
    || !Number.isSafeInteger(span.length)
    || span.start < 0
    || span.length <= 0
    || span.start + span.length > sourceView.content.length
  ) return undefined
  const sourceStart = sourceView.virtualDocument.toSourceOffset(span.start)
  const sourceEnd = sourceView.virtualDocument.toSourceOffset(span.start + span.length)
  if (
    sourceEnd <= sourceStart
    || sourceView.virtualDocument.toGeneratedOffset(sourceStart) !== span.start
    || sourceView.virtualDocument.toGeneratedOffset(sourceEnd) !== span.start + span.length
    || sourceView.content.slice(span.start, span.start + span.length)
      !== sourceView.virtualDocument.sourceContent.slice(sourceStart, sourceEnd)
  ) return undefined
  return sourceView.virtualDocument.generatedSpanToSourceRange(span.start, span.length)
}

function exactSourceBoundaryRange(
  sourceView: ScriptRecord | LazySnapshotRecord,
  span: ts.TextSpan,
): SemanticTextRange | undefined {
  if (
    !Number.isSafeInteger(span.start)
    || !Number.isSafeInteger(span.length)
    || span.start < 0
    || span.length <= 0
    || span.start + span.length > sourceView.content.length
  ) return undefined
  const generatedEnd = span.start + span.length
  const sourceStart = sourceView.virtualDocument.toSourceOffset(span.start)
  const sourceEnd = sourceView.virtualDocument.toSourceOffset(generatedEnd)
  if (
    sourceEnd <= sourceStart
    || sourceView.virtualDocument.toGeneratedOffset(sourceStart) !== span.start
    || sourceView.virtualDocument.toGeneratedOffset(sourceEnd) !== generatedEnd
  ) return undefined
  return spanToRange(
    sourceView.virtualDocument.sourceContent,
    sourceStart,
    sourceEnd - sourceStart,
  )
}

function exactSourceOffset(
  content: string,
  line: number,
  column: number,
): number | undefined {
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) {
    return undefined
  }
  const offset = lineColumnToOffset(content, line, column)
  const resolved = offsetToLineColumn(content, offset)
  return resolved.line === line && resolved.column === column ? offset : undefined
}

function exactSourcePosition(
  script: ScriptRecord,
  generatedOffset: number,
): number | undefined {
  if (
    !Number.isSafeInteger(generatedOffset)
    || generatedOffset < 0
    || generatedOffset > script.content.length
  ) return undefined
  const sourceOffset = script.virtualDocument.toSourceOffset(generatedOffset)
  return script.virtualDocument.toGeneratedOffset(sourceOffset) === generatedOffset
    ? sourceOffset
    : undefined
}

function semanticLocationKey(filePath: string, range: SemanticTextRange): string {
  return [
    filePath,
    range.startLine,
    range.startColumn,
    range.endLine,
    range.endColumn,
  ].join(":")
}

function compareSemanticLocations(
  left: SemanticDefinitionCandidate,
  right: SemanticDefinitionCandidate,
): number {
  return left.path.localeCompare(right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
}

function isIdentifierText(value: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, value)
  return scanner.scan() === ts.SyntaxKind.Identifier
    && scanner.scan() === ts.SyntaxKind.EndOfFileToken
}

function preflightTopLevelClassRenameConflict(
  service: ts.LanguageService,
  filePath: string,
  triggerOffset: number,
  newName: string,
): RenameConflictPreflight {
  const program = service.getProgram()
  const sourceFile = program?.getSourceFile(filePath)
  if (!program || !sourceFile) return "indeterminate"
  const target = identifierAtPosition(sourceFile, triggerOffset)
  if (
    !target
    || !ts.isClassDeclaration(target.parent)
    || target.parent.name !== target
    || !ts.isSourceFile(target.parent.parent)
  ) return "not-applicable"

  const checker = program.getTypeChecker()
  const targetSymbol = checker.getSymbolAtLocation(target)
  if (!targetSymbol) return "indeterminate"
  const canonicalTarget = canonicalExportSymbol(checker, targetSymbol)
  const candidate = checker.resolveName(
    newName,
    target,
    ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace,
    true,
  )
  if (!candidate) return "clear"
  const canonicalCandidate = canonicalExportSymbol(checker, candidate)
  if (canonicalCandidate === canonicalTarget) return "clear"
  if (!(canonicalCandidate.flags & ts.SymbolFlags.ClassExcludes)) return "clear"
  if (canonicalCandidate.declarations?.some((declaration) => (
    declaration.getSourceFile() === sourceFile
  ))) return "conflict"
  return "clear"
}

function canonicalExportSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return checker.getMergedSymbol(checker.getExportSymbolOfSymbol(symbol))
}

function identifierAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
): ts.Identifier | undefined {
  let result: ts.Identifier | undefined
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) return
    if (ts.isIdentifier(node)) result = node
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}
