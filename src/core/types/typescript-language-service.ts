import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

import { discoverProjectSdk, type ProjectSdkSelection } from "../sdk/project-sdk.js"
import { LocalPackageResolver } from "../sdk/local-package-resolver.js"
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
  SemanticCompletionDiscoveryCandidate,
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
import { officialDocumentRegistryFor } from "../../semantic/backends/ohos-typescript/registry-pool.js"
import { officialEtsCompilerOptions } from "../../semantic/backends/ohos-typescript/ets-options.js"
import type {
  ProjectFileAccessPort,
  ProjectFileAdmissionToken,
  ProjectMembershipSnapshot,
  SemanticWorkspaceView,
} from "../workspace/document-store.js"
import { CooperativeWork } from "./cooperative-work.js"
import { createSourceDocument, type SourceDocument } from "./source-document.js"
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
const MAX_MODULE_EXPORT_COMPLETION_SCAN = 4096
const RANKED_TYPESCRIPT_COMPLETION_SORT_PREFIX = "1000"
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
  virtualDocument: SourceDocument
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
  virtualDocument: SourceDocument
  snapshot: ts.IScriptSnapshot
  sourceFingerprint: string
  bytes: number
  admissionToken?: ProjectFileAdmissionToken
}

const COMPLETION_PREFIX_MATCH = 0
const COMPLETION_CAMEL_MATCH = 1
const COMPLETION_SUBSEQUENCE_MATCH = 2

type CompletionMatchQuality =
  | typeof COMPLETION_PREFIX_MATCH
  | typeof COMPLETION_CAMEL_MATCH
  | typeof COMPLETION_SUBSEQUENCE_MATCH

interface CompletionCandidate {
  entry: CompletionEntryCompat
  filterText: string | undefined
  providerIndex: number
  quality: CompletionMatchQuality
}

type CompletionEntryCompat = ts.CompletionEntry & {
  filterText?: string
  commitCharacters?: string[]
}

type CompletionInfoCompat = ts.CompletionInfo & {
  entries: CompletionEntryCompat[]
  defaultCommitCharacters?: string[]
}

function completionEntryIdentity(entry: CompletionEntryCompat): string {
  return `${entry.name}\u0000${entry.source ?? ""}`
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
  onSdkSelected?: (workspaceRoot: string, selection: ProjectSdkSelection) => void
  packageResolver?: LocalPackageResolver
  checkpoint?: () => void
  hostCancellationToken?: ts.HostCancellationToken
  readSourceFile?: (filePath: string) => string | null
  projectFileAccess?: ProjectFileAccessPort
  lazySnapshotLimits?: {
    maxFiles?: number
    maxBytes?: number
  }
  sdkConfiguration?: unknown
}

export class TypeScriptLanguageServiceEngine {
  private readonly scripts = new Map<string, ScriptRecord>()
  private readonly projectMembershipPaths = new Set<string>()
  private semanticRootPaths: Set<string> | undefined
  private readonly projectContentVersions = new Map<string, number>()
  private readonly lazySnapshots = new Map<string, LazySnapshotRecord>()
  private readonly sdkDeclarationPaths: string[]
  private readonly sdkRoot: string | null
  private readonly sdkSelection: ProjectSdkSelection
  private readonly workspacePhysicalRoot: string | undefined
  private readonly sdkPhysicalRoot: string | undefined
  private membershipFileNames: string[]
  private combinedFileNames: string[] | undefined
  private readonly options: ts.CompilerOptions
  private readonly service: ts.LanguageService
  private readonly checkpoint: (() => void) | undefined
  private readonly readSourceFile: (filePath: string) => string | null
  private readonly projectFileAccess: ProjectFileAccessPort | undefined
  private readonly maxLazySnapshots: number
  private readonly maxLazySnapshotBytes: number
  private accessClock = 0
  private generation = 0
  private scriptBytes = 0
  private lazySnapshotBytes = 0
  private projectMembershipStatus: ProjectMembershipSnapshot["status"] | "none" = "none"
  private projectMembershipReason: ProjectMembershipSnapshot["reason"]
  private projectMembershipRevision = 0
  private projectMembershipRootId: string
  private projectMembershipSourceUnavailable = false
  private projectContentRevision = 0
  private readonly packageResolver: LocalPackageResolver
  private overlayPaths: ReadonlyMap<string, string> | undefined
  private relativeModuleResolutionWork = 0
  private readonly relativeResolutionCheckpoint = (): void => {
    this.relativeModuleResolutionWork += 1
    if (this.relativeModuleResolutionWork % 64 === 0) this.checkpoint?.()
  }
  private readonly relativeResolutionFailures = new Map<
    string,
    Map<string, SemanticCallHierarchyFailureReason>
  >()

  constructor(
    private readonly rootPath: string,
    {
      packageResolver = new LocalPackageResolver(),
      onSdkSelected,
      checkpoint,
      hostCancellationToken,
      readSourceFile = safeRead,
      projectFileAccess,
      lazySnapshotLimits = {},
      sdkConfiguration,
    }: TypeScriptLanguageServiceEngineOptions = {},
  ) {
    this.packageResolver = packageResolver
    this.checkpoint = checkpoint
    this.readSourceFile = readSourceFile
    this.projectFileAccess = projectFileAccess
    this.projectMembershipRootId = path.resolve(rootPath)
    this.workspacePhysicalRoot = canonicalExistingPath(rootPath)
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
    const sdk = discoverProjectSdk(
      rootPath,
      process.env.ARKLINE_HARMONY_SDK_PATH,
      sdkConfiguration,
    )
    this.options = {
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      experimentalDecorators: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      ...officialEtsCompilerOptions(sdk.path),
    }
    this.sdkSelection = sdk
    this.sdkRoot = sdk.path
    this.sdkPhysicalRoot = this.sdkRoot ? canonicalExistingPath(this.sdkRoot) : undefined
    onSdkSelected?.(rootPath, sdk)
    this.sdkDeclarationPaths = discoverSdkAmbientDeclarations(this.sdkRoot)
    this.membershipFileNames = [...this.sdkDeclarationPaths]
    this.service = ts.createLanguageService(
      this.createHost(hostCancellationToken),
      officialDocumentRegistryFor(sdk),
    )
  }

  prepare(workspace: SemanticWorkspaceView): SemanticTypeEngineState {
    this.overlayPaths = workspace.overlayPaths
    this.projectMembershipRootId = workspace.canonicalRootId ?? path.resolve(workspace.rootPath)
    const protectedPaths = new Set<string>()
    this.updateProjectMembership(workspace.projectMembership)
    this.updateSemanticRootPaths(workspace.semanticRootPaths)
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

  programFileStats(): {
    programSourceFiles: number
    programProjectFiles: number
    sdkSourceFiles: number
    projectTextCodeUnits: number
    sdkTextCodeUnits: number
    otherSourceFiles: number
    otherTextCodeUnits: number
  } {
    const sourceFiles = this.service.getProgram()?.getSourceFiles() ?? []
    let programProjectFiles = 0
    let sdkSourceFiles = 0
    let projectTextCodeUnits = 0
    let sdkTextCodeUnits = 0
    let otherSourceFiles = 0
    let otherTextCodeUnits = 0
    for (const sourceFile of sourceFiles) {
      const filePath = path.resolve(sourceFile.fileName)
      if (this.sdkRoot && isWithinRoot(this.sdkRoot, filePath)) {
        sdkSourceFiles += 1
        sdkTextCodeUnits += sourceFile.text.length
      } else if (isWithinRoot(this.rootPath, filePath)) {
        programProjectFiles += 1
        projectTextCodeUnits += sourceFile.text.length
      } else {
        otherSourceFiles += 1
        otherTextCodeUnits += sourceFile.text.length
      }
    }
    return {
      programSourceFiles: sourceFiles.length,
      programProjectFiles,
      sdkSourceFiles,
      projectTextCodeUnits,
      sdkTextCodeUnits,
      otherSourceFiles,
      otherTextCodeUnits,
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
    const includeModuleExports = !memberAccess
      && hasMinimumCodePointLength(prefix, MIN_MODULE_EXPORT_PREFIX_LENGTH)
    work.boundary()
    const info = this.service.getCompletionsAtPosition(filePath, offset, {
      includeCompletionsForImportStatements: true,
      includeCompletionsForModuleExports: includeModuleExports,
      includeCompletionsWithInsertText: true,
      ...(position.allowSnippets
        ? {
            includeCompletionsWithSnippetText: true,
            includeCompletionsWithClassMemberSnippets: true,
            includeCompletionsWithObjectLiteralMethodSnippets: true,
          }
        : {}),
    }) as CompletionInfoCompat | undefined
    work.boundary()
    if (!info) return work.finish({ items: [], isIncomplete: false })
    const completionEntries = arktsStructThisCompletionEntries(
      this.service,
      filePath,
      offset,
      info.entries,
    )
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
    let tierRetainedCount = 0
    let tierSortText = ""
    let hasTier = false
    let matchingOverflow = false
    let truncated = false
    let scannedEntries = 0
    let stoppedEarly = false
    const rankMatchQualityAcrossSortTiers = includeModuleExports
    const flushTier = (): void => {
      const remaining = MAX_COMPLETIONS - candidates.length
      const chosen: CompletionCandidate[] = []
      for (const bucket of tierBuckets) {
        const available = remaining - chosen.length
        if (available <= 0) break
        chosen.push(...bucket.slice(0, available))
      }
      if (tierMatchCount > chosen.length) matchingOverflow = true
      if (!rankMatchQualityAcrossSortTiers) {
        chosen.sort(work.comparator((left, right) => left.providerIndex - right.providerIndex))
      }
      candidates.push(...chosen)
      tierBuckets = [[], [], []]
      tierMatchCount = 0
      tierRetainedCount = 0
    }
    for (let providerIndex = 0; providerIndex < completionEntries.length; providerIndex += 1) {
      if (
        rankMatchQualityAcrossSortTiers
        && scannedEntries >= MAX_MODULE_EXPORT_COMPLETION_SCAN
      ) {
        flushTier()
        truncated = true
        stoppedEarly = true
        break
      }
      const entry = completionEntries[providerIndex] as CompletionEntryCompat
      scannedEntries += 1
      if (!hasTier) {
        tierSortText = entry.sortText
        hasTier = true
      } else if (!rankMatchQualityAcrossSortTiers && entry.sortText !== tierSortText) {
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
        if (tierRetainedCount < remaining) {
          bucket.push({ entry, filterText, providerIndex, quality })
          tierRetainedCount += 1
        } else {
          for (let weakerQuality = COMPLETION_SUBSEQUENCE_MATCH;
            weakerQuality > quality; weakerQuality -= 1) {
            const weakerBucket = tierBuckets[weakerQuality]
            if (weakerBucket.length === 0) continue
            weakerBucket.pop()
            bucket.push({ entry, filterText, providerIndex, quality })
            break
          }
        }
      }
      work.item()
      if (
        quality === COMPLETION_PREFIX_MATCH
        && tierBuckets[COMPLETION_PREFIX_MATCH].length >= MAX_COMPLETIONS - candidates.length
      ) {
        flushTier()
        truncated = scannedEntries < completionEntries.length
        stoppedEarly = true
        break
      }
    }
    if (!stoppedEarly && hasTier) flushTier()
    if (position.completionDiscovery) {
      const discovered = this.validatedDiscoveryEntries(
        filePath,
        offset,
        completionEntries,
        position.completionDiscovery.candidates,
        normalizedPrefix,
        work,
      )
      const retained = new Set(candidates.map(({ entry }) => completionEntryIdentity(entry)))
      for (const candidate of discovered) {
        const identity = completionEntryIdentity(candidate.entry)
        if (retained.has(identity)) continue
        if (candidates.length >= MAX_COMPLETIONS) {
          matchingOverflow = true
          break
        }
        candidates.push(candidate)
        retained.add(identity)
      }
    }
    const objectLiteralPropertyCompletion = candidates.some(({ entry }) => (
      entry.kind === ts.ScriptElementKind.memberVariableElement
    )) && isObjectLiteralPropertyCompletion(this.service, filePath, offset, work)
    const completions: SemanticCompletionItem[] = candidates.map(({
      entry,
      filterText,
      providerIndex,
      quality,
    }) => {
      const completion: SemanticCompletionItem = {
        label: entry.name,
        detail: typescriptTypeDetail(entry, filePath),
        kind: completionKind(entry.kind, objectLiteralPropertyCompletion),
        insertText: entry.insertText,
        filterText,
        sortText: rankMatchQualityAcrossSortTiers
          ? `${RANKED_TYPESCRIPT_COMPLETION_SORT_PREFIX}:${quality}:${String(providerIndex).padStart(10, "0")}`
          : entry.sortText,
        commitCharacters: entry.commitCharacters
          ?? info.defaultCommitCharacters
          ?? defaultCompletionCommitCharacters(entry.kind),
        isSnippet: entry.isSnippet,
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
      isIncomplete: info.isIncomplete === true
        || truncated
        || matchingOverflow
        || position.completionDiscovery?.incomplete === true,
    })
  }

  private validatedDiscoveryEntries(
    filePath: string,
    offset: number,
    entries: readonly CompletionEntryCompat[],
    discoveryCandidates: readonly SemanticCompletionDiscoveryCandidate[],
    normalizedPrefix: string,
    work: CooperativeWork,
  ): CompletionCandidate[] {
    const byName = new Map<string, SemanticCompletionDiscoveryCandidate[]>()
    for (const candidate of discoveryCandidates) {
      const existing = byName.get(candidate.exportedName)
      if (existing) existing.push(candidate)
      else byName.set(candidate.exportedName, [candidate])
    }
    if (byName.size === 0) return []

    const validated: CompletionCandidate[] = []
    for (let providerIndex = 0; providerIndex < entries.length; providerIndex += 1) {
      const entry = entries[providerIndex]
      const indexed = byName.get(entry.name)
      if (!indexed || typeof entry.source !== "string") continue
      const identityMatch = indexed.some(candidate => (
        candidate.importSpecifier === entry.source || candidate.uri === entry.source
      ))
      if (!identityMatch) continue
      const quality = completionMatchQuality(entry.filterText ?? entry.name, normalizedPrefix)
      if (quality === undefined) continue
      const details = this.service.getCompletionEntryDetails(
        filePath,
        offset,
        entry.name,
        {},
        entry.source,
        { includeCompletionsForModuleExports: true },
        entry.data as ts.CompletionEntryData | undefined,
      )
      work.item()
      if (!details) continue
      validated.push({
        entry,
        filterText: entry.filterText,
        providerIndex,
        quality,
      })
      if (validated.length >= MAX_COMPLETIONS) break
    }
    return validated
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
        entrySource,
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
    const resolutionFailure = this.rejectedOutgoingCallFailure(filePath, generatedOffset)
    if (resolutionFailure) return { status: "incomplete", reason: resolutionFailure }
    return { status: "complete", calls: normalized }
  }

  private rejectedOutgoingCallFailure(
    filePath: string,
    generatedOffset: number,
  ): SemanticCallHierarchyFailureReason | undefined {
    if (this.relativeResolutionFailures.size === 0) return undefined
    const program = this.service.getProgram()
    const sourceFile = program?.getSourceFile(filePath)
    if (!program || !sourceFile) {
      return strongestCallHierarchyFailure(
        this.relativeResolutionFailures.get(filePath)?.values() ?? [],
      )
    }
    const work = new CooperativeWork(this.checkpoint)
    const checker = program.getTypeChecker()
    const execution = callHierarchyExecutionAtPosition(sourceFile, generatedOffset, checker, work)
    if (!execution) {
      return strongestCallHierarchyFailure(
        this.relativeResolutionFailures.get(filePath)?.values() ?? [],
      )
    }
    if (execution.roots.length === 0) return work.finish(undefined)
    let failure: SemanticCallHierarchyFailureReason | undefined
    const visit = (node: ts.Node): void => {
      if (failure === "source-outside-workspace") return
      work.item()
      if (isNestedCallHierarchyOwner(node)) {
        if (ts.isClassLike(node)) {
          for (const member of node.members) {
            if (member.name && ts.isComputedPropertyName(member.name)) {
              visit(member.name.expression)
            }
          }
        }
        return
      }
      const expression = ts.isCallExpression(node) || ts.isNewExpression(node)
        ? node.expression
        : ts.isTaggedTemplateExpression(node)
          ? node.tag
          : undefined
      if (expression) {
        const rejected = rejectedValueImportFailure(
          checker,
          expression,
          this.relativeResolutionFailures,
          work,
        )
        if (rejected === "source-outside-workspace" || (rejected && !failure)) {
          failure = rejected
        }
      }
      ts.forEachChild(node, visit)
    }
    for (const root of execution.roots) visit(root)
    return work.finish(failure)
  }

  incomingCalls(
    position: SemanticDocumentPosition,
    item: SemanticCallHierarchyItemInfo,
  ): SemanticCallHierarchyIncomingQueryResult {
    const initialMembershipFailure = this.projectMembershipFailure()
    if (initialMembershipFailure) return initialMembershipFailure
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return { status: "incomplete", reason: "source-unavailable" }
    const prepared = this.prepareCallHierarchyAt(position)
    const prepareMembershipFailure = this.projectMembershipFailure()
    if (prepareMembershipFailure) return prepareMembershipFailure
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
    const callsMembershipFailure = this.projectMembershipFailure()
    if (callsMembershipFailure) return callsMembershipFailure
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
    const finalMembershipFailure = this.projectMembershipFailure()
    if (finalMembershipFailure) return finalMembershipFailure
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
        const label = hint.text || inlayHintDisplayText(
          (hint as ts.InlayHint & { displayParts?: readonly { text: string }[] }).displayParts,
          work,
        )
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
    if (items.length === 0) {
      const struct = this.prepareArktsStructCallHierarchy(filePath, script, generatedOffset)
      if (struct) return { status: "complete", items: [struct] }
    }
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

  private prepareArktsStructCallHierarchy(
    filePath: string,
    script: ScriptRecord,
    generatedOffset: number,
  ): SemanticCallHierarchyItemInfo | undefined {
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath)
    if (!sourceFile) return undefined
    let match: ts.StructDeclaration | undefined
    const visit = (node: ts.Node): void => {
      if (match) return
      if (ts.isStructDeclaration(node) && node.name) {
        const nameStart = node.name.getStart(sourceFile)
        if (generatedOffset >= nameStart && generatedOffset <= node.name.end) {
          match = node
          return
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    if (!match?.name) return undefined
    const selectionRange = script.virtualDocument.generatedSpanToSourceRange(
      match.name.getStart(sourceFile),
      match.name.getWidth(sourceFile),
    )
    const range = script.virtualDocument.generatedSpanToSourceRange(
      match.getStart(sourceFile),
      match.getWidth(sourceFile),
    )
    return {
      path: filePath,
      name: match.name.text,
      kind: "struct",
      sourceFingerprint: script.sourceFingerprint,
      range: unionSemanticRanges(range, selectionRange),
      selectionRange,
    }
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
    ) => readonly {
      fileName: string
      textSpan: ts.TextSpan
      name?: string
      kind?: ts.ScriptElementKind
    }[] | undefined,
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
        ?? (this.projectMembershipPaths.has(targetPath) ? null : safeRead(targetPath))
      if (content !== null) {
        const textSpan = normalizedDefinitionSpan(
          this.service.getProgram()?.getSourceFile(targetPath),
          content,
          definition,
        )
        const range = targetScript
          ? targetScript.virtualDocument.generatedSpanToSourceRange(
              textSpan.start,
              textSpan.length,
            )
          : targetLazy
            ? targetLazy.virtualDocument.generatedSpanToSourceRange(
                textSpan.start,
                textSpan.length,
              )
            : spanToRange(content, textSpan.start, textSpan.length)
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
      const targetLazy = targetScript ? undefined : this.loadLazySnapshot(targetPath)
      const content = targetScript?.sourceContent
        ?? targetLazy?.virtualDocument.sourceContent
        ?? (this.projectMembershipPaths.has(targetPath) ? null : safeRead(targetPath))
      if (content === null) return []
      const targetOffset = targetScript
        ? targetScript.virtualDocument.toSourceOffset(reference.textSpan.start)
        : targetLazy
          ? targetLazy.virtualDocument.toSourceOffset(reference.textSpan.start)
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
    const initialMembershipFailure = this.projectMembershipFailure()
    if (initialMembershipFailure) return work.finish(initialMembershipFailure)
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish({ status: "incomplete", reason: "source-unavailable" })
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    work.boundary()
    const definitions = this.service.getDefinitionAtPosition(filePath, offset) ?? []
    work.boundary()
    const definitionMembershipFailure = this.projectMembershipFailure()
    if (definitionMembershipFailure) return work.finish(definitionMembershipFailure)
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
      const referenceMembershipFailure = this.projectMembershipFailure()
      if (referenceMembershipFailure) return work.finish(referenceMembershipFailure)
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
    const finalMembershipFailure = this.projectMembershipFailure()
    if (finalMembershipFailure) return work.finish(finalMembershipFailure)
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
    const diagnostics: SemanticDiagnostic[] = mapTypescriptDiagnosticGroups(
      filePath,
      script.virtualDocument,
      [syntacticDiagnostics, semanticDiagnostics],
      work,
    )
    if (this.sdkSelection.source === "configuration" && !this.sdkSelection.ready) {
      diagnostics.unshift({
        source: "language",
        severity: "error",
        code: "arkts.sdk.configuration",
        path: filePath,
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
        message: "The configured ArkTS SDK path is invalid. Set initializationOptions.sdk.path or arkts.sdk.path to an absolute OpenHarmony SDK directory.",
      })
    }
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
    const initialMembershipFailure = this.projectMembershipFailure()
    if (initialMembershipFailure) return initialMembershipFailure
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return { status: "incomplete", reason: "source-unavailable" }
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const info = this.service.getRenameInfo(filePath, offset, { allowRenameOfImportPath: false })
    const renameInfoMembershipFailure = this.projectMembershipFailure()
    if (renameInfoMembershipFailure) return renameInfoMembershipFailure
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
    const initialMembershipFailure = this.projectMembershipFailure()
    if (initialMembershipFailure) return work.finish(initialMembershipFailure)
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return work.finish({ status: "incomplete", reason: "source-unavailable" })
    if (!isIdentifierText(newName)) return work.finish({ status: "invalid-name" })
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    work.boundary()
    const info = this.service.getRenameInfo(filePath, offset, { allowRenameOfImportPath: false })
    work.boundary()
    const renameInfoMembershipFailure = this.projectMembershipFailure()
    if (renameInfoMembershipFailure) return work.finish(renameInfoMembershipFailure)
    if (!info.canRename) return work.finish({ status: "unavailable" })
    work.boundary()
    const conflict = preflightTopLevelClassRenameConflict(
      this.service,
      filePath,
      info.triggerSpan.start,
      newName,
    )
    work.boundary()
    const preflightMembershipFailure = this.projectMembershipFailure()
    if (preflightMembershipFailure) return work.finish(preflightMembershipFailure)
    if (conflict === "conflict" || conflict === "indeterminate") {
      return work.finish({ status: "unavailable" })
    }
    work.boundary()
    const locations = this.service.findRenameLocations(filePath, offset, false, false, true) ?? []
    work.boundary()
    const locationsMembershipFailure = this.projectMembershipFailure()
    if (locationsMembershipFailure) return work.finish(locationsMembershipFailure)
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
    const finalMembershipFailure = this.projectMembershipFailure()
    if (finalMembershipFailure) return work.finish(finalMembershipFailure)
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
    this.overlayPaths = undefined
    this.scripts.clear()
    this.projectMembershipPaths.clear()
    this.semanticRootPaths = undefined
    this.projectContentVersions.clear()
    this.projectMembershipSourceUnavailable = false
    this.relativeResolutionFailures.clear()
    this.lazySnapshots.clear()
    this.scriptBytes = 0
    this.lazySnapshotBytes = 0
  }

  trim(): void {
    this.service.cleanupSemanticCache()
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
      getScriptKind: (fileName) => fileName.endsWith(".ets")
        ? ts.ScriptKind.ETS
        : ts.ScriptKind.TS,
      getScriptSnapshot: (fileName) => {
        const filePath = path.resolve(fileName)
        const resident = this.scripts.get(filePath)
        if (resident) return ts.ScriptSnapshot.fromString(resident.content)
        const lazy = this.loadLazySnapshot(filePath)
        if (lazy) return lazy.snapshot
        if (this.projectMembershipPaths.has(filePath)) return undefined
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
        if (this.scripts.has(filePath)) return true
        if (this.projectMembershipPaths.has(filePath)) {
          return this.projectFileAccess
            ? this.projectFileAccess.tokenFor(
                this.projectMembershipRootId,
                this.projectMembershipRevision,
                filePath,
              ) !== undefined
            : isRegularBoundedFile(filePath)
        }
        return isRegularBoundedFile(filePath)
      },
      getDirectories: ts.sys.getDirectories,
      readDirectory: ts.sys.readDirectory,
      readFile: (fileName) => {
        const filePath = path.resolve(fileName)
        const resident = this.scripts.get(filePath)?.content
        if (resident !== undefined) return resident
        const lazy = this.loadLazySnapshot(filePath)?.content
        if (lazy !== undefined) return lazy
        if (this.projectMembershipPaths.has(filePath)) return undefined
        return safeRead(filePath) ?? undefined
      },
      resolveModuleNames: (names, containingFile) => {
        const resolvedContainingFile = path.resolve(containingFile)
        this.relativeResolutionFailures.delete(resolvedContainingFile)
        const boundaryRoot = names.some((name) => name.startsWith("."))
          ? this.relativeModuleBoundary(resolvedContainingFile)
          : undefined
        return names.map((name) => this.resolveModule(
          name,
          resolvedContainingFile,
          boundaryRoot,
        ))
      },
    }
  }

  private resolveModule(
    name: string,
    containingFile: string,
    relativeBoundaryRoot?: string,
  ): ts.ResolvedModule | undefined {
    if (!name.startsWith(".")) {
      const local = this.packageResolver.resolve(this.rootPath, containingFile, name, {
        checkpoint: this.checkpoint,
        hasOverlay: (filePath) => this.scripts.get(filePath)?.overlay === true,
        overlayPath: (physicalPath) => this.overlayPaths?.get(physicalPath),
      })
      if (local !== undefined) {
        return local.path
          ? ({ resolvedFileName: local.path, extension: moduleExtension(local.path) } as ts.ResolvedModule)
          : undefined
      }
      const sdkModule = this.sdkRoot ? resolveHarmonySdkModule(this.sdkRoot, name) : null
      if (sdkModule) {
        return ({
          resolvedFileName: sdkModule,
          extension: moduleExtension(sdkModule),
          isExternalLibraryImport: true,
        } as ts.ResolvedModule)
      }
      return ts.resolveModuleName(name, containingFile, this.options, ts.sys).resolvedModule
    }
    const base = path.resolve(path.dirname(containingFile), name)
    const candidates = /(?:\.d\.(?:ets|ts)|\.ets|\.tsx?)$/u.test(base)
      ? [base]
      : [
          base + ".ets",
          base + ".ts",
          base + ".tsx",
          base + ".d.ets",
          base + ".d.ts",
          path.join(base, "index.ets"),
          path.join(base, "index.ts"),
          path.join(base, "index.tsx"),
          path.join(base, "index.d.ets"),
          path.join(base, "index.d.ts"),
        ]
    const resolved = candidates.find((candidate) =>
      this.scripts.has(path.resolve(candidate)) || isRegularBoundedFile(candidate))
    const resolvedPath = resolved && path.resolve(resolved)
    const sourcePath = resolvedPath && relativeBoundaryRoot
      ? this.packageResolver.installedSourcePath(
        relativeBoundaryRoot,
        containingFile,
        resolvedPath,
        (physicalPath) => this.overlayPaths?.get(physicalPath)
          ?? (this.scripts.has(resolvedPath) ? resolvedPath : undefined),
        this.relativeResolutionCheckpoint,
      )
      : undefined
    if (!resolvedPath || !relativeBoundaryRoot) this.relativeResolutionCheckpoint()
    if (resolvedPath && !sourcePath) {
      const failure = callHierarchyPathFailure(
        relativeBoundaryRoot ?? this.rootPath,
        resolvedPath,
        this.scripts.get(resolvedPath)?.overlay === true,
      ) ?? "source-unavailable"
      if (this.scripts.has(containingFile)) {
        let failures = this.relativeResolutionFailures.get(containingFile)
        if (!failures) {
          failures = new Map()
          this.relativeResolutionFailures.set(containingFile, failures)
        }
        const previous = failures.get(name)
        if (previous !== "source-outside-workspace" || failure === "source-outside-workspace") {
          failures.set(name, failure)
        }
      }
    }
    return sourcePath
      ? ({ resolvedFileName: sourcePath, extension: moduleExtension(sourcePath) } as ts.ResolvedModule)
      : undefined
  }

  private relativeModuleBoundary(containingFile: string): string | undefined {
    let physicalContainingFile: string
    try {
      physicalContainingFile = this.scripts.has(containingFile)
        ? prospectiveRealPathSync(containingFile)
        : fs.realpathSync.native(containingFile)
    } catch {
      return undefined
    }
    if (isWithinRoot(this.rootPath, containingFile)) {
      return this.workspacePhysicalRoot
        && isWithinRoot(this.workspacePhysicalRoot, physicalContainingFile)
        ? this.rootPath
        : undefined
    }
    if (
      this.workspacePhysicalRoot
      && isWithinRoot(this.workspacePhysicalRoot, physicalContainingFile)
    ) return this.rootPath
    if (
      this.sdkRoot
      && this.sdkPhysicalRoot
      && isWithinRoot(this.sdkRoot, containingFile)
      && isWithinRoot(this.sdkPhysicalRoot, physicalContainingFile)
    ) return this.sdkRoot
    return undefined
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
    const virtualDocument = createSourceDocument(content)
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
    this.relativeResolutionFailures.clear()
    this.generation += 1
  }

  private removeScript(filePath: string): void {
    const previous = this.scripts.get(filePath)
    if (!previous) return
    this.scripts.delete(filePath)
    if (!this.projectMembershipPaths.has(filePath)) this.combinedFileNames = undefined
    this.scriptBytes -= previous.bytes
    this.relativeResolutionFailures.clear()
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
    this.rebuildMembershipFileNames()
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
    this.projectMembershipSourceUnavailable = false
    if (membership.status === "partial") {
      for (const filePath of this.projectMembershipPaths) this.removeScript(filePath)
      this.projectMembershipPaths.clear()
      this.projectContentVersions.clear()
      this.clearLazySnapshots()
      this.rebuildMembershipFileNames()
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
    this.rebuildMembershipFileNames()
    this.generation += 1
  }

  private updateSemanticRootPaths(paths: readonly string[] | undefined): void {
    const next = paths === undefined
      ? undefined
      : new Set(paths.map(filePath => path.resolve(filePath)))
    if (samePathSet(this.semanticRootPaths, next)) return
    this.semanticRootPaths = next
    this.rebuildMembershipFileNames()
    this.relativeResolutionFailures.clear()
    this.generation += 1
  }

  private rebuildMembershipFileNames(): void {
    const roots = this.projectMembershipStatus === "complete"
      ? this.semanticRootPaths ?? this.projectMembershipPaths
      : new Set<string>()
    this.membershipFileNames = [
      ...roots,
      ...this.sdkDeclarationPaths.filter(filePath => !roots.has(filePath)),
    ]
    this.combinedFileNames = undefined
  }

  private updateProjectContent(
    contentRevision: number | undefined,
    changedPaths: string[] | undefined,
  ): void {
    if (contentRevision !== undefined) this.projectContentRevision = contentRevision
    if ((changedPaths?.length ?? 0) > 0) this.relativeResolutionFailures.clear()
    for (const changedPath of changedPaths ?? []) {
      const filePath = path.resolve(changedPath)
      this.projectContentVersions.set(filePath, this.projectContentRevision)
      this.removeScript(filePath)
      this.removeLazySnapshot(filePath)
    }
  }

  private loadLazySnapshot(filePath: string): LazySnapshotRecord | undefined {
    if (!this.projectMembershipPaths.has(filePath)) return undefined
    const admissionToken = this.projectFileAccess?.tokenFor(
      this.projectMembershipRootId,
      this.projectMembershipRevision,
      filePath,
    )
    if (this.projectFileAccess && admissionToken === undefined) {
      this.removeLazySnapshot(filePath)
      this.projectMembershipSourceUnavailable = true
      return undefined
    }
    const cached = this.lazySnapshots.get(filePath)
    if (cached && (!this.projectFileAccess || cached.admissionToken === admissionToken)) {
      this.lazySnapshots.delete(filePath)
      this.lazySnapshots.set(filePath, cached)
      return cached
    }
    if (cached) this.removeLazySnapshot(filePath)
    if (!this.projectFileAccess && !isRegularBoundedFile(filePath)) return undefined
    const sourceContent = this.projectFileAccess
      ? this.projectFileAccess.read(
          this.projectMembershipRootId,
          this.projectMembershipRevision,
          filePath,
          admissionToken!,
        )
      : this.readSourceFile(filePath)
    if (sourceContent === null) {
      if (this.projectFileAccess) this.projectMembershipSourceUnavailable = true
      return undefined
    }
    const virtualDocument = createSourceDocument(sourceContent)
    const content = virtualDocument.generatedContent
    const record: LazySnapshotRecord = {
      path: filePath,
      content,
      virtualDocument,
      snapshot: ts.ScriptSnapshot.fromString(content),
      sourceFingerprint: fingerprintSource(sourceContent),
      bytes: Buffer.byteLength(sourceContent) + Buffer.byteLength(content),
      ...(admissionToken === undefined ? {} : { admissionToken }),
    }
    if (record.bytes <= this.maxLazySnapshotBytes && this.maxLazySnapshots > 0) {
      this.lazySnapshots.set(filePath, record)
      this.lazySnapshotBytes += record.bytes
      this.evictLazySnapshots()
    }
    return record
  }

  private projectMembershipFailure():
    | { status: "incomplete"; reason: "project-membership-incomplete" | "source-unavailable" }
    | undefined {
    if (this.projectMembershipStatus !== "complete") {
      return { status: "incomplete", reason: "project-membership-incomplete" }
    }
    return this.projectMembershipSourceUnavailable
      ? { status: "incomplete", reason: "source-unavailable" }
      : undefined
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
    sourcePath: string | undefined,
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
          newText: normalizeCompletionEdit(
            textChange.newText,
            currentPath,
            sourcePath,
            documentEol(script.sourceContent),
          ),
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

function moduleExtension(filePath: string): ts.Extension {
  if (filePath.endsWith(".d.ets")) return ts.Extension.Dets
  if (filePath.endsWith(".ets")) return ts.Extension.Ets
  if (filePath.endsWith(".d.ts")) return ts.Extension.Dts
  return ts.Extension.Ts
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

function defaultCompletionCommitCharacters(kind: ts.ScriptElementKind): string[] | undefined {
  return kind === ts.ScriptElementKind.memberFunctionElement ? [".", ",", ";"] : undefined
}

function normalizeCompletionEdit(
  text: string,
  currentPath: string,
  sourcePath: string | undefined,
  eol: string,
): string {
  let normalized = text.replace(/\r\n?|\n/gu, eol)
  if (!sourcePath || !path.isAbsolute(sourcePath)) return normalized
  const sourceWithExtension = path.extname(sourcePath)
    ? sourcePath
    : [".ets", ".ts", ".d.ets", ".d.ts"]
      .map((extension) => sourcePath + extension)
      .find((candidate) => fs.existsSync(candidate)) ?? sourcePath
  let specifier = path.relative(path.dirname(currentPath), sourceWithExtension).replace(/\\/gu, "/")
  if (!specifier.startsWith(".")) specifier = `./${specifier}`
  normalized = normalized.replace(/(\bfrom\s+["'])[^"']+(["'])/u, `$1${specifier}$2`)
  return normalized
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
  if (kind === ts.ScriptElementKind.enumMemberElement) return "enumMember"
  if (kind === ts.ScriptElementKind.interfaceElement) return "interface"
  if (kind === ts.ScriptElementKind.keyword) return "keyword"
  if (
    kind === ts.ScriptElementKind.moduleElement
    || kind === ts.ScriptElementKind.externalModuleName
  ) return "module"
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

function optionalJSDocTagText(text: string | ts.SymbolDisplayPart[] | undefined) {
  if (typeof text === "string") return text || undefined
  return optionalDisplayParts(text ?? [])
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

function discoverSdkAmbientDeclarations(sdkRoot: string | null): string[] {
  if (!sdkRoot) return []
  const prelude = [
    path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    path.join(sdkRoot, "ets", "component", "common.d.ts"),
    path.join(sdkRoot, "ets", "component", "arkui.d.ts"),
  ].find((candidate) => fs.existsSync(candidate))
  return prelude ? [prelude] : []
}

function quickInfoDocumentation(info: ts.QuickInfo): string | undefined {
  const documentation = optionalDisplayParts(info.documentation ?? [])
  const tags = (info.tags ?? []).map((tag) => {
    const text = optionalJSDocTagText(tag.text)
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
    case ts.ScriptElementKind.structElement: return "struct"
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
    case ts.ScriptElementKind.constructorImplementationElement:
      return item.spans[0]?.length === 0 ? null : "constructor"
    case ts.ScriptElementKind.moduleElement: return "module"
    case ts.ScriptElementKind.typeElement: return "type"
    case ts.ScriptElementKind.constElement:
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
      return "variable"
    default: return null
  }
}

function callHierarchyItemKind(
  item: ts.CallHierarchyItem,
  sourceView: ScriptRecord | LazySnapshotRecord,
): SemanticCallHierarchyItemKind | undefined {
  switch (item.kind) {
    case ts.ScriptElementKind.structElement: return "struct"
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

function normalizedDefinitionSpan(
  sourceFile: ts.SourceFile | undefined,
  content: string,
  definition: {
    textSpan: ts.TextSpan
    name?: string
    kind?: ts.ScriptElementKind
  },
): ts.TextSpan {
  const current = content.slice(
    definition.textSpan.start,
    definition.textSpan.start + definition.textSpan.length,
  )
  if (!definition.name || current === definition.name || !sourceFile) {
    return definition.textSpan
  }
  let best: ts.Identifier | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  const visit = (node: ts.Node): void => {
    const name = ts.isStructDeclaration(node) ? node.name : undefined
    if (name && name.text === definition.name) {
      const distance = Math.abs(name.getStart(sourceFile) - definition.textSpan.start)
      if (distance < bestDistance) {
        best = name
        bestDistance = distance
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return best
    ? { start: best.getStart(sourceFile), length: best.getWidth(sourceFile) }
    : definition.textSpan
}

function arktsStructThisCompletionEntries(
  service: ts.LanguageService,
  filePath: string,
  offset: number,
  entries: readonly ts.CompletionEntry[],
): readonly ts.CompletionEntry[] {
  const sourceFile = service.getProgram()?.getSourceFile(filePath)
  if (!sourceFile) return entries
  let owner: ts.StructDeclaration | undefined
  const visit = (node: ts.Node, enclosing: ts.StructDeclaration | undefined): void => {
    if (owner) return
    const current = ts.isStructDeclaration(node) ? node : enclosing
    if (
      ts.isPropertyAccessExpression(node)
      && node.expression.kind === ts.SyntaxKind.ThisKeyword
      && offset >= node.expression.end
      && offset <= node.end
    ) {
      owner = current
      return
    }
    ts.forEachChild(node, (child) => visit(child, current))
  }
  visit(sourceFile, undefined)
  if (!owner) return entries
  const existing = new Map(entries.map((entry) => [entry.name, entry]))
  const promoted = new Set<string>()
  const sortText = entries[0]?.sortText ?? "0"
  const additions: ts.CompletionEntry[] = []
  for (const member of owner.members) {
    const name = member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
      ? member.name.text
      : undefined
    if (!name || promoted.has(name)) continue
    let kind: ts.ScriptElementKind | undefined
    if (ts.isMethodDeclaration(member)) kind = ts.ScriptElementKind.memberFunctionElement
    else if (ts.isGetAccessorDeclaration(member)) kind = ts.ScriptElementKind.memberGetAccessorElement
    else if (ts.isSetAccessorDeclaration(member)) kind = ts.ScriptElementKind.memberSetAccessorElement
    else if (ts.isPropertyDeclaration(member)) kind = ts.ScriptElementKind.memberVariableElement
    if (!kind) continue
    additions.push(existing.get(name) ?? { name, kind, kindModifiers: "", sortText })
    promoted.add(name)
  }
  return additions.length > 0 ? additions : entries
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

function canonicalExistingPath(filePath: string): string | undefined {
  try {
    return fs.realpathSync.native(filePath)
  } catch {
    return undefined
  }
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

function strongestCallHierarchyFailure(
  failures: Iterable<SemanticCallHierarchyFailureReason>,
): SemanticCallHierarchyFailureReason | undefined {
  let result: SemanticCallHierarchyFailureReason | undefined
  for (const failure of failures) {
    if (failure === "source-outside-workspace") return failure
    result ??= failure
  }
  return result
}

function callHierarchyExecutionAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
  checker: ts.TypeChecker,
  work: CooperativeWork,
): { roots: ts.Node[] } | undefined {
  let current: ts.Node | undefined = syntaxNodeAtPosition(sourceFile, position, work)
  while (current) {
    work.item()
    const execution = callHierarchyOwnerExecution(current, checker)
    if (execution) return execution
    if (
      (ts.isVariableDeclaration(current) || ts.isPropertyDeclaration(current))
      && current.initializer
    ) {
      const initializerExecution = callHierarchyOwnerExecution(current.initializer, checker)
      if (initializerExecution) return initializerExecution
    }
    current = current.parent
  }
  return undefined
}

function callHierarchyOwnerExecution(
  node: ts.Node,
  checker: ts.TypeChecker,
): { roots: ts.Node[] } | undefined {
  if (ts.isClassStaticBlockDeclaration(node)) return { roots: [node.body] }
  if (ts.isClassLike(node)) return callHierarchyClassExecution(node)
  if (ts.isModuleDeclaration(node)) {
    return { roots: node.body && ts.isModuleBlock(node.body) ? [...node.body.statements] : [] }
  }
  if (ts.isSourceFile(node)) return { roots: [...node.statements] }
  if (!ts.isFunctionLike(node)) return undefined
  const implementation = callHierarchyFunctionImplementation(node, checker)
  const roots: ts.Node[] = implementation.parameters.flatMap((parameter) => (
    parameter.initializer ? [parameter.initializer] : []
  ))
  const body = callHierarchyCallableBody(implementation)
  if (body) roots.push(body)
  return { roots }
}

function callHierarchyClassExecution(node: ts.ClassLikeDeclaration): { roots: ts.Node[] } {
  const roots: ts.Node[] = callHierarchyModifierRoots(node)
  const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
  if (heritage?.types[0]) roots.push(heritage.types[0].expression)
  for (const member of node.members) {
    roots.push(...callHierarchyModifierRoots(member))
    if (ts.isPropertyDeclaration(member) && member.initializer) {
      roots.push(member.initializer)
    } else if (ts.isConstructorDeclaration(member) && member.body) {
      for (const parameter of member.parameters) {
        if (parameter.initializer) roots.push(parameter.initializer)
      }
      roots.push(member.body)
    }
  }
  return { roots }
}

function callHierarchyModifierRoots(node: ts.Node): ts.Node[] {
  const roots: ts.Node[] = []
  if (ts.canHaveDecorators(node)) roots.push(...(ts.getDecorators(node) ?? []))
  if (ts.canHaveModifiers(node)) roots.push(...(ts.getModifiers(node) ?? []))
  return roots
}

function callHierarchyFunctionImplementation(
  node: ts.SignatureDeclaration,
  checker: ts.TypeChecker,
): ts.SignatureDeclaration {
  if (callHierarchyCallableBody(node)) return node
  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
    && node.name
  ) {
    const symbol = checker.getSymbolAtLocation(node.name)
    const declarations = symbol
      ? [symbol.valueDeclaration, ...(symbol.declarations ?? [])]
      : []
    for (const implementation of declarations) {
      if (
        implementation
        && ts.isFunctionLike(implementation)
        && callHierarchyCallableBody(implementation)
      ) return implementation
    }
  }
  return node
}

function isNestedCallHierarchyOwner(node: ts.Node): boolean {
  if (
    ts.isSourceFile(node)
    || ts.isModuleDeclaration(node)
    || ts.isFunctionDeclaration(node)
    || ts.isClassDeclaration(node)
    || ts.isClassStaticBlockDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isMethodSignature(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  ) return true
  if (ts.isFunctionExpression(node) || ts.isClassExpression(node)) {
    return Boolean(node.name) || isAssignedCallHierarchyExpression(node)
  }
  return ts.isArrowFunction(node) && isAssignedCallHierarchyExpression(node)
}

function isAssignedCallHierarchyExpression(
  node: ts.FunctionExpression | ts.ArrowFunction | ts.ClassExpression,
): boolean {
  const declaration = node.parent
  if (
    (!ts.isVariableDeclaration(declaration) && !ts.isPropertyDeclaration(declaration))
    || declaration.initializer !== node
    || !ts.isIdentifier(declaration.name)
  ) return false
  if (ts.isPropertyDeclaration(declaration)) return true
  return ts.isVariableDeclarationList(declaration.parent)
    && (declaration.parent.flags & ts.NodeFlags.Const) !== 0
}

function callHierarchyCallableBody(node: ts.SignatureDeclaration): ts.Node | undefined {
  if (
    ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  ) return node.body
  return undefined
}

function rejectedValueImportFailure(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  failuresByFile: ReadonlyMap<
    string,
    ReadonlyMap<string, SemanticCallHierarchyFailureReason>
  >,
  work: CooperativeWork,
  seen = new Set<ts.Symbol>(),
): SemanticCallHierarchyFailureReason | undefined {
  let failure: SemanticCallHierarchyFailureReason | undefined
  for (const symbol of callTargetSymbols(checker, expression)) {
    const nested = rejectedValueImportSymbolFailure(checker, symbol, failuresByFile, work, seen)
    if (nested === "source-outside-workspace") return nested
    failure ??= nested
  }
  return failure
}

function rejectedValueImportSymbolFailure(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  failuresByFile: ReadonlyMap<
    string,
    ReadonlyMap<string, SemanticCallHierarchyFailureReason>
  >,
  work: CooperativeWork,
  seen: Set<ts.Symbol>,
): SemanticCallHierarchyFailureReason | undefined {
  work.item()
  if (seen.has(symbol)) return undefined
  seen.add(symbol)
  const imported = valueImportReferenceForSymbol(symbol)
  if (imported) {
    const direct = failuresByFile.get(imported.fileName)?.get(imported.moduleName)
    if (direct) return direct
    const module = checker.getSymbolAtLocation(imported.moduleSpecifier)
    if (module) {
      return rejectedModuleExportFailure(
        checker,
        module,
        imported.importedName,
        failuresByFile,
        work,
        new Set(),
      )
    }
    return undefined
  }
  let failure: SemanticCallHierarchyFailureReason | undefined
  for (const declaration of symbol.declarations ?? []) {
    const initializer = valueAliasInitializer(declaration)
    if (!initializer || ts.isFunctionLike(initializer)) continue
    const nested = rejectedValueImportFailure(checker, initializer, failuresByFile, work, seen)
    if (nested === "source-outside-workspace") return nested
    failure ??= nested
  }
  return failure
}

function valueImportReferenceForSymbol(symbol: ts.Symbol): {
  fileName: string
  importedName: string
  moduleName: string
  moduleSpecifier: ts.Expression
} | undefined {
  for (const declaration of symbol?.declarations ?? []) {
    let current: ts.Node | undefined = declaration
    let typeOnly = ts.isImportSpecifier(current) && current.isTypeOnly
    while (current && !ts.isImportDeclaration(current)) {
      if (ts.isImportClause(current) && current.isTypeOnly) typeOnly = true
      current = current.parent
    }
    if (
      current
      && !typeOnly
      && ts.isStringLiteralLike(current.moduleSpecifier)
    ) {
      const importClause = current.importClause
      let importedName = "*"
      if (importClause?.name && declaration === importClause) importedName = "default"
      if (ts.isImportSpecifier(declaration)) {
        importedName = (declaration.propertyName ?? declaration.name).text
      }
      return {
        fileName: current.getSourceFile().fileName,
        importedName,
        moduleName: current.moduleSpecifier.text,
        moduleSpecifier: current.moduleSpecifier,
      }
    }
  }
  return undefined
}

function rejectedModuleExportFailure(
  checker: ts.TypeChecker,
  module: ts.Symbol,
  exportedName: string,
  failuresByFile: ReadonlyMap<
    string,
    ReadonlyMap<string, SemanticCallHierarchyFailureReason>
  >,
  work: CooperativeWork,
  seen: Set<string>,
): SemanticCallHierarchyFailureReason | undefined {
  const sourceFile = module.valueDeclaration?.getSourceFile()
    ?? module.declarations?.[0]?.getSourceFile()
  if (!sourceFile) return undefined
  const key = `${path.resolve(sourceFile.fileName)}\0${exportedName}`
  if (seen.has(key)) return undefined
  seen.add(key)

  for (const statement of sourceFile.statements) {
    work.item()
    if (localStatementExportsName(statement, exportedName)) return undefined
    if (
      !ts.isExportDeclaration(statement)
      || !statement.exportClause
      || !ts.isNamedExports(statement.exportClause)
    ) continue
    const specifier = statement.exportClause.elements.find((element) => element.name.text === exportedName)
    if (!specifier) continue
    if (!statement.moduleSpecifier || !ts.isStringLiteralLike(statement.moduleSpecifier)) {
      return undefined
    }
    return rejectedReexportFailure(
      checker,
      sourceFile,
      statement.moduleSpecifier,
      (specifier.propertyName ?? specifier.name).text,
      failuresByFile,
      work,
      seen,
    )
  }

  if (exportedName === "default") return undefined
  let failure: SemanticCallHierarchyFailureReason | undefined
  for (const statement of sourceFile.statements) {
    work.item()
    if (
      !ts.isExportDeclaration(statement)
      || statement.exportClause
      || !statement.moduleSpecifier
      || !ts.isStringLiteralLike(statement.moduleSpecifier)
    ) continue
    const nested = rejectedReexportFailure(
      checker,
      sourceFile,
      statement.moduleSpecifier,
      exportedName,
      failuresByFile,
      work,
      seen,
    )
    if (nested === "source-outside-workspace") return nested
    failure ??= nested
  }
  return failure
}

function rejectedReexportFailure(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  moduleSpecifier: ts.Expression,
  exportedName: string,
  failuresByFile: ReadonlyMap<
    string,
    ReadonlyMap<string, SemanticCallHierarchyFailureReason>
  >,
  work: CooperativeWork,
  seen: Set<string>,
): SemanticCallHierarchyFailureReason | undefined {
  if (!ts.isStringLiteralLike(moduleSpecifier)) return undefined
  const direct = failuresByFile.get(path.resolve(sourceFile.fileName))?.get(moduleSpecifier.text)
  if (direct) return direct
  const nestedModule = checker.getSymbolAtLocation(moduleSpecifier)
  return nestedModule
    ? rejectedModuleExportFailure(
        checker,
        nestedModule,
        exportedName,
        failuresByFile,
        work,
        seen,
      )
    : undefined
}

function localStatementExportsName(statement: ts.Statement, exportedName: string): boolean {
  if (!ts.canHaveModifiers(statement)) return false
  const modifiers = ts.getModifiers(statement) ?? []
  if (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false
  if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
    return exportedName === "default"
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) => (
      ts.isIdentifier(declaration.name) && declaration.name.text === exportedName
    ))
  }
  const named = statement as ts.Statement & { name?: ts.DeclarationName }
  return Boolean(named.name && ts.isIdentifier(named.name) && named.name.text === exportedName)
}

function valueAliasInitializer(declaration: ts.Declaration): ts.Expression | undefined {
  if (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) {
    return declaration.initializer
  }
  if (ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration)) {
    return declaration.initializer
  }
  if (!ts.isBindingElement(declaration)) return undefined
  if (declaration.initializer) return declaration.initializer
  let current: ts.Node | undefined = declaration.parent
  while (current && !ts.isVariableDeclaration(current) && !ts.isParameter(current)) {
    current = current.parent
  }
  return current && (ts.isVariableDeclaration(current) || ts.isParameter(current))
    ? current.initializer
    : undefined
}

function callTargetSymbols(checker: ts.TypeChecker, expression: ts.Expression): ts.Symbol[] {
  const symbols: ts.Symbol[] = []
  const add = (node: ts.Node | undefined): void => {
    const symbol = node ? checker.getSymbolAtLocation(node) : undefined
    if (symbol && !symbols.includes(symbol)) symbols.push(symbol)
  }
  const target = unwrappedCallTarget(expression)
  if (ts.isPropertyAccessExpression(target)) add(target.name)
  else if (ts.isElementAccessExpression(target)) add(target)
  const identifier = leftmostCallIdentifier(target)
  add(identifier)
  return symbols
}

function unwrappedCallTarget(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) current = current.expression
  return current
}

function leftmostCallIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  let current = expression
  while (true) {
    if (ts.isIdentifier(current)) return current
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression
      continue
    }
    if (
      ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)
      || ts.isSatisfiesExpression(current)
    ) {
      current = current.expression
      continue
    }
    return undefined
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

  const checker = program.getTypeChecker() as ts.TypeChecker & {
    resolveName(
      name: string,
      location: ts.Node,
      meaning: ts.SymbolFlags,
      excludeGlobals: boolean,
    ): ts.Symbol | undefined
    getMergedSymbol(symbol: ts.Symbol): ts.Symbol
  }
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

function canonicalExportSymbol(
  checker: ts.TypeChecker & { getMergedSymbol(symbol: ts.Symbol): ts.Symbol },
  symbol: ts.Symbol,
): ts.Symbol {
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

function samePathSet(left: Set<string> | undefined, right: Set<string> | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}
