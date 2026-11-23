import { scopePathMetadata } from "./scope-path-metadata.js"
import type { SourceReadOrigin } from "../../project/source-read-origin.js"
import path from "node:path"
import { createHash } from "node:crypto"
import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { isScopeRoleDelta, type ScopeRoleDelta } from "./scope-role-delta.js"
import { memoizeRequestInputComposition, withPreparationInputValidation } from "../../project/request-input-validation.js"
import { resolvedPathIdentity } from "../../project/path-identity.js"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import { projectSourceRole, projectSourceRoleFromFile, type ProjectSourceRole } from "./project-source-role.js"
import { safeRead } from "./typescript-safe-source-read.js"
import { ScopeModuleBindings, type ScopeBinding } from "./scope-module-bindings.js"
import type { ScopeDependencyEnvironment } from "./scope-dependency-environment.js"
import { retainedSdkSyntax } from "../../semantic/backends/ohos-typescript/sdk-registry-cache.js"
import { officialDocumentRegistryFor } from "../../semantic/backends/ohos-typescript/registry-pool.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"
import { independentMandatoryGlobals } from "./scope-independent-globals.js"
import { completionMatchQuality } from "./typescript-completion-ranking.js"

interface Node {
  readonly file: string
  readonly role?: ProjectSourceRole
  readonly sourceCurrent?: () => boolean
  readonly sourceHash?: string
  readonly opaque: boolean
  readonly edges: string[]
  readonly bindings: ScopeBinding[]
  native: boolean
}

interface InfluenceSelection {
  readonly revision: number
  readonly paths: readonly string[]
  readonly roots: readonly string[]
  readonly globals: ReadonlySet<string>
  readonly natives: ReadonlySet<string>
  readonly independent: boolean
}

/** Incremental syntax nodes and load-owned lookup owners; no Program or AST cache. */
export class ScopeDependencyGraph {
  private readonly nodes = new Map<string, Node>()
  private readonly reverseEdges = new Map<string, Set<string>>()
  private readonly globalSeeds = new Set<string>()
  private readonly nativeSeeds = new Set<string>()
  private readonly bindings: ScopeModuleBindings
  private globals: ReadonlySet<string> = new Set()
  private natives: ReadonlySet<string> = new Set()
  private revision = 0
  private inputRevision = 0
  private topologyDirty = false
  private independent = false
  private roles: ReadonlyMap<string, ProjectSourceRole> | undefined
  private aliases = ""
  private rebuilding = false
  private readonly selections = new WeakMap<readonly string[], InfluenceSelection>()
  private readonly sdkRoots: readonly string[]
  constructor(private readonly env: ScopeDependencyEnvironment, private readonly checkpoint: () => void) {
    this.bindings = new ScopeModuleBindings(env, checkpoint)
    this.sdkRoots = env.sdkRoots.map(file => path.resolve(file))
  }

  update(workspace: SemanticWorkspaceView, roles: ReadonlyMap<string, ProjectSourceRole>,
    overlay: (file: string) => boolean, origin?: (file: string) => SourceReadOrigin | undefined, delta?: ScopeRoleDelta): void {
    withPreparationInputValidation(() => {
      try {
        this.bindings.observeOverlayInputs(workspace.overlayPaths, overlay)
        this.bindings.observeSourceOrigins(origin)
        const aliases = JSON.stringify([...(workspace.overlayPaths ?? [])].filter(([file, alias]) => file !== alias))
        const knownDelta = isScopeRoleDelta(delta, this.roles, roles) ? delta : undefined
        if (!this.rebuilding && !this.topologyDirty && aliases === this.aliases && (roles === this.roles || knownDelta)) {
          const stale = new Set<string>()
          for (const file of knownDelta?.files ?? []) if (knownDelta!.before.get(file) !== roles.get(file)) stale.add(resolvedPathIdentity(file))
          const valid = this.currentNodes(stale)
          if (valid && !stale.size) { this.roles = roles; return }
          if ((knownDelta || roles === this.roles) && stale.size && this.repairRoleDelta(stale, roles)) { this.roles = roles; return }
        }
        if (!this.rebuilding && roles !== this.roles && aliases === this.aliases && roles.size === this.roles?.size
          && [...roles].every(([file, role]) => this.roles?.get(file) === role) && this.currentNodes()) return
        this.rebuilding = true
        const scripts = new Map([...roles.keys()].map(file => [file, { overlay: overlay(file) }]))
        this.bindings.begin(workspace, scripts, origin)
        const authoritative = new Map([...roles].map(([file, role]) => [resolvedPathIdentity(file), { file, role }]))
        const visited = new Set<string>(), queue = [...roles.keys(), ...this.sdkRoots, ...this.env.baselineGlobals.keys()]
        for (let index = 0; index < queue.length; index++) {
          this.checkpoint()
          const key = resolvedPathIdentity(queue[index]), source = authoritative.get(key)
          const file = source?.file ?? queue[index]
          if (visited.has(key)) continue
          visited.add(key)
          let node: Node
          const role = source?.role, previous = this.nodes.get(key)
          const retainedRole = role ?? previous?.role
          const sameInput = role ? previous?.role === role : previous?.sourceCurrent?.() === true
          const relative = !!retainedRole && (retainedRole.references.length > 0
            || retainedRole.modules.some(name => name.startsWith(".")))
          if (previous && sameInput && this.bindings.retainSource(file, relative)
            && previous.bindings.every(binding => this.bindings.retain(binding))) {
            // Only topology is reused. Every original boundary/source/binding proof
            // was checked above and remains in the independent final input union.
            queue.push(...previous.edges)
            continue
          }
          if (role) node = { file, role, opaque: false, edges: [], bindings: [], native: false }
          else {
            if (previous?.sourceCurrent?.()) node = { ...previous, file, edges: [], bindings: [], native: false }
            else node = this.external(file)
          }
          node = this.resolveNode(node)
          queue.push(...node.edges)
          // Preserve dirty state BEFORE mutating: a checkpoint can cancel before
          // effects/publication and the next pass may reuse this already-new node.
          if (!sameTopology(previous, node)) this.topologyDirty = true
          this.inputRevision++
          this.replaceNode(key, node)
        }
        for (const file of this.nodes.keys()) if (!visited.has(file)) {
          this.topologyDirty = true; this.inputRevision++; this.replaceNode(file, undefined)
        }
        if (this.topologyDirty) {
          this.effects()
          this.revision++
          this.topologyDirty = false
        }
        this.roles = roles; this.aliases = aliases
        this.rebuilding = false
      } finally { this.bindings.finish() }
    }, () => { throw new SemanticInputUnavailableError() })
  }

  roots(allowed: readonly string[]): readonly string[] {
    this.checkpoint()
    const cached = this.selections.get(allowed)
    // Derived topology only: all source/binding/membership proofs still run in
    // ensure/proof and the final union. Mutable callers cannot reuse changed paths.
    if (!this.rebuilding && cached?.revision === this.revision
      && cached.paths.length === allowed.length && cached.paths.every((file, index) => file === allowed[index])
      && this.env.baselineInputs?.current(this.checkpoint) === true) {
      this.independent = cached.independent
      this.globals = cached.globals; this.natives = cached.natives
      return cached.roots
    }
    const independent = independentMandatoryGlobals(this.env, this.nodes, allowed, this.checkpoint)
    this.independent = independent.size > 0
    this.effects(independent)
    const roots = Object.freeze(allowed.filter(file => this.globals.has(resolvedPathIdentity(file)) || this.natives.has(resolvedPathIdentity(file))))
    if (!this.rebuilding && allowed.every(file => path.isAbsolute(file))
      && this.env.baselineInputs?.current(this.checkpoint) === true) this.selections.set(allowed, {
      revision: this.revision, paths: Object.freeze([...allowed]), roots,
      globals: this.globals, natives: this.natives, independent: this.independent,
    })
    return roots
  }
  nativeSafe(allowed: readonly string[], selected: ReadonlySet<string>): boolean {
    return scopePathMetadata(allowed).entries.every(([identity, file]) => selected.has(file) || !this.natives.has(identity))
  }
  completionRoots(allowed: readonly string[], prefix: string): readonly string[] {
    const seeds: string[] = [], reverse = new Map<string, string[]>()
    for (const [file, node] of this.nodes) {
      this.checkpoint()
      const exports = node.role?.exports
      if (!exports || exports.unknown || exports.names.some(name => completionMatchQuality(name, prefix) !== undefined)) seeds.push(file)
      for (let index = 0; index < (node.role?.modules.length ?? 0); index++) {
        if (!exports?.stars.includes(node.role!.modules[index])) continue
        const target = node.bindings[index]?.file
        if (!target) { seeds.push(file); continue }
        const key = resolvedPathIdentity(target), incoming = reverse.get(key) ?? []
        incoming.push(file); reverse.set(key, incoming)
      }
    }
    const selected = new Set<string>()
    for (let index = 0; index < seeds.length; index++) {
      this.checkpoint()
      const file = seeds[index]
      if (selected.has(file)) continue
      selected.add(file); seeds.push(...(reverse.get(file) ?? []))
    }
    return allowed.filter(file => selected.has(resolvedPathIdentity(file)))
  }
  proof(): () => boolean {
    const revision = this.revision, inputRevision = this.inputRevision, bindings = this.bindings.revision, independent = this.independent
    return () => withPreparationInputValidation(() => !this.rebuilding && revision === this.revision && inputRevision === this.inputRevision && bindings === this.bindings.revision
      && (!independent || this.env.baselineInputs?.current(this.checkpoint) === true)
      && this.currentNodes(), () => { throw new SemanticInputUnavailableError() })
  }

  /** The mandatory proof walk also discovers stale node consumers. It never
   * treats a watch event or an unchanged topology version as freshness. */
  private currentNodes(failed?: Set<string>): boolean {
    this.checkpoint()
    return memoizeRequestInputComposition(this, this.inputRevision, this.bindings.revision, () => {
      let valid = true
      if (failed) {
        const sources = new Set<string>()
        valid = this.bindings.collectStaleSources(sources)
        for (const file of sources) failed.add(resolvedPathIdentity(file))
      } else if (!this.bindings.current()) return false
      for (const node of this.nodes.values()) {
        this.checkpoint()
        // Opaque inputs authorize no exclusion; their full importer chain stays.
        const current = (node.opaque || !node.sourceCurrent || node.sourceCurrent())
          && node.bindings.every(binding => binding.opaque || binding.current())
        if (!current) {
          if (!failed) return false
          valid = false; failed.add(resolvedPathIdentity(node.file))
        }
      }
      return valid
    })
  }

  /** Refresh only declared project changes and stale proof consumers. External
   * reachability and unknown lineage keep the original complete reconciliation. */
  private repairRoleDelta(files: ReadonlySet<string>, roles: ReadonlyMap<string, ProjectSourceRole>): boolean {
    for (const file of files) {
      const previous = this.nodes.get(file)
      if (!previous?.role || previous.sourceCurrent || !roles.has(previous.file)) return false
    }
    this.rebuilding = true
    for (const file of files) {
      this.checkpoint()
      const previous = this.nodes.get(file)!
      const node = this.resolveNode({ file: previous.file, role: roles.get(previous.file),
        opaque: false, edges: [], bindings: [], native: false })
      // All project files are graph roots. Project-only edge changes preserve
      // reachability; changed external/SDK reachability keeps full reconciliation.
      if (!this.sameExternalTargets(previous, node)) return false
      if (!sameTopology(previous, node)) this.topologyDirty = true
      this.inputRevision++
      this.replaceNode(file, node)
    }
    if (!this.currentNodes()) return false
    if (this.topologyDirty) {
      this.effects(); this.revision++; this.topologyDirty = false
    }
    this.rebuilding = false
    return true
  }

  private sameExternalTargets(before: Node, after: Node): boolean {
    const external = (node: Node) => {
      const result = new Set<string>()
      for (const edge of node.edges) {
        this.checkpoint()
        const key = resolvedPathIdentity(edge), target = this.nodes.get(key)
        if (!target) return undefined
        if (target.sourceCurrent) result.add(key)
      }
      return result
    }
    const old = external(before), next = external(after)
    return !!old && !!next && old.size === next.size && [...old].every(file => next.has(file))
  }

  private resolveNode(node: Node): Node {
    const file = node.file
    if (node.role) {
      for (const name of node.role.modules) {
        const binding = this.bindings.resolve(name, file)
        node.bindings.push(binding)
        node.native ||= binding.native || binding.opaque
        if (binding.file) node.edges.push(path.resolve(binding.file))
      }
      for (const name of node.role.references) {
        const binding = this.bindings.resolve(name.startsWith(".") ? name : "./" + name, file)
        node.bindings.push(binding)
        node.native ||= binding.native || binding.opaque
        if (binding.file) node.edges.push(path.resolve(binding.file))
        else node.native = true
      }
    }
    return node
  }

  private external(file: string): Node {
    const witness = new LoadedConfigurationWitness()
    const text = witness.observeSourceNamespace(file, () => safeRead(file))
    const freshness = witness.freshness(this.checkpoint, "capture")
    const current = () => freshness?.() === true
    if (text === null || !current()) return { file, opaque: true, sourceCurrent: current, edges: [], bindings: [], native: false }
    const syntax = retainedSdkSyntax(officialDocumentRegistryFor(this.env.sdk), file, text, this.env.options)
    const role = syntax ? projectSourceRoleFromFile(syntax, this.env.options) : projectSourceRole(file, text, this.env.options)
    return { file, role, sourceHash: createHash("sha256").update(text).digest("hex"), sourceCurrent: current, opaque: false, edges: [], bindings: [], native: false }
  }

  private replaceNode(file: string, node: Node | undefined): void {
    const targets = (value: Node | undefined) => new Set((value?.edges ?? []).map(target => {
      this.checkpoint(); return resolvedPathIdentity(target)
    }))
    // Finish cancellable normalization before changing the index. Commit all
    // adjacency/seeds with the node; a cancelled publication can safely retry.
    const previous = this.nodes.get(file)
    const before = targets(previous), after = targets(node)
    const relativeSource = (value: Node | undefined) => value?.role && (value.role.references.length
      || value.role.modules.some(name => name.startsWith("."))) ? value.file : undefined
    this.bindings.changeReferences(previous?.bindings ?? [], node?.bindings ?? [], relativeSource(previous), relativeSource(node))
    for (const target of before) if (!after.has(target)) {
      const incoming = this.reverseEdges.get(target)
      incoming?.delete(file)
      if (incoming?.size === 0) this.reverseEdges.delete(target)
    }
    for (const target of after) if (!before.has(target)) {
      const incoming = this.reverseEdges.get(target) ?? new Set<string>()
      incoming.add(file); this.reverseEdges.set(target, incoming)
    }
    if (node?.opaque || node?.role?.ambient || node?.role?.opaque) this.globalSeeds.add(file)
    else this.globalSeeds.delete(file)
    if (node?.opaque || node?.native || node?.role?.opaque) this.nativeSeeds.add(file)
    else this.nativeSeeds.delete(file)
    if (node) this.nodes.set(file, node)
    else this.nodes.delete(file)
  }

  private effects(independent: ReadonlySet<string> = new Set()): void {
    const globals: string[] = [], natives = [...this.nativeSeeds]
    for (const file of this.globalSeeds) {
      this.checkpoint()
      if (this.nodes.get(file)?.opaque || !independent.has(file)) globals.push(file)
    }
    const propagate = (seeds: string[]) => {
      const result = new Set<string>()
      for (let index = 0; index < seeds.length; index++) {
        this.checkpoint()
        const file = seeds[index]
        if (result.has(file)) continue
        result.add(file); seeds.push(...(this.reverseEdges.get(file) ?? []))
      }
      return result
    }
    this.globals = propagate(globals); this.natives = propagate(natives)
  }
}

/** The role dependency hash includes global/export summaries and reference kinds,
 * not just imports. This compares derived topology, never semantic type equality. */
function sameTopology(before: Node | undefined, after: Node): boolean {
  return before !== undefined && before.role?.dependencies === after.role?.dependencies
    && before.role?.ambient === after.role?.ambient && before.role?.opaque === after.role?.opaque
    && before.role?.dependencyFree === after.role?.dependencyFree
    && before.opaque === after.opaque && before.native === after.native
    && before.edges.length === after.edges.length && before.edges.every((edge, index) => edge === after.edges[index])
}
