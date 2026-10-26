import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

import { SEMANTIC_READY_CAPABILITIES, semanticSdkPartial, semanticUnprepared,
  type SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectSdkSelection } from "../sdk/project-sdk.js"
import type { ProjectMembershipSnapshot, SemanticWorkspaceView } from "../workspace/document-store.js"
import { compilerArtifactIdentity } from "./typescript-compiler-artifact.js"
import { TypeScriptResidentReferenceState } from "./typescript-resident-reference-state.js"
import { initialPreparationActive } from "../../semantic/coordinator/initial-preparation.js"
import { relativeResourcePath, sameResolvedPath } from "../../project/path-identity.js"

const programIds = new WeakMap<ts.Program, string>()
const MISSING_INPUT_DIAGNOSTICS = new Set([2307, 2318, 2688, 2792, 6053, 5083])

type TraceFields = Readonly<Record<string, string | number | boolean | null | undefined>>
export type ReadinessTrace = (event: string, fields: TraceFields) => void

interface ReadinessPreparation {
  readonly workspace: SemanticWorkspaceView
  readonly generation: number
  readonly roots: readonly string[]
  readonly service: ts.LanguageService
  readonly compilerOptions: ts.CompilerOptions
  readonly sdk: ProjectSdkSelection
  readonly sdkRoots: readonly string[]
  readonly sdkAmbientProfile: string
  readonly witness: LoadedConfigurationWitness | undefined
  readonly resolver: LocalPackageResolver
  readonly readSourceFile: (filePath: string) => string | null
  readonly cancellation: ts.HostCancellationToken | undefined
  readonly residentProofOwner?: object
  readonly trace?: ReadinessTrace
  readonly onProgramPrepared?: () => void
}

/** A witness of the owner's existing Program; no LS, source cache or scheduler. */
export interface OfficialReadinessObservation {
  readonly proof: TypeScriptResidentReferenceState
  readonly report: SemanticReadinessReport
}

/** Owner-local proof lifecycle, not a compiler, source cache or readiness scheduler. */
export class OfficialReadinessState {
  private observation: OfficialReadinessObservation | SemanticReadinessReport | undefined
  private queryRefreshEnabled = false
  private programPrepared = false

  constructor(private readonly onPreparedProof?: (proof: TypeScriptResidentReferenceState | undefined) => void) {}

  get refreshRequested(): boolean { return this.queryRefreshEnabled }
  get hasPreparedProgram(): boolean { return this.programPrepared }
  get preparedGeneration(): number | undefined {
    return this.observation && "proof" in this.observation
      ? this.observation.report.inputIdentity?.engineGeneration : undefined
  }

  /** Transfers intent only; replacement owners still have no prepared observation. */
  restoreQueryRefresh(): void { this.queryRefreshEnabled = true }

  clear(): void {
    this.observation = undefined
    this.queryRefreshEnabled = false
    this.programPrepared = false
    this.onPreparedProof?.(undefined)
  }

  prepare(input: ReadinessPreparation): SemanticReadinessReport {
    this.clear()
    let observed = false
    this.observation = prepareOfficialReadiness({ ...input, onProgramPrepared: () => { observed = true } })
    this.programPrepared = observed
    this.queryRefreshEnabled = "proof" in this.observation
    if ("proof" in this.observation) this.onPreparedProof?.(this.observation.proof)
    return "proof" in this.observation ? this.observation.report : this.observation
  }

  current(input: ReadinessPreparation, prepared = false): SemanticReadinessReport {
    return currentOfficialReadiness(this.observation,
      prepared ? { ...input.workspace, resetTypeEngine: false } : input.workspace, input.generation, input.roots)
  }

  status(input: ReadinessPreparation, mode: boolean | "query" | "query-prepare"): SemanticReadinessReport {
    if (mode === true) return this.prepare(input)
    if (mode === "query-prepare") return this.prepareQuery(input)
    if (mode === "query") {
      const refreshed = this.afterQuery(input)
      if (refreshed) return refreshed
    }
    return this.current(input, mode !== false)
  }

  /** Runs only inside an ordinary semantic query, never in status or background diagnostics. */
  afterQuery(input: ReadinessPreparation): SemanticReadinessReport | undefined {
    if (!this.queryRefreshEnabled) return
    const applied = { ...input, workspace: { ...input.workspace, resetTypeEngine: false } }
    if (this.current(applied).semanticState !== "ready") {
      return this.prepareQuery(applied)
    }
  }

  private prepareQuery(input: ReadinessPreparation): SemanticReadinessReport {
    const refreshed = this.prepare(input)
    // Only an already authorized query session uses this mode, including a
    // replacement context. A thrown/cancelled preparation retains no intent.
    this.queryRefreshEnabled = true
    return refreshed
  }
}

/** Reuse loaded membership facts; status still admits against the Store's fresh complete scope. */
export function withLoadedReadinessMembership(workspace: SemanticWorkspaceView,
  status: ProjectMembershipSnapshot["status"] | "none", revision: number,
  paths: ReadonlySet<string>): SemanticWorkspaceView {
  return !workspace.projectMembership && status === "complete"
    ? { ...workspace, projectMembership: { status, revision, paths: [...paths] } } : workspace
}

export function prepareOfficialReadiness(input: ReadinessPreparation): OfficialReadinessObservation | SemanticReadinessReport {
  const { workspace } = input
  const rootUri = pathToFileURL(workspace.rootPath).href
  const diagnosticInput = (diagnostic?: ts.Diagnostic): SemanticReadinessReport["unavailableInput"] => diagnostic ? {
      uri: diagnostic.file ? pathToFileURL(path.resolve(diagnostic.file.fileName)).href : null,
      code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      position: diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : null,
    } : null
  const unavailable = (reason: string, diagnostic?: ts.Diagnostic): SemanticReadinessReport => ({
    ...semanticUnprepared(rootUri, reason), unavailableInput: diagnosticInput(diagnostic),
  })
  const checkpoint = () => {
    if (input.cancellation?.isCancellationRequested()) throw new ts.OperationCanceledException()
  }
  const cancellation: ts.CancellationToken | undefined = input.cancellation ? {
    isCancellationRequested: () => input.cancellation!.isCancellationRequested(),
    throwIfCancellationRequested: checkpoint,
  } : undefined
  checkpoint()
  if (workspace.projectMembership?.status !== "complete") return unavailable("project-membership-incomplete")
  const sdkCoverageProven = input.sdk.ready && input.sdk.identity?.status === "identified"
    && input.sdkAmbientProfile === "full" && input.sdkRoots.some(root =>
      ["index-full.d.ts", "common.d.ts", "arkui.d.ts"].some(name =>
        sameResolvedPath(root, path.join(input.sdk.path!, "ets", "component", name))))
  // SDK qualification may be unknown before a complete-root Program exists.
  // Keep ordinary queries available without introducing new global build work.
  if (!sdkCoverageProven) return semanticSdkPartial(rootUri, { layer: "sdk", reason: "coverage-unproven" })
  if (!compilerArtifactIdentity) return unavailable("backend-artifact-unproven")
  const graph = input.resolver.projectFor(workspace.rootPath).semanticGraph()
  if (graph.status === "unavailable" || (graph.status === "ready" && !graph.complete)) {
    return unavailable("project-graph-incomplete")
  }
  const program = input.service.getProgram()
  checkpoint()
  if (!program) return unavailable("program-unavailable")
  program.getTypeChecker()
  input.onProgramPrepared?.()
  // Initial preparation owns loaded-byte validation even if a missing input
  // later prevents READY. This seeds facts only, never a readiness certificate.
  if (sdkCoverageProven && initialPreparationActive()) observePreparedInputs(input, program, checkpoint)
  const sources = program.getSourceFiles()
  const firstMissingInput = (diagnostics: readonly ts.Diagnostic[]) =>
    diagnostics.find(diagnostic => MISSING_INPUT_DIAGNOSTICS.has(diagnostic.code))
  const missingCompilerInput = firstMissingInput(program.getOptionsDiagnostics(cancellation))
    ?? firstMissingInput(program.getGlobalDiagnostics(cancellation))
  if (missingCompilerInput) {
    if (missingCompilerInput.file && input.sdk.path
      && relativeResourcePath(input.sdk.path, missingCompilerInput.file.fileName) !== undefined) {
      return semanticSdkPartial(rootUri, { layer: "sdk", reason: "declaration-not-found" },
        diagnosticInput(missingCompilerInput))
    }
    return unavailable("compiler-inputs-incomplete", missingCompilerInput)
  }
  // Complete dependency checking, not position/symbol queries or benchmark answers.
  for (const source of sources) {
    checkpoint()
    // skipLibCheck hides missing triple-slash declarations. Use the already
    // parsed directives and actual Program membership, without type-checking
    // the entire SDK or manufacturing compiler diagnostics.
    if (input.sdk.path && relativeResourcePath(input.sdk.path, source.fileName) !== undefined
      && source.referencedFiles.some(reference => /\.d\.(?:ts|ets)$/.test(reference.fileName)
        && !program.getSourceFile(path.resolve(path.dirname(source.fileName), reference.fileName)))) {
      return semanticSdkPartial(rootUri, { layer: "sdk", reason: "declaration-not-found" })
    }
    const missing = firstMissingInput(checkInput(program, source, cancellation, input.trace))
    if (missing) {
      const specifier = missingSdkSpecifier(missing)
      return specifier ? semanticSdkPartial(rootUri, specifier.length <= 4096 && !specifier.includes("\0")
        ? { layer: "sdk", reason: "module-not-found", specifier }
        : { layer: "sdk", reason: "coverage-unproven" }, diagnosticInput(missing))
        : unavailable("dependency-inputs-incomplete", missing)
    }
  }
  const proof = observePreparedInputs(input, program, checkpoint)
  if (proof.admit({ ...workspace, resetTypeEngine: false }, input.generation, input.roots) !== program) {
    return unavailable("current-program-inputs-unproven")
  }
  const standardLibraryRoot = path.dirname(ts.getDefaultLibFilePath(input.compilerOptions))
  const standardLibrary = sources.filter(source => sameResolvedPath(path.dirname(path.resolve(source.fileName)), standardLibraryRoot)
    && /^lib(?:\.[a-z0-9]+)*\.d\.ts$/.test(path.basename(source.fileName)))
  if (standardLibrary.length === 0) return unavailable("standard-library-unavailable")
  const manifest = (files: readonly ts.SourceFile[]) => files.map(source =>
    [path.resolve(source.fileName), sha256(source.text)]).sort((left, right) => left[0].localeCompare(right[0]))
  const identity = {
    canonicalRoot: workspace.canonicalRootId,
    engineGeneration: input.generation,
    membershipRevision: workspace.projectMembership.revision,
    sourcesSha256: digest(manifest(sources)),
    overlaysSha256: digest(workspace.documents.filter(document => document.overlay).map(document =>
      [path.resolve(document.path), document.documentVersion ?? null, sha256(document.content)])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])))),
    optionsSha256: digest(input.compilerOptions), projectGraphSha256: digest(graph),
    sdkSha256: digest([input.sdk, manifest(sources.filter(source => inside(input.sdk.path!, source.fileName)))]),
    standardLibrarySha256: digest(manifest(standardLibrary)), backend: compilerArtifactIdentity,
  }
  const programId = programIds.get(program) ?? randomUUID()
  const report: SemanticReadinessReport = {
    rootUri, semanticState: "ready", semanticGeneration: programId,
    readyCapabilities: SEMANTIC_READY_CAPABILITIES, unavailableReasons: [], unavailableInput: null,
    inputIdentity: { ...identity, sha256: digest(identity) },
    coverage: { projectSources: workspace.projectMembership.paths.length,
      sdkSources: sources.filter(source => inside(input.sdk.path!, source.fileName)).length,
      standardLibrarySources: standardLibrary.length, programSources: sources.length, dependenciesComplete: true },
  }
  // Construct every returned field first; this is the real final input fence,
  // not a cached validity answer or a check moved before identity construction.
  checkpoint()
  if (proof.admit({ ...workspace, resetTypeEngine: false }, input.generation, input.roots) !== program) {
    return unavailable("inputs-changed-during-preparation")
  }
  programIds.set(program, programId)
  return { proof, report }
}

function missingSdkSpecifier(diagnostic: ts.Diagnostic): string | undefined {
  if ((diagnostic.code !== 2307 && diagnostic.code !== 2792) || !diagnostic.file
    || diagnostic.start === undefined || diagnostic.length === undefined) return
  const token = diagnostic.file.text.slice(diagnostic.start, diagnostic.start + diagnostic.length)
  return /^["'](@(?:ohos|system|kit|arkts)\.[^"'\r\n]+)["']$/.exec(token)?.[1]
}

function observePreparedInputs(input: ReadinessPreparation, program: ts.Program, checkpoint: () => void) {
  const proof = new TypeScriptResidentReferenceState(input.sdkRoots, input.readSourceFile, checkpoint, () => {
    const compiler = input.witness?.freshness(checkpoint, "capture")
    const packages = input.resolver.configurationFreshness(input.workspace.rootPath, checkpoint, "capture")
    return compiler && packages ? () => compiler() && packages() : undefined
  }, undefined, input.residentProofOwner)
  proof.prepare(input.workspace, input.generation, input.roots)
  proof.observe(program)
  return proof
}

/** Observe actual dependency checking, never position/symbol answer prequeries. */
function checkInput(program: ts.Program, source: ts.SourceFile, cancellation: ts.CancellationToken | undefined,
  trace?: ReadinessTrace): readonly ts.Diagnostic[] {
  if (!trace) return program.getSemanticDiagnostics(source, cancellation)
  const startedAt = performance.now()
  const emit = (suffix: string, fields: TraceFields = {}) => {
    try { trace(`semantic.readiness.input-check.${suffix}`, {
      sourcePath: path.resolve(source.fileName), monotonicNs: process.hrtime.bigint().toString(), ...fields,
    }) } catch { /* Optional attribution must not change preparation or cancellation. */ }
  }
  emit("start")
  try {
    const diagnostics = program.getSemanticDiagnostics(source, cancellation)
    emit("complete", { elapsedMs: performance.now() - startedAt })
    return diagnostics
  } catch (error) {
    if (error instanceof ts.OperationCanceledException) {
      emit("interrupted", { elapsedMs: performance.now() - startedAt, compilerCancelled: true })
    }
    throw error
  }
}

/** Status admission does not ask the compiler for a Program or a checker. */
export function currentOfficialReadiness(observation: OfficialReadinessObservation | SemanticReadinessReport | undefined,
  workspace: SemanticWorkspaceView, generation: number, roots: readonly string[]): SemanticReadinessReport {
  if (!observation) return semanticUnprepared(pathToFileURL(workspace.rootPath).href)
  if (!("proof" in observation)) return observation
  return observation.proof.admit(workspace, generation, roots)
    ? observation.report : semanticUnprepared(observation.report.rootUri, "prepared-inputs-no-longer-current")
}

function sha256(content: string): string { return createHash("sha256").update(content).digest("hex") }
function digest(value: unknown): string { return sha256(JSON.stringify(value)) }
function inside(root: string, source: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(source))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
