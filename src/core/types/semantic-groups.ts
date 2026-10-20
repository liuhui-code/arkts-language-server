import path from "node:path"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { SemanticWorkspaceView, ProjectMembershipSnapshot } from "../workspace/document-store.js"
import type { HarmonySemanticGraph, HarmonySemanticUnit } from "../../project/harmony-project-model.js"
import { containsResolvedPath } from "../../project/resolved-path-containment.js"
import { initialPreparationActive, initialPreparationCheckpoint } from "../../semantic/coordinator/initial-preparation.js"

interface GroupRoots {
  readonly id: string
  readonly moduleRoot: string
  readonly paths: readonly string[]
}

export interface SemanticGroup {
  readonly id: string
  readonly moduleRoot: string
  readonly workspace: SemanticWorkspaceView
}

/** Registry configuration is immutable between configure calls, which retire every old group. */
export class SemanticGroups {
  private readonly owners = new Map<string, string>()
  private readonly scanRoots = new Set<string>()
  private roots = new WeakMap<HarmonySemanticGraph, {
    readonly canonicalRootId: string
    readonly membershipPaths: readonly string[]
    readonly groups: readonly GroupRoots[]
  }>()
  constructor(private readonly resolver: LocalPackageResolver) {}

  owner(id: string): string { return this.owners.get(id) ?? id }
  isScan(id: string): boolean { return this.scanRoots.has(id) }
  clear(): void { this.owners.clear(); this.scanRoots.clear(); this.roots = new WeakMap() }

  root(workspace: SemanticWorkspaceView): string {
    const root = path.resolve(workspace.rootPath)
    const graph = this.resolver.projectFor(root).semanticGraph()
    if (graph.status === "ready" && graph.complete) this.scanRoots.add(root)
    return root
  }

  available(workspace: Pick<SemanticWorkspaceView, "rootPath">): boolean {
    const graph = this.resolver.projectFor(workspace.rootPath).semanticGraph()
    return graph.status === "ready" && graph.complete
  }

  select(workspace: SemanticWorkspaceView, membership: ProjectMembershipSnapshot): SemanticGroup | undefined {
    const scope = this.resolver.projectFor(workspace.rootPath).scopeFor(workspace.state.path)
    return this.all({ ...workspace, projectMembership: membership }).find(group => group.moduleRoot === scope.moduleRoot)
  }

  prepareInitial(workspace: SemanticWorkspaceView, limit: number, prepare: (group: SemanticGroup) => void): void {
    if (!initialPreparationActive()) return
    for (const group of this.all(workspace).slice(0, limit)) {
      initialPreparationCheckpoint()
      prepare(group)
    }
  }

  all(workspace: SemanticWorkspaceView): SemanticGroup[] {
    const root = this.root(workspace)
    const graph = this.resolver.projectFor(root).semanticGraph()
    const membership = workspace.projectMembership
    if (!membership || membership.status !== "complete" || !graph.complete || graph.status !== "ready") return []
    const cached = this.roots.get(graph)
    const unchanged = cached?.canonicalRootId === workspace.canonicalRootId
      && cached.membershipPaths.length === membership.paths.length
      && cached.membershipPaths.every((file, index) => file === membership.paths[index])
    const groups = unchanged ? cached.groups : this.discover(workspace, graph)
    if (!unchanged) this.roots.set(graph, {
      canonicalRootId: workspace.canonicalRootId, membershipPaths: membership.paths, groups,
    })
    return groups.map(group => ({ id: group.id, moduleRoot: group.moduleRoot,
      workspace: { ...workspace, semanticRootPaths: group.paths } }))
  }

  private discover(workspace: SemanticWorkspaceView, graph: HarmonySemanticGraph): readonly GroupRoots[] {
    const root = path.resolve(workspace.rootPath)
    const membership = workspace.projectMembership!
    const key = (unit: HarmonySemanticUnit) => JSON.stringify(unit.identity)
    const units = new Map(graph.units.map(unit => [key(unit), unit]))
    return graph.units.map(unit => {
      const closure = new Set<HarmonySemanticUnit>()
      const visit = (current: HarmonySemanticUnit) => {
        if (closure.has(current)) return
        closure.add(current)
        for (const dependency of current.dependencies) {
          const target = units.get(JSON.stringify(dependency))
          if (target) visit(target)
        }
      }
      visit(unit)
      const roots = [...closure].flatMap(current => [...current.sourceRoots, ...(current.packageRoots ?? [])])
      const paths = membership.paths.filter(file => roots.some(source => containsResolvedPath(source, file))
        || /\.d\.(?:ets|ts)$/.test(file))
      const id = JSON.stringify(["module", workspace.canonicalRootId, unit.identity])
      this.owners.set(id, root)
      return { id, moduleRoot: unit.moduleRoot, paths }
    })
  }
}
