import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

import { discoverHarmonySdk } from "../sdk/discovery.js"
import type {
  SemanticCompletionItem,
  SemanticCompletionTextEdit,
  SemanticDefinitionCandidate,
  SemanticDiagnostic,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
  SemanticDocumentSymbolKind,
  SemanticHoverInfo,
  SemanticSignatureHelp,
  SemanticTextRange,
  SemanticUnsupportedResult,
  SemanticUsageResult,
  SemanticWorkspaceEditPlan,
} from "../protocol.js"
import { resolveHarmonySdkModule } from "../sdk/module-resolver.js"
import { createArktsVirtualDocument, type ArktsVirtualDocument } from "../virtual/arkts-virtual-document.js"
import type {
  ProjectMembershipSnapshot,
  SemanticWorkspaceView,
} from "../workspace/document-store.js"
import type {
  SemanticCodeFixCandidate,
  SemanticResolvedCodeFix,
  SemanticSignatureHelpTriggerReason,
  SemanticTypeEngineState,
} from "./type-engine.js"
import { mapTypescriptDiagnostics, typescriptTypeDetail, typescriptTypeStatus } from "./typescript-language-helpers.js"
import { lineColumnToOffset, offsetToLineColumn, spanToRange } from "./text-position.js"

const MAX_SCRIPTS = 512
const MAX_SCRIPT_BYTES = 16 * 1024 * 1024
const MAX_LAZY_SNAPSHOTS = 128
const MAX_LAZY_SNAPSHOT_BYTES = 8 * 1024 * 1024
const MAX_COMPLETIONS = 128
const MIN_MODULE_EXPORT_PREFIX_LENGTH = 2
const ENGINE_VERSION = `typescript-${ts.version}-arkts-v2`

interface ScriptRecord {
  path: string
  content: string
  sourceContent: string
  virtualDocument: ArktsVirtualDocument
  version: number
  bytes: number
  lastAccess: number
}

interface LazySnapshotRecord {
  path: string
  content: string
  virtualDocument: ArktsVirtualDocument
  snapshot: ts.IScriptSnapshot
  bytes: number
}

interface SafeCodeFix extends SemanticCodeFixCandidate {
  edits: Array<{
    path: string
    range: SemanticTextRange
    newText: string
  }>
}

export interface TypeScriptLanguageServiceEngineOptions {
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
      readSourceFile = safeRead,
      lazySnapshotLimits = {},
    }: TypeScriptLanguageServiceEngineOptions = {},
  ) {
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
    this.service = ts.createLanguageService(this.createHost(), ts.createDocumentRegistry())
  }

  prepare(workspace: SemanticWorkspaceView): SemanticTypeEngineState {
    const protectedPaths = new Set<string>()
    this.updateProjectMembership(workspace.projectMembership)
    this.updateProjectContent(workspace.contentRevision, workspace.changedPaths)
    this.removeProjectFiles(workspace.removedPaths)
    for (const document of workspace.documents) {
      const filePath = path.resolve(document.path)
      protectedPaths.add(filePath)
      this.updateScript(filePath, document.content)
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

  complete(position: SemanticDocumentPosition): SemanticCompletionItem[] {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script || !hasCompletionPrefix(script.sourceContent, position)) return []
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const prefix = completionPrefix(script.sourceContent, sourceOffset)
    const memberAccess = script.sourceContent.slice(0, sourceOffset - prefix.length).endsWith(".")
    const info = this.service.getCompletionsAtPosition(filePath, offset, {
      includeCompletionsForImportStatements: true,
      includeCompletionsForModuleExports:
        !memberAccess && prefix.length >= MIN_MODULE_EXPORT_PREFIX_LENGTH,
      includeCompletionsWithInsertText: true,
    })
    if (!info) return []
    const normalizedPrefix = prefix.toLowerCase()
    return info.entries
      .filter((entry) => !normalizedPrefix
        || (entry.filterText ?? entry.name).toLowerCase().startsWith(normalizedPrefix))
      .slice(0, MAX_COMPLETIONS)
      .map((entry) => ({
      label: entry.name,
      detail: typescriptTypeDetail(entry, filePath),
      kind: completionKind(entry.kind),
      insertText: entry.insertText,
      filterText: entry.filterText,
      sortText: entry.sortText,
      source: "type",
      replacementRange: entry.replacementSpan
        ? script.virtualDocument.generatedSpanToSourceRange(
            entry.replacementSpan.start,
            entry.replacementSpan.length,
          )
        : prefix.length > 0
          ? spanToRange(script.sourceContent, sourceOffset - prefix.length, prefix.length)
          : undefined,
      data: {
        provider: "typescript",
        engineVersion: ENGINE_VERSION,
        documentVersion: position.documentVersion,
        entryName: entry.name,
        entrySource: entry.source,
        entryData: entry.data,
      },
      }))
  }

  resolveCompletion(
    position: SemanticDocumentPosition,
    item: SemanticCompletionItem,
  ): SemanticCompletionItem {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    const data = item.data
    if (!script || data?.provider !== "typescript" || data.engineVersion !== ENGINE_VERSION) return item
    const entryName = typeof data.entryName === "string" ? data.entryName : item.label
    const entrySource = typeof data.entrySource === "string" ? data.entrySource : undefined
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const details = this.service.getCompletionEntryDetails(
      filePath,
      offset,
      entryName,
      {},
      entrySource,
      { includeCompletionsForModuleExports: true },
      data.entryData as ts.CompletionEntryData | undefined,
    )
    if (!details) return item
    const detail = ts.displayPartsToString(details.displayParts) || item.detail
    const documentation = optionalDisplayParts(details.documentation ?? []) ?? item.documentation
    return {
      ...item,
      detail,
      documentation,
      additionalTextEdits: this.mapCompletionEdits(filePath, position.documentVersion, details),
      data: { ...data, resolved: true },
    }
  }

  define(position: SemanticDocumentPosition): SemanticDefinitionCandidate[] {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return []
    script.lastAccess = ++this.accessClock
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const definitions = this.service.getDefinitionAtPosition(filePath, offset) ?? []
    const seen = new Set<string>()
    return definitions.flatMap((definition) => {
      const targetPath = path.resolve(definition.fileName)
      const targetScript = this.scripts.get(targetPath)
      const targetLazy = targetScript ? undefined : this.loadLazySnapshot(targetPath)
      const content = targetScript?.sourceContent
        ?? targetLazy?.virtualDocument.sourceContent
        ?? safeRead(targetPath)
      if (content === null) return []
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
      if (seen.has(key)) return []
      seen.add(key)
      return [{ path: targetPath, range }]
    })
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

  diagnostics(position: SemanticDocumentPosition): SemanticDiagnostic[] {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return []
    script.lastAccess = ++this.accessClock
    return mapTypescriptDiagnostics(
      filePath,
      script.virtualDocument,
      this.service.getSyntacticDiagnostics(filePath),
      this.service.getSemanticDiagnostics(filePath),
    )
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
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return []
    script.lastAccess = ++this.accessClock
    const tree = this.service.getNavigationTree(filePath)
    return (tree.childItems ?? [])
      .flatMap((item) => navigationSymbol(item, script))
      .sort(compareDocumentSymbols)
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

  rename(
    position: SemanticDocumentPosition,
    newName: string,
  ): SemanticWorkspaceEditPlan | SemanticUnsupportedResult {
    const filePath = path.resolve(position.path)
    const script = this.scripts.get(filePath)
    if (!script) return unsupportedRename("Rename target is not loaded.")
    if (!isIdentifierText(newName)) {
      return unsupportedRename(`'${newName}' is not a valid identifier.`)
    }
    const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
    const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
    const info = this.service.getRenameInfo(filePath, offset, { allowRenameOfImportPath: false })
    if (!info.canRename) return unsupportedRename(info.localizedErrorMessage)
    const locations = this.service.findRenameLocations(filePath, offset, false, false, true) ?? []
    const operations = locations.flatMap((location) => {
      const targetPath = path.resolve(location.fileName)
      const targetScript = this.scripts.get(targetPath)
      if (!targetScript || !isWithinRoot(this.rootPath, targetPath)) return []
      return [{
        kind: "text" as const,
        path: targetPath,
        range: targetScript.virtualDocument.generatedSpanToSourceRange(
          location.textSpan.start,
          location.textSpan.length,
        ),
        newText: `${location.prefixText ?? ""}${newName}${location.suffixText ?? ""}`,
        expectedContentVersion: contentVersion(targetScript.sourceContent),
      }]
    }).sort(compareTextEdits)
    if (operations.length === 0) return unsupportedRename("No rename locations were found.")
    const affectedFiles = [...new Set(operations.map((operation) => operation.path))].sort()
    return {
      id: `semantic.rename.${contentVersion(`${filePath}:${offset}:${newName}`)}`,
      title: `Rename ${info.displayName} to ${newName}`,
      operations,
      conflicts: [],
      affectedFiles,
      undoLabel: `Undo rename ${info.displayName} to ${newName}`,
      requiresPreview: true,
    }
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

  private createHost(): ts.LanguageServiceHost {
    return {
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
        return this.scripts.has(filePath)
          || this.projectMembershipPaths.has(filePath)
          || ts.sys.fileExists(fileName)
      },
      getDirectories: ts.sys.getDirectories,
      readDirectory: ts.sys.readDirectory,
      readFile: (fileName) => {
        const filePath = path.resolve(fileName)
        return this.scripts.get(filePath)?.content
          ?? this.loadLazySnapshot(filePath)?.content
          ?? ts.sys.readFile(fileName)
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
      this.scripts.has(path.resolve(candidate)) || fs.existsSync(candidate))
    return resolved
      ? ({ resolvedFileName: resolved, extension: ts.Extension.Ts } as ts.ResolvedModule)
      : undefined
  }

  private updateScript(filePath: string, content: string): void {
    this.removeLazySnapshot(filePath)
    const previous = this.scripts.get(filePath)
    if (previous?.sourceContent === content) {
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
    const sourceContent = this.readSourceFile(filePath)
    if (sourceContent === null) return undefined
    const virtualDocument = createArktsVirtualDocument(filePath, sourceContent)
    const content = virtualDocument.generatedContent
    const record: LazySnapshotRecord = {
      path: filePath,
      content,
      virtualDocument,
      snapshot: ts.ScriptSnapshot.fromString(content),
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
  ): SemanticCompletionTextEdit[] | undefined {
    const action = details.codeActions?.find((candidate) =>
      !candidate.commands?.length
      && candidate.changes.length > 0
      && candidate.changes.every((change) =>
        !change.isNewFile && path.resolve(change.fileName) === currentPath))
    if (!action) return undefined
    const script = this.scripts.get(currentPath)
    if (!script) return undefined
    return action.changes.flatMap((change) => change.textChanges.map((textChange) => ({
      path: currentPath,
      range: script.virtualDocument.generatedSpanToSourceRange(
        textChange.span.start,
        textChange.span.length,
      ),
      newText: textChange.newText,
      expectedVersion: documentVersion,
    })))
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

function hasCompletionPrefix(content: string, position: SemanticDocumentPosition): boolean {
  const offset = lineColumnToOffset(content, position.line, position.column)
  const before = content.slice(0, offset)
  return /\.[A-Za-z_$][A-Za-z0-9_$]*$/.test(before)
    || before.endsWith(".")
    || /\b[A-Za-z_$][A-Za-z0-9_$]*$/.test(before)
}

function completionPrefix(content: string, offset: number): string {
  return content.slice(0, offset).match(/[A-Za-z_$][A-Za-z0-9_$]*$/)?.[0] ?? ""
}

function completionKind(kind: ts.ScriptElementKind): string {
  if (kind === ts.ScriptElementKind.memberFunctionElement) return "method"
  if (kind === ts.ScriptElementKind.memberVariableElement) return "field"
  if (kind === ts.ScriptElementKind.functionElement) return "function"
  if (kind === ts.ScriptElementKind.classElement) return "class"
  if (kind === ts.ScriptElementKind.interfaceElement) return "interface"
  if (kind === ts.ScriptElementKind.keyword) return "keyword"
  if (kind === ts.ScriptElementKind.constElement || kind === ts.ScriptElementKind.letElement) return "variable"
  return "property"
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

function navigationSymbol(
  item: ts.NavigationTree,
  script: ScriptRecord,
): SemanticDocumentSymbolInfo[] {
  const span = item.spans[0]
  if (!span) return []
  const kind = documentSymbolKind(item, script)
  const children = (item.childItems ?? [])
    .flatMap((child) => navigationSymbol(child, script))
    .sort(compareDocumentSymbols)
  if (!kind) return children
  const nameSpan = item.nameSpan ?? { start: span.start, length: 0 }
  return [{
    name: item.text,
    kind,
    range: script.virtualDocument.generatedSpanToSourceRange(span.start, span.length),
    selectionRange: script.virtualDocument.generatedSpanToSourceRange(
      nameSpan.start,
      nameSpan.length,
    ),
    children: children.length > 0 ? children : undefined,
  }]
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

function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return null
  }
}

function cacheLimit(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0 || value > fallback) {
    throw new RangeError(`${label} must be an integer between 0 and ${fallback}`)
  }
  return value
}

function unsupportedRename(reason: string): SemanticUnsupportedResult {
  return { status: "unsupported", reason }
}

function isWithinRoot(rootPath: string, filePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function contentVersion(content: string) {
  let hash = 0xcbf29ce484222325n
  for (const byte of Buffer.from(content)) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`
}

function compareTextEdits(
  left: { path: string; range: { startLine: number; startColumn: number } },
  right: { path: string; range: { startLine: number; startColumn: number } },
) {
  return left.path.localeCompare(right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
}

function isIdentifierText(value: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, value)
  return scanner.scan() === ts.SyntaxKind.Identifier
    && scanner.scan() === ts.SyntaxKind.EndOfFileToken
}
