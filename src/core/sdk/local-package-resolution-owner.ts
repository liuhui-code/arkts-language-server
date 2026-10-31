import path from "node:path"
import { randomUUID } from "node:crypto"
import { noteResolutionInputRebase } from "../../project/resolution-input-admission.js"
import { HarmonyProjectModel } from "../../project/harmony-project-model.js"
import { LoadedConfigurationWitness, type ConfigurationFreshnessMode,
  type ConfigurationWitnessFailure } from "../../project/loaded-configuration-witness.js"

export interface PackageManifest {
  name?: string
  entry?: string
  dependencies: Map<string, string>
}

/** One bounded resolver domain. Cache values and their original proofs retire together. */
export class LocalPackageResolutionOwner {
  protected readonly manifests = new Map<string, PackageManifest | null | undefined>()
  protected readonly directoryOwners = new Map<string, string | undefined>()
  protected readonly installations = new Map<string, string>()
  protected readonly canonicalRoots = new Map<string, string>()
  protected readonly projectModels = new Map<string, HarmonyProjectModel>()
  protected configurationWitness?: LoadedConfigurationWitness
  private projectSelection: unknown
  private epoch = 0
  private inputsEpoch = 0
  private readonly identity = randomUUID()

  get generation(): number { return this.epoch }
  get inputGeneration(): number { return this.inputsEpoch }
  get namespaceIdentity(): string { return `${this.identity}:${this.epoch}` }
  witnessesConfiguration(): boolean { return this.configurationWitness !== undefined }

  enableConfigurationWitness(): void {
    if (this.configurationWitness) return
    this.configurationWitness = new LoadedConfigurationWitness()
    if (this.manifests.size || this.directoryOwners.size || this.installations.size || this.canonicalRoots.size) {
      this.configurationWitness.markUnprovable()
    }
    for (const model of this.projectModels.values()) model.enableConfigurationWitness()
  }

  /** A compiler consuming this generation cannot certify itself against a later empty proof set. */
  createInputWitness(rootPath: string, required: boolean,
    onUnprovable?: (failure: ConfigurationWitnessFailure) => void,
    recoverSourceNamespace?: (filePath: string) => boolean): LoadedConfigurationWitness | undefined {
    if (!required && !this.configurationWitness) return undefined
    this.enableConfigurationWitness()
    this.projectFor(rootPath)
    const epoch = this.epoch
    return new LoadedConfigurationWitness(onUnprovable, () => epoch === this.epoch, paths => {
      // Compiler-private lookups are consumers of this same resolution domain.
      // Reject the current proof; retire values and consumers together so that
      // the next explicit command can load current inputs without a watcher.
      if (epoch !== this.epoch || !recoverSourceNamespace || !paths.every(recoverSourceNamespace)) return
      this.invalidate()
      noteResolutionInputRebase(this)
    })
  }

  /** Query admission is a safe boundary; never reset a proof halfway through its consumer. */
  refreshInputGeneration(rootPath: string, checkpoint: () => void): boolean {
    this.enableConfigurationWitness()
    this.projectFor(rootPath)
    const current = this.configurationFreshness(rootPath, checkpoint, "capture")
    if (current?.()) return false
    this.invalidate()
    noteResolutionInputRebase(this)
    return true
  }

  configurationFreshness(rootPath: string, checkpoint: () => void,
    mode: ConfigurationFreshnessMode = "validate"): (() => boolean) | undefined {
    const epoch = this.epoch
    const resolver = this.configurationWitness?.freshness(checkpoint, mode)
    const model = this.projectModels.get(path.resolve(rootPath))?.configurationFreshness(checkpoint, mode)
    if (!resolver || !model) return undefined
    return () => epoch === this.epoch && resolver() && model()
  }

  configureProject(selection: unknown): void {
    this.projectSelection = selection
    this.projectModels.clear()
    this.invalidate()
  }

  projectFor(rootPath: string): HarmonyProjectModel {
    const root = path.resolve(rootPath)
    let model = this.projectModels.get(root)
    if (!model) {
      model = new HarmonyProjectModel(root, this.projectSelection)
      if (this.configurationWitness) model.enableConfigurationWitness()
    }
    this.projectModels.delete(root)
    this.projectModels.set(root, model)
    while (this.projectModels.size > 4) this.projectModels.delete(this.projectModels.keys().next().value!)
    return model
  }

  invalidate(_rootPath?: string): void {
    // The existing caches share one proof owner across lexical/canonical roots.
    // Partial deletion plus a new empty witness would certify surviving stale values.
    this.epoch += 1
    this.inputsEpoch += 1
    this.clearResolutionValues()
    for (const model of this.projectModels.values()) model.invalidate()
    this.configurationWitness?.reset()
  }

  /** Caller has invalidated all consumers overlapping these lexical/canonical roots. */
  invalidateNamespaces(roots: readonly string[]): void {
    if (!roots.length || !this.configurationWitness?.retireNamespaces(roots)) { this.invalidate(); return }
    this.epoch += 1
    // No metadata value may survive removal of its original proof. Unaffected
    // DocumentStore graphs retain their original outside facts, not restamps.
    this.clearResolutionValues()
    for (const [root, model] of this.projectModels) {
      if (roots.some(dirty => overlaps(root, dirty))) model.invalidate()
    }
  }

  private clearResolutionValues(): void {
    this.manifests.clear(); this.directoryOwners.clear()
    this.installations.clear(); this.canonicalRoots.clear()
  }

  protected observed<T>(filePath: string, lookup: () => T): T {
    return this.configurationWitness ? this.configurationWitness.observe(filePath, lookup) : lookup()
  }
}

function overlaps(a: string, b: string): boolean {
  const within = (root: string, file: string) => {
    const relative = path.relative(root, file)
    return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep)
  }
  return within(a, b) || within(b, a)
}
