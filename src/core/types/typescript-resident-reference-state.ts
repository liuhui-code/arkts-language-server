import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type ts from "typescript"

import type { SemanticWorkspaceView } from "../workspace/document-store.js"

interface ResidentInputs {
  readonly signature: string
  readonly owner: string
  readonly requiredPaths: readonly string[]
  readonly roots: readonly string[]
  readonly aliases: ReadonlyMap<string, string>
  readonly documents: ReadonlyMap<string, { readonly fingerprint: string; readonly overlay: boolean; readonly version?: number }>
}

interface ResidentObservation {
  readonly program: ts.Program
  readonly signature: string
  /** Metadata only: no second source/AST cache or compiler residency. */
  readonly diskIdentities: readonly (readonly [string, string])[]
  readonly configurationCurrent: () => boolean
}

export interface ResidentReferenceProofFailure {
  readonly stage: "configuration" | "prepare" | "observe" | "admit"
  readonly reason: string
  readonly sourcePath?: string
  readonly retainedPaths?: number
}

/** Admission consumes an already observed Program, never asks the compiler to build one. */
export class TypeScriptResidentReferenceState {
  private prepared: ResidentInputs | undefined
  private observation: ResidentObservation | undefined
  private observationFailure = "program-unobserved"

  constructor(
    private readonly sdkRoots: readonly string[],
    private readonly readSourceFile: (filePath: string) => string | null,
    private readonly checkpoint: () => void,
    private readonly configurationFreshness: () => (() => boolean) | undefined,
    private readonly onFailure?: (failure: ResidentReferenceProofFailure) => void,
    private readonly owner?: object,
  ) {}

  prepare(workspace: SemanticWorkspaceView, generation: number, roots: readonly string[]): void {
    const prepared = inputsFor(workspace, generation, roots, this.sdkRoots)
    if (prepared?.signature !== this.prepared?.signature) {
      this.observation = undefined
      this.observationFailure = "inputs-changed"
    }
    this.prepared = prepared
    if (!prepared) this.reject("prepare", "inputs-incomplete")
  }

  invalidate(): void {
    this.prepared = undefined
    this.observation = undefined
    this.observationFailure = "program-unobserved"
  }

  captureCurrentProgram(service: Pick<ts.LanguageService, "getProgram">): void {
    this.observe(service.getProgram())
  }

  /** Copy immutable proof metadata only; admission and invalidation stay independent. */
  adoptValidatedProof(proof: TypeScriptResidentReferenceState | undefined): void {
    this.observation = undefined
    this.observationFailure = "program-unobserved"
    if (!proof || !this.owner || proof.owner !== this.owner || proof.sdkRoots !== this.sdkRoots
      || !this.prepared || !proof.prepared || this.prepared.owner !== proof.prepared.owner
      || !proof.observation || proof.observation.signature !== proof.prepared.signature) return
    this.prepared = proof.prepared
    this.observation = proof.observation
  }

  /** An optimization opportunity, never a proof that the edited Program is current. */
  canSynchronizeOverlay(workspace: SemanticWorkspaceView, generation: number, roots: readonly string[],
    fingerprintText: (content: string) => string = fingerprint): boolean {
    this.checkpoint()
    const prepared = this.prepared
    const observation = this.observation
    if (!prepared || !observation || observation.signature !== prepared.signature || workspace.resetTypeEngine) return false
    const rejected = (reason: string): false => { this.reject("admit", `overlay-sync-${reason}`); return false }
    const current = inputsFor(workspace, generation, roots, this.sdkRoots, fingerprintText)
    if (!current) return rejected("inputs-incomplete")
    if (current.signature === prepared.signature) return false
    if (current.owner !== prepared.owner) return rejected("owner-changed")
    if (!samePaths(current.requiredPaths, prepared.requiredPaths)) return rejected("required-paths-changed")
    if (!samePaths(current.roots, prepared.roots)) return rejected("roots-changed")
    if (current.aliases.size !== prepared.aliases.size
      || [...current.aliases].some(([physical, lexical]) => prepared.aliases.get(physical) !== lexical)) return rejected("aliases-changed")
    const overlayCount = (documents: ResidentInputs["documents"]) => [...documents.values()].filter(document => document.overlay).length
    if (overlayCount(current.documents) !== overlayCount(prepared.documents)) return rejected("overlays-changed")
    let changed = false
    for (const [filePath, document] of current.documents) {
      this.checkpoint()
      const previous = prepared.documents.get(filePath)
      if (!document.overlay) {
        const source = observation.program.getSourceFile(filePath)
        if (previous?.overlay || !source || fingerprintText(source.text) !== document.fingerprint) return rejected("disk-document-changed")
        continue
      }
      if (!previous?.overlay) return rejected("authority-changed")
      if (previous.fingerprint !== document.fingerprint) {
        if (!document.overlay || !Number.isSafeInteger(previous.version) || previous.version! < 0
          || document.version !== previous.version! + 1) return rejected("version-unproven")
        changed = true
      } else if (previous.version !== document.version) return rejected("promotion-changed")
    }
    return changed && observation.configurationCurrent()
  }

  /** Called only after an existing compiler query has successfully built/synchronized its Program. */
  observe(program: ts.Program | undefined): void {
    const prepared = this.prepared
    if (!program) return this.rejectObservation("program-unavailable")
    if (!prepared) return this.rejectObservation("inputs-incomplete")
    if (!covers(program, prepared.requiredPaths)) return this.rejectObservation("program-coverage-incomplete")
    if (!samePaths(program.getRootFileNames(), prepared.roots)) return this.rejectObservation("program-roots-mismatch")
    if (this.observation?.program === program && this.observation.signature === prepared.signature) {
      if (!this.observation.configurationCurrent()) this.rejectObservation("configuration-changed")
      return
    }
    const configurationCurrent = this.configurationFreshness()
    if (!configurationCurrent) return this.rejectObservation("configuration-unproven")
    const identities: Array<readonly [string, string]> = []
    for (const source of program.getSourceFiles()) {
      this.checkpoint()
      const filePath = path.resolve(source.fileName)
      const document = prepared.documents.get(filePath)
      if (document && document.fingerprint !== fingerprint(source.text)) {
        return this.rejectObservation("overlay-content-mismatch", filePath)
      }
      if (document?.overlay) continue
      const before = diskIdentity(filePath)
      if (!before) return this.rejectObservation("disk-source-unavailable", filePath)
      if (prepared.aliases.has(before.physicalPath)
        && prepared.aliases.get(before.physicalPath) !== filePath) {
        return this.rejectObservation("source-alias-conflict", filePath)
      }
      // A fresh stat cannot certify stale compiler text. Compare the actual
      // loaded Program against the current bounded disk authority first.
      const currentText = this.readSourceFile(filePath)
      this.checkpoint()
      if (currentText !== source.text) return this.rejectObservation("disk-content-mismatch", filePath)
      if (diskIdentity(filePath)?.stamp !== before.stamp) return this.rejectObservation("disk-source-changed", filePath)
      identities.push([filePath, before.stamp])
    }
    this.checkpoint()
    if (!configurationCurrent()) return this.rejectObservation("configuration-changed")
    this.observation = { program, signature: prepared.signature, diskIdentities: identities, configurationCurrent }
  }

  admit(workspace: SemanticWorkspaceView, generation: number, roots: readonly string[],
    fingerprintText: (content: string) => string = fingerprint): ts.Program | undefined {
    this.checkpoint()
    const observation = this.observation
    if (!observation) { this.reject("admit", this.observationFailure); return undefined }
    if (workspace.resetTypeEngine) { this.reject("admit", "reset-required"); return undefined }
    if (!observation.configurationCurrent()) {
      this.observation = undefined
      this.reject("admit", "configuration-changed")
      return undefined
    }
    const current = inputsFor(workspace, generation, roots, this.sdkRoots, fingerprintText)
    if (!current) { this.reject("admit", "inputs-incomplete"); return undefined }
    if (current.signature !== observation.signature) {
      this.reject("admit", "inputs-changed")
      // A disproved observation cannot certify this input again on the fallback RPC.
      // A later successful compiler query must observe the current Program afresh.
      this.observation = undefined
      this.observationFailure = "inputs-changed"
      return undefined
    }
    if (!covers(observation.program, current.requiredPaths)) {
      this.reject("admit", "program-coverage-incomplete")
      return undefined
    }
    for (const [filePath, document] of current.documents) {
      this.checkpoint()
      const source = observation.program.getSourceFile(filePath)
      if (!source || fingerprintText(source.text) !== document.fingerprint) {
        this.reject("admit", "overlay-content-mismatch", filePath)
        return undefined
      }
    }
    for (const [filePath, stamp] of observation.diskIdentities) {
      this.checkpoint()
      if (diskIdentity(filePath)?.stamp !== stamp) {
        this.observation = undefined
        this.reject("admit", "disk-source-changed", filePath)
        return undefined
      }
    }
    this.checkpoint()
    return observation.program
  }

  private rejectObservation(reason: string, sourcePath?: string): void {
    this.observation = undefined
    this.reject("observe", reason, sourcePath)
  }

  private reject(stage: ResidentReferenceProofFailure["stage"], reason: string, sourcePath?: string): void {
    if (stage !== "admit") this.observationFailure = reason
    try { this.onFailure?.({ stage, reason, ...(sourcePath ? { sourcePath } : {}) }) }
    catch { /* Optional evidence cannot change complete fallback or admission. */ }
  }
}

function inputsFor(
  workspace: SemanticWorkspaceView,
  generation: number,
  roots: readonly string[],
  sdkRoots: readonly string[],
  fingerprintText: (content: string) => string = fingerprint,
): ResidentInputs | undefined {
  const membership = workspace.projectMembership
  if (!membership || membership.status !== "complete") return undefined
  const memberPaths = normalizedPaths(membership.paths)
  const rootPaths = normalizedPaths(roots)
  const sdkPaths = normalizedPaths(sdkRoots)
  const documents = new Map(workspace.documents.map(document => [path.resolve(document.path), {
    fingerprint: fingerprintText(document.content), overlay: document.overlay, version: document.documentVersion,
  }]))
  const overlays = workspace.documents.filter(document => document.overlay).map(document => [
    path.resolve(document.path), document.documentVersion ?? null, fingerprintText(document.content),
  ]).sort((left, right) => String(left[0]).localeCompare(String(right[0])))
  const aliases = new Map([...(workspace.overlayPaths ?? [])].map(([physical, lexical]) => (
    [path.resolve(physical), path.resolve(lexical)] as const
  )))
  const signature = fingerprintText(JSON.stringify([
    path.resolve(workspace.rootPath), workspace.canonicalRootId, workspace.typeEngineResetEpoch,
    workspace.contentRevision, generation, membership.revision, memberPaths, overlays,
    [...aliases].sort((left, right) => left[0].localeCompare(right[0])), rootPaths, sdkPaths,
  ]))
  return {
    signature, owner: JSON.stringify([path.resolve(workspace.rootPath), workspace.canonicalRootId,
      workspace.typeEngineResetEpoch, workspace.contentRevision]), roots: rootPaths, aliases, documents,
    requiredPaths: normalizedPaths([...memberPaths, ...overlays.map(overlay => String(overlay[0])),
      workspace.state.path, ...sdkPaths]),
  }
}

function covers(program: ts.Program, requiredPaths: readonly string[]): boolean {
  const sources = new Set(program.getSourceFiles().map(source => path.resolve(source.fileName)))
  return requiredPaths.every(filePath => sources.has(filePath))
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  const normalized = normalizedPaths(left)
  return normalized.length === right.length && normalized.every((filePath, index) => filePath === right[index])
}

function normalizedPaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map(filePath => path.resolve(filePath)))].sort()
}

function fingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

function diskIdentity(filePath: string): { readonly physicalPath: string; readonly stamp: string } | undefined {
  try {
    if (!fs.lstatSync(filePath).isFile()) return undefined
    const physicalPath = fs.realpathSync.native(filePath)
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return undefined
    return { physicalPath,
      stamp: JSON.stringify([physicalPath, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]) }
  } catch {
    return undefined
  }
}
