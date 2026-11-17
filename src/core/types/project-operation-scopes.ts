import { ScopeDependencyGraph } from "./scope-dependency-graph.js"
import type { ScopeDependencyEnvironment } from "./scope-dependency-environment.js"
import { createHash } from "node:crypto"
import type ts from "typescript"
import type { ProjectFileAccessPort, ProjectMembershipSnapshot, SemanticWorkspaceView } from "../workspace/document-store.js"
import { WORKSPACE_CATALOG_STAMP, WORKSPACE_MEMBERSHIP_ORIGIN } from "../workspace/semantic-workspace-view.js"
import type { RetainedConfigurationProof } from "../../project/loaded-configuration-witness.js"
import { resolvedPathIdentity, sameResolvedPath } from "../../project/path-identity.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"
import { projectSourceRole, type ProjectSourceRole } from "./project-source-role.js"
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
interface SourceFact { readonly key: string; readonly role: ProjectSourceRole }

/** Complete syntax-role metadata, never a second AST/text cache or a READY proof.
 * Unknown adapters keep their original full compiler scope. */
export class ProjectOperationScopes {
  private readonly facts = new Map<string, SourceFact>()
  private revision = 0
  private readonly fullScopes = new Set<string>()
  private readonly options: string
  private readonly profileKey: string
  private readonly dependencies?: ScopeDependencyGraph
  private resolutionGeneration: number
  private constructor(private readonly root: string, private readonly profile: ProjectSyntaxProfile,
    private readonly access: CatalogAccess, private readonly generation: () => number) {
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
    const allowedSet = new Map(allowed.map(file => [resolvedPathIdentity(file), file]))
    const selected = new Set(this.dependencies?.roots(allowed) ?? allowed.filter(file => this.facts.get(file)?.role.ambient))
    const projected = !this.fullScopes.has(groupId)
    if (!projected) for (const file of allowed) selected.add(file)
    for (const file of roots) {
      const admitted = allowedSet.get(resolvedPathIdentity(file))
      if (admitted) selected.add(admitted)
    }
    const revision = this.revision, generation = this.resolutionGeneration
    const graphCurrent = this.dependencies?.proof()
    const dependencyFreeOmissions = this.dependencies?.nativeSafe(allowed, selected)
      ?? allowed.every(file => selected.has(file) || this.facts.get(file)?.role.dependencyFree === true)
    const proof: OperationScopeProof = { options: this.options, projected, fallbackRoots: allowed,
      nativePackageBaseline: dependencyFreeOmissions ? this.profile.nativePackages : undefined,
      fallback: () => { this.fullScopes.add(groupId) }, current: () => {
        if (this.revision !== revision || this.generation() !== generation || !this.sameMembership(workspace, membership)) return false
        return (!graphCurrent || graphCurrent()) && this.overlaysCurrent(workspace, membership) && this.profile.configuration!.current(() => this.checkpoint(workspace, membership))
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
    const membership = workspace.projectMembership ?? this.access.membershipFor(this.root)
    if (!this.sameMembership(workspace, membership)) throw new SemanticInputUnavailableError()
    if (!this.profile.configuration!.current(() => this.checkpoint(workspace, membership))) throw new SemanticInputUnavailableError()
    const generation = this.generation()
    if (generation !== this.resolutionGeneration) {
      this.fullScopes.clear(); this.resolutionGeneration = generation; this.revision++
    }
    let changed = false
    const overlays = new Map(workspace.documents.filter(document => document.overlay)
      .map(document => [resolvedPathIdentity(document.path), document]))
    const present = new Set(membership.paths)
    for (const file of this.facts.keys()) if (!present.has(file)) { this.facts.delete(file); this.fullScopes.clear(); changed = true }
    for (const file of membership.paths) {
      const token = this.access.tokenFor(workspace.canonicalRootId, membership.revision, file)
      const alias = workspace.overlayPaths?.get(file)
      const overlay = this.access.overlayFor(alias ?? file) ?? overlays.get(resolvedPathIdentity(file))
        ?? (alias ? overlays.get(resolvedPathIdentity(alias)) : undefined)
      if (!overlay && token === undefined) throw new SemanticInputUnavailableError()
      const key = overlay ? "overlay:" + overlay.documentVersion + ":" + createHash("sha256").update(overlay.content).digest("hex") : "disk:" + token
      const previous = this.facts.get(file)
      if (previous?.key === key) continue
      const text = overlay?.content ?? this.access.readSnapshot(workspace.canonicalRootId, membership.revision, file, token!)?.content
      if (text === undefined) throw new SemanticInputUnavailableError()
      const parsedRole = projectSourceRole(file, text, this.profile.options)
      // Content revision still advances below. Only immutable dependency topology
      // survives a body-only edit; compiler input/overlay freshness does not.
      const sameRole = previous && previous.role.dependencies === parsedRole.dependencies
        && previous.role.ambient === parsedRole.ambient && previous.role.opaque === parsedRole.opaque
        && previous.role.dependencyFree === parsedRole.dependencyFree
      const role = sameRole ? previous.role : parsedRole
      if (!sameRole) this.fullScopes.clear()
      this.facts.set(file, { key, role })
      changed = true
    }
    if (changed) this.revision++
    this.dependencies?.update(workspace, new Map([...this.facts].map(([file, fact]) => [file, fact.role])),
      file => this.access.overlayFor(workspace.overlayPaths?.get(file) ?? file) !== undefined)
    if (!this.sameMembership(workspace, membership)) throw new SemanticInputUnavailableError()
    return membership
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

  private overlaysCurrent(workspace: SemanticWorkspaceView, membership: ProjectMembershipSnapshot): boolean {
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
