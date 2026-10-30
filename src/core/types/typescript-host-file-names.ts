import type ts from "typescript"
import { containsResolvedPath } from "../../project/resolved-path-containment.js"
import { diskIdentity } from "../../project/source-file-identity.js"
import { requestFileIdentity } from "../../project/request-input-validation.js"
import { createSourceDocument } from "./source-document.js"

/** Inferred entry points belong to the Host, not its mutable text-cache residency. */
export class TypeScriptHostRoots {
  private readonly preserveVersion = (process.env.ARKTS_L02_SAME_CONTENT_PROMOTION ?? "1") === "1"
  private readonly inferred = new Set<string>()
  private semantic: Set<string> | undefined
  private members: ReadonlySet<string> = new Set()
  private complete = false
  private base: string[]
  private combined: string[] | undefined
  private program: WeakRef<ts.Program> | undefined
  private programVersion: string | undefined
  private snapshots = new WeakMap<ts.IScriptSnapshot, { path: string; stamp: string; version: string }>()

  constructor(private readonly rootPath: string, private readonly sdkPaths: readonly string[]) {
    this.base = [...sdkPaths]
  }

  names(): string[] {
    return this.combined ??= compilerHostFileNames(this.base, this.semantic !== undefined,
      this.inferred, this.members, this.sdkPaths)
  }

  admit(filePath: string, unchangedCompilerInput: boolean, entryPoint = false): boolean {
    if ((!unchangedCompilerInput || entryPoint) && !this.inferred.has(filePath)) {
      this.inferred.add(filePath); this.combined = undefined
      return this.semantic === undefined && !this.members.has(filePath) && !this.sdkPaths.includes(filePath)
    }
    return false
  }

  remove(filePath: string): void { if (this.inferred.delete(filePath)) this.combined = undefined }

  updateMembership(complete: boolean, members: ReadonlySet<string>): void {
    this.complete = complete; this.members = members; this.rebuild()
  }

  updateSemantic(paths: readonly string[] | undefined): boolean {
    const next = paths === undefined ? undefined : new Set(paths)
    if (this.semantic === next || this.semantic && next && this.semantic.size === next.size
      && [...this.semantic].every(file => next.has(file))) return false
    this.semantic = next; this.rebuild(); return true
  }

  private rebuild(): void {
    this.base = membershipHostFileNames(this.semantic, this.complete, this.members, this.sdkPaths)
    this.combined = undefined
  }

  observeProgram(program: ts.Program | undefined, version: string): void {
    if (this.program?.deref() !== program) this.program = program ? new WeakRef(program) : undefined
    this.programVersion = program ? version : undefined
  }

  /** Only the actual offered snapshot, bracketed by equal full identities, can certify a promotion. */
  snapshot(filePath: string, version: string, read: () => ts.IScriptSnapshot | undefined): ts.IScriptSnapshot | undefined {
    if (!this.preserveVersion || !containsResolvedPath(this.rootPath, filePath)) return read()
    const before = requestFileIdentity(filePath, () => diskIdentity(filePath))
    const snapshot = read(), after = before && diskIdentity(filePath)
    if (snapshot && before && before.stamp === after?.stamp) {
      this.snapshots.set(snapshot, { path: filePath, stamp: before.stamp, version })
    }
    return snapshot
  }

  promotionVersion(filePath: string, content: string, version: string): string | undefined {
    if (!this.preserveVersion || this.programVersion !== version) return undefined
    const source = this.program?.deref()?.getSourceFile(filePath)
    const snapshot = (source as (ts.SourceFile & { scriptSnapshot?: ts.IScriptSnapshot }) | undefined)?.scriptSnapshot
    const witness = snapshot && this.snapshots.get(snapshot)
    if (!source || !snapshot || !witness || witness.path !== filePath
      || source.text !== createSourceDocument(content).generatedContent
      || snapshot.getText(0, snapshot.getLength()) !== source.text) return undefined
    const identity = requestFileIdentity(filePath, () => diskIdentity(filePath))
    return identity?.stamp === witness.stamp ? witness.version : undefined
  }

  forgetProgram(): void {
    this.program = undefined; this.programVersion = undefined; this.snapshots = new WeakMap()
  }

  clear(): void {
    this.forgetProgram(); this.inferred.clear(); this.semantic = undefined
    this.members = new Set(); this.complete = false; this.rebuild()
  }
}

/** Keep the host's admitted roots distinct from resident overlays and SDK roots. */
export function compilerHostFileNames(
  membershipFiles: string[],
  hasSemanticRoots: boolean,
  scriptPaths: Iterable<string>,
  membershipPaths: ReadonlySet<string>,
  sdkPaths: readonly string[],
): string[] {
  if (hasSemanticRoots) return membershipFiles
  const extras = [...scriptPaths].filter(filePath => (
    !membershipPaths.has(filePath) && !sdkPaths.includes(filePath)
  ))
  return extras.length === 0 ? membershipFiles : [...extras, ...membershipFiles]
}

/** Semantic groups and complete inferred projects retain their own legal root list. */
export function membershipHostFileNames(semanticRoots: ReadonlySet<string> | undefined,
  membershipComplete: boolean, membershipPaths: ReadonlySet<string>, sdkPaths: readonly string[]): string[] {
  const roots = semanticRoots ?? (membershipComplete ? membershipPaths : new Set<string>())
  return [...roots, ...sdkPaths.filter(filePath => !roots.has(filePath))]
}
