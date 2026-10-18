import ts from "typescript"

const MAX_CHANGE_RANGES = 8

interface Change {
  fromVersion: number
  range: ts.TextChangeRange
}

/** A snapshot owns only its current text; ancestry keeps at most eight numeric deltas. */
class VersionedSnapshot implements ts.IScriptSnapshot {
  private readonly lineage: object
  private readonly version: number
  private readonly changes: readonly Change[]

  constructor(private readonly text: string, previous?: VersionedSnapshot) {
    this.lineage = previous?.lineage ?? {}
    this.version = (previous?.version ?? -1) + 1
    this.changes = previous ? [...previous.changes, {
      fromVersion: previous.version, range: difference(previous.text, text),
    }].slice(-MAX_CHANGE_RANGES) : []
  }

  getText(start: number, end: number): string { return this.text.substring(start, end) }
  getLength(): number { return this.text.length }

  getChangeRange(old: ts.IScriptSnapshot): ts.TextChangeRange | undefined {
    if (old === this) return { span: { start: 0, length: 0 }, newLength: 0 }
    if (!(old instanceof VersionedSnapshot) || old.lineage !== this.lineage) return undefined
    const index = this.changes.findIndex(change => change.fromVersion === old.version)
    if (index < 0) return undefined
    const range = ts.collapseTextChangeRangesAcrossMultipleVersions(
      this.changes.slice(index).map(change => change.range))
    return { span: { ...range.span }, newLength: range.newLength }
  }
}

export function versionedSnapshot(text: string, previous?: ts.IScriptSnapshot): ts.IScriptSnapshot {
  return new VersionedSnapshot(text, previous instanceof VersionedSnapshot ? previous : undefined)
}

function difference(before: string, after: string): ts.TextChangeRange {
  let start = 0
  const length = Math.min(before.length, after.length)
  while (start < length && before.charCodeAt(start) === after.charCodeAt(start)) start++
  let oldEnd = before.length
  let newEnd = after.length
  while (oldEnd > start && newEnd > start
    && before.charCodeAt(oldEnd - 1) === after.charCodeAt(newEnd - 1)) {
    oldEnd--
    newEnd--
  }
  return { span: { start, length: oldEnd - start }, newLength: newEnd - start }
}
