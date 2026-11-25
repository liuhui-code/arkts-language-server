import type { SourceReadOrigin } from "../../project/source-read-origin.js"
import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { relativeModuleBoundary, relativeModuleBoundaryFromPhysical, type ModuleBoundary } from "./typescript-source-boundary.js"

interface Boundary { readonly script: boolean; readonly value: string | undefined; current(): boolean }

/** One original physical-path witness per containing file, shared by its edges. */
export class ScopeSourceBoundaries {
  private readonly entries = new Map<string, Boundary>()
  private readonly references = new Map<string, number>()
  private readonly pending = new Set<string>()
  revision = 0
  constructor(private readonly boundary: ModuleBoundary, private readonly checkpoint: () => void) {}

  /** Reused edges still own their original containing-file proof. */
  retain(file: string, script: boolean): boolean {
    const entry = this.entries.get(file)
    if (entry?.script !== script || !entry.current()) return false
    return true
  }

  get(file: string, script: boolean, origin?: SourceReadOrigin): Boundary {
    const previous = this.entries.get(file)
    if (previous?.script === script && previous.current()) return previous
    const witness = new LoadedConfigurationWitness()
    const qualified = origin?.file === file && origin.root === this.boundary.workspacePhysicalRoot
    if (qualified) witness.retainSourceRead(origin)
    const value = qualified ? relativeModuleBoundaryFromPhysical(file, origin.physicalPath, this.boundary)
      : witness.observePath(this.boundary.rootPath, () => witness.observeResolutionPath(file,
        () => relativeModuleBoundary(file, script, this.boundary), this.checkpoint))
    const freshness = witness.freshness(this.checkpoint, "capture")
    const entry = { script, value, current: () => freshness?.() === true }
    this.entries.set(file, entry); this.pending.add(file)
    this.revision++
    return entry
  }

  changeReferences(before?: string, after?: string): void {
    if (before && !this.references.has(before)) throw new Error("Unpaired source boundary release")
    if (after && !this.entries.has(after)) throw new Error("Missing source boundary owner")
    if (before === after) return
    if (after) this.references.set(after, (this.references.get(after) ?? 0) + 1)
    if (before) {
      const count = this.references.get(before)! - 1
      if (count) this.references.set(before, count)
      else { this.references.delete(before); this.entries.delete(before); this.revision++ }
    }
  }

  finish(): void {
    for (const file of this.pending) if (!this.references.has(file)) {
      this.entries.delete(file); this.revision++
    }
    this.pending.clear()
  }

  collectStaleSources(failed: Set<string>): boolean {
    let valid = true
    for (const [file, entry] of this.entries) if (!entry.current()) { failed.add(file); valid = false }
    return valid
  }

  current(): boolean {
    return [...this.entries.values()].every(entry => entry.current())
  }
}
