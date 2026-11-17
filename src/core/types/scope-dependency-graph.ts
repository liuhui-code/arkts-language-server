import path from "node:path"
import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { memoizeRequestInputComposition, withPreparationInputValidation } from "../../project/request-input-validation.js"
import { resolvedPathIdentity } from "../../project/path-identity.js"
import { createHash } from "node:crypto"
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
  private readonly bindings: ScopeModuleBindings
  private globals: ReadonlySet<string> = new Set()
  private natives: ReadonlySet<string> = new Set()
  private revision = 0
  private receipt = ""
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
    overlay: (file: string) => boolean): void {
    withPreparationInputValidation(() => {
      const aliases = JSON.stringify([...(workspace.overlayPaths ?? [])].filter(([file, alias]) => file !== alias))
      if (!this.rebuilding && aliases === this.aliases && roles.size === this.roles?.size
        && [...roles].every(([file, role]) => this.roles?.get(file) === role) && this.currentNodes()) return
      this.rebuilding = true
      const scripts = new Map([...roles.keys()].map(file => [file, { overlay: overlay(file) }]))
      this.bindings.begin(workspace, scripts)
      const authoritative = new Map([...roles].map(([file, role]) => [resolvedPathIdentity(file), { file, role }]))
      const visited = new Set<string>(), queue = [...roles.keys(), ...this.sdkRoots, ...this.env.baselineGlobals.keys()]
      for (let index = 0; index < queue.length; index++) {
        this.checkpoint()
        const key = resolvedPathIdentity(queue[index]), source = authoritative.get(key)
        const file = source?.file ?? queue[index]
        if (visited.has(key)) continue
        visited.add(key)
        let node: Node
        const role = source?.role
        if (role) node = { role, opaque: false, edges: [], bindings: [], native: false }
        else {
          const previous = this.nodes.get(key)
          if (previous?.sourceCurrent?.()) node = { ...previous, edges: [], bindings: [], native: false }
          else { node = this.external(file); this.revision++ }
        }
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
          queue.push(...node.edges)
        }
        this.nodes.set(key, node)
      }
      for (const file of this.nodes.keys()) if (!visited.has(file)) this.nodes.delete(file)
      this.bindings.finish()
      this.effects()
      const digest = createHash("sha256")
      for (const [file, node] of this.nodes) digest.update(JSON.stringify([file, node.role?.dependencies,
        node.role?.ambient, node.role?.globals, node.opaque, node.native, node.edges]))
      const receipt = digest.digest("hex")
      if (receipt !== this.receipt) { this.receipt = receipt; this.revision++ }
      this.roles = roles; this.aliases = aliases
      this.rebuilding = false
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
    return allowed.every(file => selected.has(file) || !this.natives.has(resolvedPathIdentity(file)))
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
    const revision = this.revision, bindings = this.bindings.revision, independent = this.independent
    return () => withPreparationInputValidation(() => !this.rebuilding && revision === this.revision && bindings === this.bindings.revision
      && (!independent || this.env.baselineInputs?.current(this.checkpoint) === true)
      && this.currentNodes(), () => { throw new SemanticInputUnavailableError() })
  }

  private currentNodes(): boolean {
    this.checkpoint()
    return memoizeRequestInputComposition(this, this.revision, this.bindings.revision,
      () => this.bindings.current() && [...this.nodes.values()].every(node => {
      this.checkpoint()
      // Opaque inputs authorize no exclusion; their full importer chain is retained.
      return (node.opaque || !node.sourceCurrent || node.sourceCurrent())
        && node.bindings.every(binding => binding.opaque || binding.current())
    }))
  }

  private external(file: string): Node {
    const witness = new LoadedConfigurationWitness()
    const text = witness.observeSourceNamespace(file, () => safeRead(file))
    const current = () => witness.freshness(this.checkpoint, "capture")?.() === true
    if (text === null || !current()) return { opaque: true, sourceCurrent: current, edges: [], bindings: [], native: false }
    const syntax = retainedSdkSyntax(officialDocumentRegistryFor(this.env.sdk), file, text, this.env.options)
    const role = syntax ? projectSourceRoleFromFile(syntax, this.env.options) : projectSourceRole(file, text, this.env.options)
    return { role, sourceHash: createHash("sha256").update(text).digest("hex"), sourceCurrent: current, opaque: false, edges: [], bindings: [], native: false }
  }

  private effects(independent: ReadonlySet<string> = new Set()): void {
    const reverse = new Map<string, string[]>()
    const globals: string[] = [], natives: string[] = []
    for (const [file, node] of this.nodes) {
      for (const target of node.edges) {
        const key = resolvedPathIdentity(target), incoming = reverse.get(key) ?? []; incoming.push(file); reverse.set(key, incoming)
      }
      if (node.opaque || (node.role?.ambient || node.role?.opaque) && !independent.has(file)) globals.push(file)
      if (node.opaque || node.native || node.role?.opaque) natives.push(file)
    }
    const propagate = (seeds: string[]) => {
      const result = new Set<string>()
      for (let index = 0; index < seeds.length; index++) {
        this.checkpoint()
        const file = seeds[index]
        if (result.has(file)) continue
        result.add(file); seeds.push(...(reverse.get(file) ?? []))
      }
      return result
    }
    this.globals = propagate(globals); this.natives = propagate(natives)
  }
}
