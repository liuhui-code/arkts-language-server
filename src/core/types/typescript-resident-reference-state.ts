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

/** Admission consumes an already observed Program, never asks the compiler to build one. */
export class TypeScriptResidentReferenceState {
  private prepared: ResidentInputs | undefined
  private observation: ResidentObservation | undefined

  constructor(
    private readonly sdkRoots: readonly string[],
    private readonly readSourceFile: (filePath: string) => string | null,
    private readonly checkpoint: () => void,
    private readonly configurationFreshness: () => (() => boolean) | undefined,
  ) {}

  prepare(workspace: SemanticWorkspaceView, generation: number, roots: readonly string[]): void {
    const prepared = inputsFor(workspace, generation, roots, this.sdkRoots)
    if (prepared?.signature !== this.prepared?.signature) this.observation = undefined
    this.prepared = prepared
  }

  invalidate(): void {
    this.prepared = undefined
    this.observation = undefined
  }

  /** Called only after an existing compiler query has successfully built/synchronized its Program. */
  observe(program: ts.Program | undefined): void {
    const prepared = this.prepared
    if (!program || !prepared || !covers(program, prepared.requiredPaths)
      || !samePaths(program.getRootFileNames(), prepared.roots)) {
      this.observation = undefined
      return
    }
    if (this.observation?.program === program && this.observation.signature === prepared.signature) {
      if (!this.observation.configurationCurrent()) this.observation = undefined
      return
    }
    const configurationCurrent = this.configurationFreshness()
    if (!configurationCurrent) { this.observation = undefined; return }
    const identities: Array<readonly [string, string]> = []
    for (const source of program.getSourceFiles()) {
      this.checkpoint()
      const filePath = path.resolve(source.fileName)
      const document = prepared.documents.get(filePath)
      if (document && document.fingerprint !== fingerprint(source.text)) {
        this.observation = undefined
        return
      }
      if (document?.overlay) continue
      const before = diskIdentity(filePath)
      if (!before || (prepared.aliases.has(before.physicalPath)
        && prepared.aliases.get(before.physicalPath) !== filePath)) {
        this.observation = undefined
        return
      }
      // A fresh stat cannot certify stale compiler text. Compare the actual
      // loaded Program against the current bounded disk authority first.
      const currentText = this.readSourceFile(filePath)
      this.checkpoint()
      if (currentText !== source.text || diskIdentity(filePath)?.stamp !== before.stamp) {
        this.observation = undefined
        return
      }
      identities.push([filePath, before.stamp])
    }
    this.checkpoint()
    this.observation = configurationCurrent()
      ? { program, signature: prepared.signature, diskIdentities: identities, configurationCurrent }
      : undefined
  }

  admit(workspace: SemanticWorkspaceView, generation: number, roots: readonly string[]): ts.Program | undefined {
    this.checkpoint()
    const observation = this.observation
    if (!observation || workspace.resetTypeEngine) return undefined
    if (!observation.configurationCurrent()) { this.observation = undefined; return undefined }
    const current = inputsFor(workspace, generation, roots, this.sdkRoots)
    if (!current || current.signature !== observation.signature
      || !covers(observation.program, current.requiredPaths)) return undefined
    for (const [filePath, document] of current.documents) {
      this.checkpoint()
      const source = observation.program.getSourceFile(filePath)
      if (!source || fingerprint(source.text) !== document.fingerprint) return undefined
    }
    for (const [filePath, stamp] of observation.diskIdentities) {
      this.checkpoint()
      if (diskIdentity(filePath)?.stamp !== stamp) {
        this.observation = undefined
        return undefined
      }
    }
    this.checkpoint()
    return observation.program
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
