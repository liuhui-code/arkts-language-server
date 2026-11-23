import { scopePathMetadata } from "./scope-path-metadata.js"
import { changedMembershipFactSources } from "../workspace/project-membership-fact-delta.js"
import { ScopeDependencyGraph } from "./scope-dependency-graph.js"
import type { ScopeDependencyEnvironment } from "./scope-dependency-environment.js"
import { createHash } from "node:crypto"
import path from "node:path"
import type ts from "typescript"
import type { ProjectFileAccessPort, ProjectMembershipSnapshot, SemanticWorkspaceView } from "../workspace/document-store.js"
import { WORKSPACE_CATALOG_STAMP, WORKSPACE_MEMBERSHIP_ORIGIN } from "../workspace/semantic-workspace-view.js"
import type { RetainedConfigurationProof } from "../../project/loaded-configuration-witness.js"
import { resolvedPathIdentity, sameResolvedPath, relativePathWithinRoot } from "../../project/path-identity.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"
import type { ProjectSourceRole } from "./project-source-role.js"
import { changedOverlayPaths } from "../workspace/overlay-document-map.js"
import { isStoreOwnedProjectMembership } from "../workspace/project-membership-access.js"
import { SourceReadOrigin } from "../../project/source-read-origin.js"
import { SourceRolePool } from "./source-role-pool.js"
import { createScopeRoleDelta } from "./scope-role-delta.js"
import { OPERATION_SCOPE, type OperationScopeProof, type ScopedWorkspace } from "./operation-scope-execution.js"
import { completionMatchQuality } from "./typescript-completion-ranking.js"
import { operationScopeProfileKey } from "./operation-scope-profile-key.js"

type CatalogAccess = ProjectFileAccessPort & Required<Pick<ProjectFileAccessPort,
  "readSnapshot" | "refreshProjectMembership" | "membershipFor" | "overlayFor">>
export interface ProjectSyntaxProfile {
  readonly options: ts.CompilerOptions
  readonly dependencies?: ScopeDependencyEnvironment
  readonly nativePackages?: ReadonlyMap<string, string>
  readonly configuration: RetainedConfigurationProof | undefined
}
interface CompletedFactsInputs {
  readonly catalog: ProjectMembershipSnapshot
  readonly paths: readonly string[]
  readonly generation: number
  readonly aliases: string
  readonly canonicalRootId: string
  readonly contentRevision: number
  readonly resetEpoch: number
}
interface SourceFact { readonly key: string; readonly roleKey: string; readonly role: ProjectSourceRole; readonly origin?: SourceReadOrigin }

/** Complete syntax-role metadata, never a second AST/text cache or a READY proof.
 * Unknown adapters keep their original full compiler scope. */
export class ProjectOperationScopes {
  private readonly facts = new Map<string, SourceFact>()
  private readonly rolePool: SourceRolePool
  private roles: ReadonlyMap<string, ProjectSourceRole> = new Map()
  private rolesDirty = false
  private overlayState: { current(): boolean } | undefined
  private factsState: CompletedFactsInputs | undefined
  private revision = 0
  private readonly fullScopes = new Set<string>()
  private readonly options: string
  private readonly profileKey: string
  private readonly dependencies?: ScopeDependencyGraph
  private resolutionGeneration: number
  private constructor(private readonly root: string, private readonly profile: ProjectSyntaxProfile,
    private readonly access: CatalogAccess, private readonly generation: () => number) {
    this.rolePool = new SourceRolePool(profile.options)
    this.options = JSON.stringify(profile.options); this.profileKey = operationScopeProfileKey(profile); this.resolutionGeneration = generation()
    if (profile.dependencies) this.dependencies = new ScopeDependencyGraph(profile.dependencies,
      this.access.checkpoint ? () => this.access.checkpoint!() : () => { this.access.overlayFor(this.root) })
  }

  static create(workspace: SemanticWorkspaceView, profile: ProjectSyntaxProfile,
    access: ProjectFileAccessPort | undefined, generation: () => number,
    pending?: ProjectOperationScopes, retain?: (draft: ProjectOperationScopes) => void): ProjectOperationScopes | undefined {
    if (!profile.configuration || !access?.overlayFor || !access.readSnapshot || !access.refreshProjectMembership || !access.membershipFor) return undefined
    const index = pending?.canResume(workspace, profile) ? pending
      : new ProjectOperationScopes(workspace.rootPath, profile, access as CatalogAccess, generation)
    retain?.(index)
    index.ensure(workspace)
    return index
  }

  private canResume(workspace: SemanticWorkspaceView, profile: ProjectSyntaxProfile): boolean {
    const membership = workspace.projectMembership
    const checkpoint = () => { if (membership) this.checkpoint(workspace, membership) }
    return this.root === workspace.rootPath && this.profile.dependencies?.resolver === profile.dependencies?.resolver
      && this.profileKey === operationScopeProfileKey(profile)
      && this.profile.configuration!.current(checkpoint)
      && (!this.profile.dependencies?.baselineInputs || this.profile.dependencies.baselineInputs.current(checkpoint))
  }

  project(workspace: SemanticWorkspaceView, allowed: readonly string[], roots: readonly string[], groupId: string): SemanticWorkspaceView {
    const membership = this.ensure(workspace)
    const allowedSet = scopePathMetadata(allowed).byIdentity
    const selected = new Set(this.dependencies?.roots(allowed) ?? allowed.filter(file => this.facts.get(file)?.role.ambient))
    const projected = !this.fullScopes.has(groupId)
    if (!projected) for (const file of allowed) selected.add(file)
    for (const file of roots) {
      const admitted = allowedSet.get(resolvedPathIdentity(file))
      if (admitted) selected.add(admitted)
    }
    const revision = this.revision, generation = this.resolutionGeneration
    const graphCurrent = this.dependencies?.proof(), overlayState = this.overlayState
    const dependencyFreeOmissions = this.dependencies?.nativeSafe(allowed, selected)
      ?? allowed.every(file => selected.has(file) || this.facts.get(file)?.role.dependencyFree === true)
    const proof: OperationScopeProof = { options: this.options, projected, fallbackRoots: allowed,
      nativePackageBaseline: dependencyFreeOmissions ? this.profile.nativePackages : undefined,
      fallback: () => { this.fullScopes.add(groupId) }, current: () => {
        if (this.revision !== revision || this.generation() !== generation || !this.sameMembership(workspace, membership)) return false
        return (!graphCurrent || graphCurrent()) && this.overlaysCurrent(workspace, membership, overlayState) && this.profile.configuration!.current(() => this.checkpoint(workspace, membership))
      } }
    return { ...workspace, projectMembership: membership, semanticRootPaths: allowed.filter(file => selected.has(file)), [OPERATION_SCOPE]: proof } as ScopedWorkspace
  }

  completionRoots(workspace: SemanticWorkspaceView, prefix: string) {
    const allowed = (workspace as ScopedWorkspace)[OPERATION_SCOPE]?.fallbackRoots
    if (!allowed) return undefined
    const normalized = prefix.toLowerCase(), revision = this.revision, generation = this.generation()
    const roots = this.dependencies?.completionRoots(allowed, normalized) ?? allowed.filter(file => {
      const exports = this.facts.get(file)?.role.exports
      return !exports || exports.unknown || exports.stars.length > 0
        || exports.names.some(name => completionMatchQuality(name, normalized) !== undefined)
    })
    return { roots, current: () => this.revision === revision && this.generation() === generation }
  }

  private ensure(workspace: SemanticWorkspaceView): ProjectMembershipSnapshot {
    const overlayState = this.access.overlayState?.()
    const membership = workspace.projectMembership ?? this.access.membershipFor(this.root)
    if (!this.sameMembership(workspace, membership)) throw new SemanticInputUnavailableError()
    if (!this.profile.configuration!.current(() => this.checkpoint(workspace, membership))) throw new SemanticInputUnavailableError()
    const generation = this.generation()
    if (generation !== this.resolutionGeneration) {
      this.fullScopes.clear(); this.resolutionGeneration = generation; this.revision++
    }
    const catalog = this.access.membershipFor(this.root)
    const aliases = JSON.stringify([...(workspace.overlayPaths ?? [])].filter(([file, alias]) => file !== alias))
    const state = this.factsState
    const stableFacts = state !== undefined && isStoreOwnedProjectMembership(catalog)
      && state.canonicalRootId === workspace.canonicalRootId && state.resetEpoch === workspace.typeEngineResetEpoch
      && state.generation === generation && !this.rolesDirty
      && state.paths.length === membership.paths.length && state.paths.every((file, index) => file === membership.paths[index])
    const sameOverlays = this.overlayState?.current() === true, sameAliases = state?.aliases === aliases
    const reuseFacts = stableFacts && sameOverlays && sameAliases && state.catalog === catalog
    let changedFacts: readonly string[] | undefined
    if (stableFacts && !reuseFacts && !workspace.resetTypeEngine && !workspace.removedPaths?.length) {
      const disk = state.catalog === catalog ? []
        : changedMembershipFactSources(state.catalog, catalog) ?? this.diskFactDelta(workspace, state)
      const overlays = sameOverlays ? [] : this.overlayState && overlayState
        ? changedOverlayPaths(this.overlayState, overlayState) : undefined
      if (disk && overlays && [...disk, ...overlays].every(file => this.facts.has(file))
        && (sameAliases || this.overlayAliasesCovered(workspace, state.aliases, aliases, overlays))) {
        changedFacts = [...new Set([...disk, ...overlays])]
      }
    }
    const previousRoles = this.roles
    if (!reuseFacts) {
      // Revoke before writes: a cancelled partial pass must never revive the old
      // completed receipt, even if its input values later look equal again.
      this.factsState = undefined
      this.updateFacts(workspace, membership, changedFacts)
    }
    const lookup = scopeLookupInputs(this.access, workspace.overlayPaths, this.facts)
    const delta = changedFacts && createScopeRoleDelta(previousRoles, this.roles, changedFacts)
    this.dependencies?.update(workspace, this.roles, lookup.overlay, lookup.origin, delta)
    if (!this.sameMembership(workspace, membership)) throw new SemanticInputUnavailableError()
    this.overlayState = overlayState?.current() ? overlayState : undefined
    // Capture exactly the producer that covered the pass. A replacement with
    // equal numeric revision cannot certify facts from another catalog owner.
    const finalCatalog = this.access.membershipFor(this.root)
    this.factsState = this.overlayState && finalCatalog === catalog && isStoreOwnedProjectMembership(catalog)
      && this.generation() === generation ? { catalog, generation, aliases,
        canonicalRootId: workspace.canonicalRootId, contentRevision: workspace.contentRevision, resetEpoch: workspace.typeEngineResetEpoch,
        paths: Object.isFrozen(membership.paths) ? membership.paths : Object.freeze([...membership.paths]) } : undefined
    return membership
  }

  /** Only an observed changed overlay may add/remove its already proven whole-root
   * spelling. Nested links, physical retargets and unrelated alias changes fall back. */
  private overlayAliasesCovered(workspace: SemanticWorkspaceView, previous: string,
    current: string, changed: readonly string[]): boolean {
    const before = new Map<string, string>(JSON.parse(previous)), after = new Map<string, string>(JSON.parse(current))
    const changes = new Set(changed)
    for (const [physical, logical] of [...before, ...after]) {
      if (before.get(physical) === after.get(physical)) continue
      const relative = relativePathWithinRoot(this.root, logical)
      if (!changes.has(logical) || !this.facts.has(logical) || !relative
        || !sameResolvedPath(physical, path.resolve(workspace.canonicalRootId, relative))) return false
    }
    return true
  }

  /** Existing store-owned complete disk history, never compiler-filtered changedPaths.
   * A gap/reset/unknown path falls back to the original full facts pass. */
  private diskFactDelta(workspace: SemanticWorkspaceView, state: CompletedFactsInputs): readonly string[] | undefined {
    if (workspace.resetTypeEngine || workspace.removedPaths?.length || state.contentRevision >= workspace.contentRevision) return undefined
    const history = workspace.contentDeltas
    const start = history?.findIndex(delta => delta.fromRevision === state.contentRevision) ?? -1
    if (!history || start < 0) return undefined
    let cursor = state.contentRevision
    const changed = new Set<string>()
    for (let index = start; index < history.length; index++) {
      const delta = history[index]
      if (delta.rootPath !== path.resolve(this.root) || delta.fromRevision !== cursor
        || delta.toRevision <= cursor || delta.toRevision > workspace.contentRevision) return undefined
      for (const file of delta.changedPaths) {
        if (path.resolve(file) !== file || !this.facts.has(file)) return undefined
        changed.add(file)
      }
      cursor = delta.toRevision
      if (cursor === workspace.contentRevision) return [...changed]
    }
    return undefined
  }

  private updateFacts(workspace: SemanticWorkspaceView, membership: ProjectMembershipSnapshot,
    changedPaths?: readonly string[]): void {
    let changed = false
    const overlays = new Map(workspace.documents.filter(document => document.overlay)
      .map(document => [resolvedPathIdentity(document.path), document]))
    const present = changedPaths ? undefined : new Set(membership.paths)
    for (const file of present ? this.facts.keys() : []) if (!present!.has(file)) {
      this.rolesDirty = true; this.rolePool.release(this.facts.get(file)!.roleKey); this.facts.delete(file); this.fullScopes.clear(); changed = true
    }
    for (const file of changedPaths ?? membership.paths) {
      const token = this.access.tokenFor(workspace.canonicalRootId, membership.revision, file)
      const alias = workspace.overlayPaths?.get(file)
      const overlay = this.access.overlayFor(alias ?? file) ?? overlays.get(resolvedPathIdentity(file))
        ?? (alias ? overlays.get(resolvedPathIdentity(alias)) : undefined)
      if (!overlay && token === undefined) throw new SemanticInputUnavailableError()
      const key = overlay ? "overlay:" + overlay.documentVersion + ":" + createHash("sha256").update(overlay.content).digest("hex") : "disk:" + token
      const previous = this.facts.get(file)
      if (previous?.key === key) continue
      const snapshot = overlay ? undefined : this.access.readSnapshot(workspace.canonicalRootId, membership.revision, file, token!)
      const text = overlay?.content ?? snapshot?.content
      if (text === undefined) throw new SemanticInputUnavailableError()
      const acquired = this.rolePool.acquire(file, text), parsedRole = acquired.role
      // Content revision still advances below. Only immutable dependency topology
      // survives a body-only edit; compiler input/overlay freshness does not.
      const sameRole = previous && previous.role.dependencies === parsedRole.dependencies
        && previous.role.ambient === parsedRole.ambient && previous.role.opaque === parsedRole.opaque
        && previous.role.dependencyFree === parsedRole.dependencyFree
      const role = sameRole ? previous.role : parsedRole
      const origin = role.modules.length || role.references.length
        ? SourceReadOrigin.fromSnapshot(file, this.root, workspace.canonicalRootId, snapshot) : undefined
      if (!sameRole) { this.rolesDirty = true; this.fullScopes.clear() }
      this.facts.set(file, { key, roleKey: acquired.key, role, origin })
      if (previous) this.rolePool.release(previous.roleKey)
      changed = true
    }
    if (changed) this.revision++
    if (this.rolesDirty) {
      // The old snapshot is never mutated. Dirtiness survives a cancelled partial
      // ensure so the next successful pass cannot reuse an incomplete catalog.
      this.roles = new Map([...this.facts].map(([file, fact]) => [file, fact.role]))
      this.rolesDirty = false
    }
  }

  private sameMembership(workspace: SemanticWorkspaceView, expected: ProjectMembershipSnapshot): boolean {
    const refreshed = this.access.refreshProjectMembership(this.root)
    const actual = this.access.membershipFor(this.root), captured = workspace[WORKSPACE_CATALOG_STAMP]
    const origin = workspace[WORKSPACE_MEMBERSHIP_ORIGIN], catalog = origin?.catalog ?? expected
    if (origin && origin.view !== expected) return false
    return actual.status === "complete" && expected.status === "complete" && catalog.status === "complete"
      && actual.revision === expected.revision && actual.revision === catalog.revision
      && sameResolvedPath(refreshed.catalogStamp.canonicalRootId, workspace.canonicalRootId)
      && (!captured || captured.revision === null || captured.revision === actual.revision)
      && actual.paths.length === catalog.paths.length && actual.paths.every((file, index) => file === catalog.paths[index])
  }

  private overlaysCurrent(workspace: SemanticWorkspaceView, membership: ProjectMembershipSnapshot,
    overlayState?: { current(): boolean }): boolean {
    // Only a receipt covering the successful facts pass may skip these live
    // text lookups. Membership/configuration/load/final disk proofs stay separate.
    if (overlayState?.current()) return true
    for (const file of membership.paths) {
      const overlay = this.access.overlayFor(workspace.overlayPaths?.get(file) ?? file)
      const key = overlay ? "overlay:" + overlay.documentVersion + ":" + createHash("sha256").update(overlay.content).digest("hex") : undefined
      const before = this.facts.get(file)?.key
      if (key ? before !== key : before?.startsWith("overlay:")) return false
    }
    return true
  }

  private checkpoint(workspace: SemanticWorkspaceView, membership: ProjectMembershipSnapshot): void {
    const first = membership.paths[0]
    // The native admission port already owns the active shared cancellation cell.
    if (first && !this.access.overlayFor(workspace.overlayPaths?.get(first) ?? first) && this.access.tokenFor(workspace.canonicalRootId, membership.revision, first) === undefined) {
      throw new SemanticInputUnavailableError()
    }
  }
}

/** Retained resolver callbacks capture metadata/authority, not the query's
 * workspace view or the enclosing ensure frame and its document text. */
function scopeLookupInputs(access: CatalogAccess, paths: ReadonlyMap<string, string> | undefined,
  facts: ReadonlyMap<string, SourceFact>) {
  return { overlay: (file: string) => access.overlayFor(paths?.get(file) ?? file) !== undefined,
    origin: (file: string) => facts.get(file)?.origin }
}
