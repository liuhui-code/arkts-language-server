import path from "node:path"
import ts from "typescript"
import { diskIdentity } from "../../project/source-file-identity.js"
import { requestFileIdentity, validateRequestInput } from "../../project/request-input-validation.js"

type SourceReader = (filePath: string) => string | null
interface FileIdentity { readonly physicalPath: string; readonly stamp: string }
export interface SourceTextEvidence { readonly text: string; readonly stamp: string }
export interface ValidatedCompilerSource {
  readonly path: string
  readonly text: string
  readonly snapshot: ts.IScriptSnapshot
  readonly identity: FileIdentity
}

/** Data facts share a reader; semantic coverage, configuration and readiness stay owner-local. */
export class CompilerSourceReadFacts {
  readonly text = new WeakMap<ts.SourceFile, SourceTextEvidence>()
  private readonly paths = new Map<string, WeakRef<ts.IScriptSnapshot>>()
  private readonly snapshots = new WeakMap<ts.IScriptSnapshot, ValidatedCompilerSource>()
  private readonly finalizer = new FinalizationRegistry<{ path: string; ref: WeakRef<ts.IScriptSnapshot> }>(
    ({ path: filePath, ref }) => { if (this.paths.get(filePath) === ref) this.paths.delete(filePath) })

  /** Called only after exact SourceFile/text was read between matching full identities. */
  remember(source: ts.SourceFile, identity: FileIdentity): void {
    this.text.set(source, { text: source.text, stamp: identity.stamp })
    const snapshot = (source as ts.SourceFile & { scriptSnapshot?: ts.IScriptSnapshot }).scriptSnapshot
    if (!snapshot || snapshot.getText(0, snapshot.getLength()) !== source.text) return
    const filePath = path.resolve(source.fileName)
    const previous = this.paths.get(filePath)
    this.snapshots.set(snapshot, { path: filePath, text: source.text, snapshot, identity })
    if (previous?.deref() === snapshot) return
    if (previous) this.finalizer.unregister(previous)
    const ref = new WeakRef(snapshot)
    this.paths.set(filePath, ref)
    this.finalizer.register(snapshot, { path: filePath, ref }, ref)
  }

  current(filePath: string, checkpoint: () => void): ValidatedCompilerSource | undefined {
    const ref = this.paths.get(filePath), snapshot = ref?.deref()
    const input = snapshot && this.snapshots.get(snapshot)
    if (!input || input.path !== filePath) {
      if (ref) this.finalizer.unregister(ref)
      this.paths.delete(filePath)
      return undefined
    }
    const current = () => {
      checkpoint()
      return requestFileIdentity(filePath, () => diskIdentity(filePath))?.stamp === input.identity.stamp
    }
    return validateRequestInput(snapshot, 0, 0, current) ? input : undefined
  }
}

const factsByReader = new WeakMap<SourceReader, CompilerSourceReadFacts>()
export function compilerSourceReadFacts(read: SourceReader): CompilerSourceReadFacts {
  let facts = factsByReader.get(read)
  if (!facts) { facts = new CompilerSourceReadFacts(); factsByReader.set(read, facts) }
  return facts
}

/** Reuse the compiler's actual snapshot; never cache a second SDK text or Program. */
export function compilerScriptSnapshot(filePath: string, readSourceFile: SourceReader,
  checkpoint: () => void): ts.IScriptSnapshot | undefined {
  const known = compilerSourceReadFacts(readSourceFile).current(filePath, checkpoint)
  if (known) return known.snapshot
  const content = readSourceFile(filePath)
  return content === null ? undefined : ts.ScriptSnapshot.fromString(content)
}
