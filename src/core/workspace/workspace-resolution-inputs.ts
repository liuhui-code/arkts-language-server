import path from "node:path"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import { resolutionInputWasRebased } from "../../project/resolution-input-admission.js"

/** Enumerable symbol survives local projections, but is deliberately absent from JSON/Worker snapshots. */
export const RESOLUTION_INPUT_GENERATION = Symbol("semantic-resolution-input-generation")
export interface ResolutionInputGeneration {
  readonly owner: LocalPackageResolver
  readonly generation: number
  readonly recoveredUnnotifiedInput: boolean
}

/** These caches consume resolver decisions, so their lifetime cannot outlive that generation. */
export class WorkspaceResolutionInputs {
  private generation: number
  constructor(private readonly resolver: LocalPackageResolver,
    private readonly caches: readonly { clear(): void }[], private readonly checkpoint: () => void) {
    this.generation = resolver.inputGeneration
  }
  /** Compiler consumers also own source lookup facts absent from package metadata. */
  changedNamespaces(rootPath: string, changes: readonly {
    readonly kind: "created" | "changed" | "deleted"
    readonly sourcePath: string; readonly physicalPath?: string
  }[]): void {
    const paths = changes.flatMap(change => change.kind === "changed" ? []
      : [change.sourcePath, ...(change.physicalPath ? [change.physicalPath] : [])])
    if (!paths.length) return
    this.resolver.invalidateNamespaces([...new Set(paths.map(file => path.dirname(path.resolve(file))))])
    this.prepare(rootPath)
  }
  prepare(rootPath: string): ResolutionInputGeneration {
    this.checkpoint()
    const reloaded = this.resolver.refreshInputGeneration(rootPath, this.checkpoint)
    const recoveredUnnotifiedInput = reloaded || resolutionInputWasRebased(this.resolver)
    if (this.generation !== this.resolver.inputGeneration) {
      for (const cache of this.caches) cache.clear()
      this.generation = this.resolver.inputGeneration
    }
    return { owner: this.resolver, generation: this.resolver.generation, recoveredUnnotifiedInput }
  }
}

/** Creation candidates are original observed identities, including proven physical aliases. */
export function invalidateCreatedResolutionClosures<Closure extends {
  readonly workspaceRoot: string; readonly creationCandidatesComplete: boolean;
  readonly creationCandidatePaths: readonly string[]
}>(closures: Map<string, Closure>, createdPaths: ReadonlySet<string>): Set<string> {
  const affectedRoots = new Set<string>()
  if (createdPaths.size === 0) return affectedRoots
  for (const [ownerPath, closure] of closures) {
    if (closure.creationCandidatesComplete === true
      && !closure.creationCandidatePaths.some(candidate => createdPaths.has(candidate))) continue
    closures.delete(ownerPath)
    affectedRoots.add(closure.workspaceRoot)
  }
  return affectedRoots
}
