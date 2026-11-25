import path from "node:path"

interface OverlayRecord {
  readonly overlay: boolean
  readonly content: string
  readonly documentVersion?: number
}
interface OverlayState { current(): boolean }
interface OverlayObservation {
  readonly owner: object
  readonly versions: ReadonlyMap<string, object>
}
const observations = new WeakMap<OverlayState, OverlayObservation>()

/** Exhaustive metadata delta from one genuine producer. No source bytes/ASTs,
 * disk validity or inferred change history are retained by an observation. */
export function changedOverlayPaths(previous: OverlayState, current: OverlayState): readonly string[] | undefined {
  const before = observations.get(previous), after = observations.get(current)
  if (!before || !after || before.owner !== after.owner || !current.current()) return undefined
  if (previous === current) return []
  const changed = new Set<string>()
  for (const [file, version] of before.versions) if (after.versions.get(file) !== version) changed.add(file)
  for (const [file, version] of after.versions) if (before.versions.get(file) !== version) changed.add(file)
  return [...changed]
}

/** All store mutation paths, including rollback/clear, revoke the live text receipt.
 * Records replace their text/version/overlay fields through set, never in place. */
export class OverlayDocumentMap<T extends OverlayRecord> extends Map<string, T> {
  private lifecycle = {}
  private readonly owner = {}
  private readonly overlayVersions = new Map<string, object>()
  private state: OverlayState | undefined

  constructor() { super() }

  override set(file: string, record: T): this {
    const previous = this.get(file)
    if (previous?.overlay || record.overlay) {
      this.invalidate()
      if (record.overlay) this.overlayVersions.set(file, {})
      else this.overlayVersions.delete(file)
    }
    return super.set(file, record)
  }

  override delete(file: string): boolean {
    if (this.get(file)?.overlay) { this.invalidate(); this.overlayVersions.delete(file) }
    return super.delete(file)
  }

  override clear(): void {
    if (this.overlayVersions.size) this.invalidate()
    this.overlayVersions.clear()
    super.clear()
  }

  overlayFor(file: string): { readonly content: string; readonly documentVersion?: number } | undefined {
    const record = this.get(path.resolve(file))
    return record?.overlay ? { content: record.content, documentVersion: record.documentVersion } : undefined
  }

  overlayState(): OverlayState {
    if (this.state) return this.state
    const lifecycle = this.lifecycle
    const state = Object.freeze({ current: () => lifecycle === this.lifecycle })
    observations.set(state, { owner: this.owner, versions: new Map(this.overlayVersions) })
    return this.state = state
  }

  private invalidate(): void { this.lifecycle = {}; this.state = undefined }
}
