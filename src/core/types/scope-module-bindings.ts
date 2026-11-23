import type { SourceReadOrigin } from "../../project/source-read-origin.js"
import path from "node:path"
import type ts from "typescript"
import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { memoizeRequestInputComposition } from "../../project/request-input-validation.js"
import { resolveHarmonySdkModule } from "../sdk/module-resolver.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"
import { QueryModuleResolution } from "./typescript-query-module-resolution.js"
import { resolveTypeScriptModule } from "./typescript-module-resolution.js"
import { ScopeSourceBoundaries } from "./scope-source-boundaries.js"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import type { ScopeDependencyEnvironment } from "./scope-dependency-environment.js"

export interface ScopeBinding {
  readonly file?: string
  readonly native: boolean
  readonly opaque: boolean
  current(): boolean
}
interface CachedBinding extends ScopeBinding { readonly sdkNames: readonly string[] }
interface SdkBinding { readonly file?: string; current(): boolean }

/** Each shared lookup owns its original witnesses; unused owners are pruned. */
export class ScopeModuleBindings {
  private readonly entries = new Map<string, CachedBinding>()
  private readonly owners = new WeakMap<ScopeBinding, { readonly key: string; readonly sdkNames: readonly string[] }>()
  private readonly sdkEntries = new Map<string, SdkBinding>()
  private readonly references = new Map<ScopeBinding, number>()
  private readonly pending = new Set<ScopeBinding>()
  private readonly sdkReferences = new Map<string, number>()
  private readonly pendingSdk = new Set<string>()
  private scripts = new Map<string, { overlay: boolean }>()
  private aliases = ""
  private paths: readonly string[] = []
  revision = 0
  private lookupRevision = 0
  private overlayPaths: ReadonlyMap<string, string> | undefined
  private overlay: ((file: string) => boolean) | undefined
  private sourceOrigin: ((file: string) => SourceReadOrigin | undefined) | undefined
  private readonly boundaries: ScopeSourceBoundaries
  constructor(private readonly env: ScopeDependencyEnvironment, private readonly checkpoint: () => void) {
    this.boundaries = new ScopeSourceBoundaries(env.boundary, checkpoint)
  }

  /** Publish metadata authority before the graph's current-node fast path. The
   * production callback owns only the alias map and existing Store, never text. */
  observeOverlayInputs(paths: ReadonlyMap<string, string> | undefined, overlay: (file: string) => boolean): void {
    this.lookupRevision++
    this.overlayPaths = paths; this.overlay = overlay
  }

  private hasOverlay(file: string): boolean {
    const script = this.scripts.get(file)
    return script !== undefined && (this.overlay?.(file) ?? script.overlay)
  }

  begin(workspace: SemanticWorkspaceView, scripts: Map<string, { overlay: boolean }>,
    origin?: (file: string) => SourceReadOrigin | undefined): void {
    this.sourceOrigin = origin
    const paths = [...scripts.keys()]
    const aliases = JSON.stringify([...(workspace.overlayPaths ?? [])].filter(([file, alias]) => file !== alias))
    if (paths.length !== this.paths.length || paths.some((file, index) => file !== this.paths[index])) { this.entries.clear(); this.revision++ }
    else if (aliases !== this.aliases) this.revision++
    this.lookupRevision++
    this.paths = paths; this.aliases = aliases; this.overlayPaths = workspace.overlayPaths; this.scripts = scripts
  }

  retainSource(file: string, relative: boolean): boolean {
    this.checkpoint()
    return !relative || this.boundaries.retain(file, this.scripts.has(file))
  }

  /** Retain a still-current exact cache owner, not a structurally similar result.
   * finish must keep its SDK and source owners alive even without another resolve. */
  retain(binding: ScopeBinding): boolean {
    this.checkpoint()
    const owner = this.owners.get(binding)
    if (!owner || this.entries.get(owner.key) !== binding || !binding.current()) return false
    return true
  }

  resolve(name: string, containingFile: string): ScopeBinding {
    this.checkpoint()
    const boundaryRevision = this.boundaries.revision
    const boundary = name.startsWith(".") ? this.boundaries.get(containingFile,
      this.scripts.has(containingFile), this.sourceOrigin?.(containingFile)).value : undefined
    if (boundaryRevision !== this.boundaries.revision) this.revision++
    const key = JSON.stringify([path.dirname(containingFile), name, boundary])
    const previous = this.entries.get(key)
    if (previous?.current()) return previous
    const witness = new LoadedConfigurationWitness()
    const modules = new QueryModuleResolution(this.env.rootPath, this.env.options)
    const dependencies = new Map<string, SdkBinding>()
    const overlays = new Map<string, boolean>(), aliases = new Map<string, string | undefined>()
    const resolve = () => resolveTypeScriptModule({ rootPath: this.env.rootPath,
      sdkRoot: this.env.sdk.path, sdk: this.env.sdk, packageResolver: this.env.resolver,
      scripts: this.scripts, overlayPaths: this.overlayPaths,
      overlayLookup: {
        has: file => retainLookup(overlays, file, this.hasOverlay(file)),
        path: file => retainLookup(aliases, file, this.overlayPaths?.get(file)),
      },
      configurationWitness: witness, moduleResolution: modules, checkpoint: this.checkpoint,
      relativeResolutionCheckpoint: this.checkpoint, relativeResolutionFailures: new Map(),
      sdkLookup: specifier => { const sdk = this.sdk(specifier); dependencies.set(specifier, sdk); return sdk.file },
    }, name, containingFile, boundary)
    const resolveTarget = () => {
      const first = resolve()
      if (!first) return first
      return witness.observeResolutionPath(first.resolvedFileName, () => {
        const confirmed = resolve()
        if (confirmed?.resolvedFileName !== first.resolvedFileName) throw new SemanticInputUnavailableError()
        return confirmed
      }, this.checkpoint)
    }
    const origin = this.sourceOrigin?.(containingFile)
    const qualified = origin?.file === containingFile && origin.root === this.env.boundary.workspacePhysicalRoot
    // Import names came from these guarded bytes. Keep that original source
    // identity, not a later containing-file identity captured around resolution.
    // The first current() below and the independent final union validate it.
    if (qualified) witness.retainSourceRead(origin)
    const value = modules.query(() => qualified ? resolveTarget()
      : witness.observeResolutionPath(containingFile, resolveTarget, this.checkpoint))
    // This witness has finished loading and is never reset or extended in place.
    // Retain its validator, not its boolean result: each call still observes the
    // live owner/facts and registers the original epoch in the final input union.
    const freshness = witness.freshness(this.checkpoint, "capture")
    // This entry's witness/dependency/lookup sets are closed after resolution.
    // Only replacement of the dynamic overlay/script authority can change their
    // composition. Unrelated cache insertions still version the graph, not this
    // immutable child set. Every final observation deliberately remains raw.
    const current = () => memoizeRequestInputComposition(witness, 0, this.lookupRevision, () => {
      for (const [file, expected] of overlays) {
        this.checkpoint(); if (this.hasOverlay(file) !== expected) return false
      }
      for (const [file, expected] of aliases) {
        this.checkpoint(); if (this.overlayPaths?.get(file) !== expected) return false
      }
      if (freshness?.() !== true) return false
      for (const dependency of dependencies.values()) if (!dependency.current()) return false
      return true
    })
    const entry: CachedBinding = { sdkNames: [...dependencies.keys()], file: value?.resolvedFileName,
      native: (value as ts.ResolvedModuleFull | undefined)?.packageId !== undefined,
      opaque: !current(), current }
    this.owners.set(entry, { key, sdkNames: entry.sdkNames })
    this.pending.add(entry)
    this.revision++; this.entries.set(key, entry)
    return entry
  }

  private sdk(name: string): SdkBinding {
    const previous = this.sdkEntries.get(name)
    if (previous?.current()) return previous
    const witness = new LoadedConfigurationWitness()
    const file = resolveHarmonySdkModule(this.env.sdk, name, witness) ?? undefined
    const freshness = witness.freshness(this.checkpoint, "capture")
    const entry = { file, current: () => freshness?.() === true }
    this.pendingSdk.add(name)
    this.revision++; this.sdkEntries.set(name, entry)
    return entry
  }

  /** Node commits own cache retention; validation alone never acquires a lease. */
  changeReferences(before: readonly ScopeBinding[], after: readonly ScopeBinding[],
    previousSource?: string, nextSource?: string): void {
    const old = new Set(before), next = new Set(after)
    for (const entry of old) if (!this.references.has(entry)) throw new Error("Unpaired scope binding release")
    for (const entry of next) if (!this.owners.has(entry)) throw new Error("Unknown scope binding owner")
    const boundaryRevision = this.boundaries.revision
    this.boundaries.changeReferences(previousSource, nextSource)
    if (boundaryRevision !== this.boundaries.revision) this.revision++
    for (const entry of next) if (!old.has(entry)) {
      const count = this.references.get(entry) ?? 0
      this.references.set(entry, count + 1)
      if (!count) for (const name of this.owners.get(entry)!.sdkNames) {
        this.sdkReferences.set(name, (this.sdkReferences.get(name) ?? 0) + 1)
      }
    }
    for (const entry of old) if (!next.has(entry)) {
      const count = this.references.get(entry)! - 1
      if (count) this.references.set(entry, count)
      else {
        this.references.delete(entry)
        const owner = this.owners.get(entry)!
        if (this.entries.get(owner.key) === entry) { this.entries.delete(owner.key); this.revision++ }
        for (const name of owner.sdkNames) {
          const remaining = this.sdkReferences.get(name)! - 1
          if (remaining) this.sdkReferences.set(name, remaining)
          else { this.sdkReferences.delete(name); this.pendingSdk.add(name) }
        }
      }
    }
  }

  /** Prune only uncommitted drafts and SDK names touched by actual releases. */
  finish(): void {
    const boundaryRevision = this.boundaries.revision
    this.boundaries.finish()
    if (boundaryRevision !== this.boundaries.revision) this.revision++
    for (const entry of this.pending) if (!this.references.has(entry)) {
      const owner = this.owners.get(entry)!
      if (this.entries.get(owner.key) === entry) { this.entries.delete(owner.key); this.revision++ }
    }
    this.pending.clear()
    for (const name of this.pendingSdk) if (!this.sdkReferences.has(name) && this.sdkEntries.delete(name)) this.revision++
    this.pendingSdk.clear()
  }

  observeSourceOrigins(origin?: (file: string) => SourceReadOrigin | undefined): void { this.sourceOrigin = origin }
  collectStaleSources(failed: Set<string>): boolean { return this.boundaries.collectStaleSources(failed) }

  current(): boolean { return this.boundaries.current() }
}

/** A repeated lookup cannot overwrite the first input inside a resolution. */
function retainLookup<Value>(inputs: Map<string, Value>, file: string, value: Value): Value {
  if (inputs.has(file) && inputs.get(file) !== value) throw new SemanticInputUnavailableError()
  inputs.set(file, value)
  return value
}
