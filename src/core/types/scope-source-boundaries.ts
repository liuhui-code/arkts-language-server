import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { relativeModuleBoundary, type ModuleBoundary } from "./typescript-source-boundary.js"

interface Boundary { readonly script: boolean; readonly value: string | undefined; current(): boolean }

/** One original physical-path witness per containing file, shared by its edges. */
export class ScopeSourceBoundaries {
  private readonly entries = new Map<string, Boundary>()
  private readonly used = new Set<string>()
  revision = 0
  constructor(private readonly boundary: ModuleBoundary, private readonly checkpoint: () => void) {}

  begin(): void { this.used.clear() }

  get(file: string, script: boolean): Boundary {
    this.used.add(file)
    const previous = this.entries.get(file)
    if (previous?.script === script && previous.current()) return previous
    const witness = new LoadedConfigurationWitness()
    const value = witness.observePath(this.boundary.rootPath, () => witness.observeResolutionPath(file,
      () => relativeModuleBoundary(file, script, this.boundary), this.checkpoint))
    const entry = { script, value, current: () => witness.freshness(this.checkpoint, "capture")?.() === true }
    this.entries.set(file, entry)
    this.revision++
    return entry
  }

  finish(): void {
    for (const file of this.entries.keys()) if (!this.used.has(file)) { this.entries.delete(file); this.revision++ }
  }

  current(): boolean {
    return [...this.entries.values()].every(entry => entry.current())
  }
}
