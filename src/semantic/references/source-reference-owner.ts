import { createOfficialSourceReferenceService } from "../backends/ohos-typescript/registry-pool.js"
import ts from "typescript"
import { sameResolvedPath } from "../../project/path-identity.js"
import type { SemanticMemoryLevel } from "../coordinator/semantic-coordinator.js"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { localNavigationToken } from "../source-local-navigation.js"
import { toPublicRange } from "../legacy-result-mappers.js"
import type { SemanticQuery, SemanticDefinition, SemanticReferencesQuery, SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { lexicalReferenceProof } from "../../core/types/lexical-reference-proof.js"
import { createSourceDocument } from "../../core/types/source-document.js"
import { exactSourceOffset } from "../../core/types/text-position.js"
import { queryTypeScriptReferences } from "../../core/types/typescript-reference-query.js"
import { publicReferenceResult } from "./reference-result-mapping.js"
import { toFilePath } from "../semantic-worker-file-identity.js"
import { SOURCE_REFERENCE_PROFILE, sourceReferenceCheckpoint } from "./source-reference-input.js"

const options: ts.CompilerOptions = Object.freeze({ noResolve: true, noLib: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })

/** One source-owned LS inside the existing backend/Worker lifetime. No SDK,
 * project resolver, membership graph, disk Host reads, or additional manager. */
export class SourceReferenceOwner {
  private service?: ts.LanguageService
  private current?: { file: string; text: string; snapshot: ts.IScriptSnapshot }
  private revision = 0
  private memoryLevel: SemanticMemoryLevel = "level0"
  private active?: { checkpoint(): void; hostCheckpoint(): void }

  references(query: SemanticReferencesQuery, checkpoint: () => void,
    logger?: StructuredLogger): VersionedSemanticResult<SemanticReferencesOutcome | null> {
    return this.querySource(query, checkpoint, logger, (service, program, source, file, offset) => {
      const definitions = service.getDefinitionAtPosition(file, offset) ?? []
      const proof = lexicalReferenceProof(program, file, offset, query.document.text,
        query.includeDeclaration, definitions, () => this.active!.checkpoint())
      // Invocation definitions can acquire additional project/SDK signatures.
      if (!proof || offset < proof.declarationStart
        || offset >= proof.declarationStart + definitions[0].textSpan.length) return undefined
      const document = { content: query.document.text, virtualDocument: createSourceDocument(query.document.text) }
      const result = queryTypeScriptReferences({ rootPath: path.dirname(file), service,
        checkpoint: () => this.active!.checkpoint(), membershipFailure: () => undefined,
        querySource: candidate => candidate === file ? document : undefined,
        sourceView: candidate => candidate === file ? document : undefined,
      }, { path: file, line: query.position.line + 1, column: query.position.character + 1 }, query.includeDeclaration, true, program)
      this.active!.checkpoint()
      if (result.status !== "complete" || result.queryProof?.coverage !== "lexical-block") return undefined
      const value = publicReferenceResult(query.document.version, result)
      if (value.value.status !== "complete" || !value.value.queryProof) return undefined
      return value.value
    }, "references.source-owner.complete")
  }

  define(query: SemanticQuery, checkpoint: () => void, logger?: StructuredLogger): VersionedSemanticResult<SemanticDefinition[] | null> {
    return this.querySource(query, checkpoint, logger, (service, program, source, file, offset) => {
      const token = localNavigationToken(source, offset, () => this.active!.checkpoint())
      if (!token) return undefined
      const definitions = service.getDefinitionAtPosition(file, offset) ?? []
      // Keep the compiler's actual cursor result, then prove the exact selected
      // identifier. End-of-token cursors need not force a whole-project query.
      const proof = lexicalReferenceProof(program, file, token.getStart(source), query.document.text, true,
        definitions, () => this.active!.checkpoint())
      if (!proof) return undefined
      const document = createSourceDocument(query.document.text)
      return definitions.map(target => ({ uri: pathToFileURL(file).href,
        range: toPublicRange(document.generatedSpanToSourceRange(target.textSpan.start, target.textSpan.length)) }))
    }, "navigation.source-owner.complete")
  }

  private querySource<Result extends SemanticReferencesOutcome | SemanticDefinition[]>(query: SemanticQuery, checkpoint: () => void, logger: StructuredLogger | undefined,
    run: (service: ts.LanguageService, program: ts.Program, source: ts.SourceFile, file: string, offset: number) => Result | undefined,
    event: string): VersionedSemanticResult<Result | null> {
    if (this.active) throw new Error("Source reference owner already leased")
    const file = toFilePath(query.document.uri)
    const miss = () => ({ documentVersion: query.document.version, value: null })
    if (!file || !/\.(ts|ets)$/.test(file) || this.memoryLevel === "level2" || this.memoryLevel === "level3") return miss()
    this.active = { checkpoint: () => { checkpoint(); sourceReferenceCheckpoint(query) }, hostCheckpoint: checkpoint }
    const started = performance.now()
    try {
      this.active.checkpoint()
      if (this.current?.file !== file || this.current.text !== query.document.text) {
        this.current = { file, text: query.document.text, snapshot: ts.ScriptSnapshot.fromString(query.document.text) }
        this.revision++
      }
      this.service ??= this.createService()
      const program = this.service.getProgram(), source = program?.getSourceFile(file)
      if (!program || !source) { this.dispose(); return miss() }
      if (!eligibleSyntax(source, () => this.active!.checkpoint())) return miss()
      const offset = exactSourceOffset(query.document.text, query.position.line + 1, query.position.character + 1)
      if (offset === undefined) return miss()
      const result = run(this.service, program, source, file, offset)
      this.active.checkpoint()
      if (result === undefined) return miss()
      try { logger?.info(event, { profile: event === "references.source-owner.complete" ? SOURCE_REFERENCE_PROFILE : "source-lexical-navigation-v1",
        durationMs: performance.now() - started, programSourceFiles: program.getSourceFiles().length,
        sdkSourceFiles: 0, locations: sourceResultLocations(result) }) } catch { /* Observation only. */ }
      return { documentVersion: query.document.version, value: result }
    } catch (error) {
      // A failed private build cannot poison same-version retry in this fork.
      try { this.dispose() } catch (cleanupError) {
        try { logger?.error("references.source-owner.cleanup-failed", { message: String(cleanupError) }) } catch { /* Observation only. */ }
      }
      throw error
    } finally { this.active = undefined }
  }

  private createService(): ts.LanguageService {
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => options,
      getScriptFileNames: () => this.current ? [this.current.file] : [],
      getScriptVersion: () => String(this.revision), getProjectVersion: () => String(this.revision),
      getScriptSnapshot: file => this.current && sameResolvedPath(file, this.current.file) ? this.current.snapshot : undefined,
      getScriptKind: file => file.endsWith(".ets") ? ts.ScriptKind.ETS : ts.ScriptKind.TS,
      getCurrentDirectory: () => process.cwd(), getDefaultLibFileName: () => "",
      fileExists: file => !!this.current && sameResolvedPath(file, this.current.file),
      readFile: file => this.current && sameResolvedPath(file, this.current.file) ? this.current.text : undefined,
      directoryExists: () => false, readDirectory: () => [], useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
      getCancellationToken: () => ({ isCancellationRequested: () => { this.active?.hostCheckpoint(); return false } }),
    }
    return createOfficialSourceReferenceService(host)
  }

  applyMemoryPressure(level: SemanticMemoryLevel): void {
    this.memoryLevel = level
    if (level === "level2" || level === "level3") this.dispose()
  }

  dispose(): void {
    const service = this.service
    this.service = undefined; this.current = undefined
    try { service?.dispose() } finally { this.revision++ }
  }
}

function sourceResultLocations(result: SemanticReferencesOutcome | SemanticDefinition[]): number {
  return Array.isArray(result) ? result.length : result.status === "complete" ? result.references.length : 0
}

function eligibleSyntax(source: ts.SourceFile, checkpoint: () => void): boolean {
  let eligible = !source.isDeclarationFile && !((source as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length)
  const visit = (node: ts.Node): void => {
    checkpoint()
    if ([ts.SyntaxKind.ModuleDeclaration, ts.SyntaxKind.Decorator, ts.SyntaxKind.DeclareKeyword,
      ts.SyntaxKind.WithStatement, ts.SyntaxKind.JsxElement, ts.SyntaxKind.JsxSelfClosingElement,
      ts.SyntaxKind.JsxFragment, ts.SyntaxKind.StructDeclaration].includes(node.kind)
      || ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "eval") eligible = false
    if (eligible) ts.forEachChild(node, visit)
  }
  if (eligible) visit(source)
  return eligible
}
