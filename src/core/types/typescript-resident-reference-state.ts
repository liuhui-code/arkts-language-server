import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type ts from "typescript"

import type { SemanticWorkspaceView } from "../workspace/document-store.js"

interface ResidentInputs {
  readonly signature: string
  readonly requiredPaths: readonly string[]
  readonly roots: readonly string[]
  readonly aliases: ReadonlyMap<string, string>
  readonly documents: ReadonlyMap<string, { readonly fingerprint: string; readonly overlay: boolean }>
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

  admit(workspace: SemanticWorkspaceView, generation: number, roots: readonly string[]): ts.Program | undefined {
    this.checkpoint()
    const observation = this.observation
    if (!observation) { this.reject("admit", this.observationFailure); return undefined }
    if (workspace.resetTypeEngine) { this.reject("admit", "reset-required"); return undefined }
    if (!observation.configurationCurrent()) {
      this.observation = undefined
      this.reject("admit", "configuration-changed")
      return undefined
    }
    const current = inputsFor(workspace, generation, roots, this.sdkRoots)
    if (!current) { this.reject("admit", "inputs-incomplete"); return undefined }
    if (current.signature !== observation.signature) { this.reject("admit", "inputs-changed"); return undefined }
    if (!covers(observation.program, current.requiredPaths)) {
      this.reject("admit", "program-coverage-incomplete")
      return undefined
    }
    for (const [filePath, document] of current.documents) {
      this.checkpoint()
      const source = observation.program.getSourceFile(filePath)
      if (!source || fingerprint(source.text) !== document.fingerprint) {
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
): ResidentInputs | undefined {
  const membership = workspace.projectMembership
  if (!membership || membership.status !== "complete") return undefined
  const memberPaths = normalizedPaths(membership.paths)
  const rootPaths = normalizedPaths(roots)
  const sdkPaths = normalizedPaths(sdkRoots)
  const documents = new Map(workspace.documents.map(document => [path.resolve(document.path), {
    fingerprint: fingerprint(document.content), overlay: document.overlay,
  }]))
  const overlays = workspace.documents.filter(document => document.overlay).map(document => [
    path.resolve(document.path), document.documentVersion ?? null, fingerprint(document.content),
  ]).sort((left, right) => String(left[0]).localeCompare(String(right[0])))
  const aliases = new Map([...(workspace.overlayPaths ?? [])].map(([physical, lexical]) => (
    [path.resolve(physical), path.resolve(lexical)] as const
  )))
  const signature = fingerprint(JSON.stringify([
    path.resolve(workspace.rootPath), workspace.canonicalRootId, workspace.typeEngineResetEpoch,
    workspace.contentRevision, generation, membership.revision, memberPaths, overlays,
    [...aliases].sort((left, right) => left[0].localeCompare(right[0])), rootPaths, sdkPaths,
  ]))
  return {
    signature, roots: rootPaths, aliases, documents,
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
