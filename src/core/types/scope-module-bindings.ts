import path from "node:path"
import type ts from "typescript"
import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
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
  private readonly sdkEntries = new Map<string, SdkBinding>()
  private used = new Set<string>()
  private usedSdk = new Set<string>()
  private scripts = new Map<string, { overlay: boolean }>()
  private aliases = ""
  private paths: readonly string[] = []
  revision = 0
  private overlayPaths: ReadonlyMap<string, string> | undefined
  private readonly boundaries: ScopeSourceBoundaries
  constructor(private readonly env: ScopeDependencyEnvironment, private readonly checkpoint: () => void) {
    this.boundaries = new ScopeSourceBoundaries(env.boundary, checkpoint)
  }

  begin(workspace: SemanticWorkspaceView, scripts: Map<string, { overlay: boolean }>): void {
    const paths = [...scripts.keys()]
    const aliases = JSON.stringify([...(workspace.overlayPaths ?? [])].filter(([file, alias]) => file !== alias))
    if (paths.length !== this.paths.length || paths.some((file, index) => file !== this.paths[index]) || aliases !== this.aliases) { this.entries.clear(); this.revision++ }
    this.paths = paths; this.aliases = aliases; this.overlayPaths = workspace.overlayPaths; this.scripts = scripts
    this.used.clear(); this.usedSdk.clear()
    this.boundaries.begin()
  }

  resolve(name: string, containingFile: string): ScopeBinding {
    this.checkpoint()
    const boundaryRevision = this.boundaries.revision
    const boundary = name.startsWith(".") ? this.boundaries.get(containingFile,
      this.scripts.has(containingFile)).value : undefined
    if (boundaryRevision !== this.boundaries.revision) this.revision++
    const key = JSON.stringify([path.dirname(containingFile), name, boundary])
    this.used.add(key)
    const previous = this.entries.get(key)
    if (previous?.current()) { for (const name of previous.sdkNames) this.usedSdk.add(name); return previous }
    const witness = new LoadedConfigurationWitness()
    const modules = new QueryModuleResolution(this.env.rootPath, this.env.options)
    const dependencies = new Map<string, SdkBinding>()
    const resolve = () => resolveTypeScriptModule({ rootPath: this.env.rootPath,
      sdkRoot: this.env.sdk.path, sdk: this.env.sdk, packageResolver: this.env.resolver,
      scripts: this.scripts, overlayPaths: this.overlayPaths,
      configurationWitness: witness, moduleResolution: modules, checkpoint: this.checkpoint,
      relativeResolutionCheckpoint: this.checkpoint, relativeResolutionFailures: new Map(),
      sdkLookup: specifier => { const sdk = this.sdk(specifier); dependencies.set(specifier, sdk); return sdk.file },
    }, name, containingFile, boundary)
    const value = modules.query(() => witness.observeResolutionPath(containingFile, () => {
      const first = resolve()
      if (!first) return first
      return witness.observeResolutionPath(first.resolvedFileName, () => {
        const confirmed = resolve()
        if (confirmed?.resolvedFileName !== first.resolvedFileName) throw new SemanticInputUnavailableError()
        return confirmed
      }, this.checkpoint)
    }, this.checkpoint))
    const current = () => {
      if (witness.freshness(this.checkpoint, "capture")?.() !== true) return false
      for (const dependency of dependencies.values()) if (!dependency.current()) return false
      return true
    }
    const entry: CachedBinding = { sdkNames: [...dependencies.keys()], file: value?.resolvedFileName,
      native: (value as ts.ResolvedModuleFull | undefined)?.packageId !== undefined,
      opaque: !current(), current }
    this.revision++; this.entries.set(key, entry)
    return entry
  }

  private sdk(name: string): SdkBinding {
    this.usedSdk.add(name)
    const previous = this.sdkEntries.get(name)
    if (previous?.current()) return previous
    const witness = new LoadedConfigurationWitness()
    const file = resolveHarmonySdkModule(this.env.sdk, name, witness) ?? undefined
    const entry = { file, current: () => witness.freshness(this.checkpoint, "capture")?.() === true }
    this.revision++; this.sdkEntries.set(name, entry)
    return entry
  }

  finish(): void {
    const boundaryRevision = this.boundaries.revision
    this.boundaries.finish()
    if (boundaryRevision !== this.boundaries.revision) this.revision++
    for (const key of this.entries.keys()) if (!this.used.has(key)) { this.entries.delete(key); this.revision++ }
    for (const name of this.sdkEntries.keys()) if (!this.usedSdk.has(name)) { this.sdkEntries.delete(name); this.revision++ }
  }

  current(): boolean { return this.boundaries.current() }
}
