import { createHash } from "node:crypto"
import ts from "typescript"
import type { ProjectFileAccessPort, ProjectFileAdmissionToken } from "../workspace/document-store.js"
import { diskIdentity } from "../../project/source-file-identity.js"
import { requestFileIdentity, validateRequestInput } from "../../project/request-input-validation.js"
import { cacheLimit, MAX_LAZY_SNAPSHOTS, MAX_LAZY_SNAPSHOT_BYTES } from "./typescript-cache-limits.js"
import { createSourceDocument, type SourceDocument } from "./source-document.js"
import { isRegularBoundedFile } from "./typescript-safe-source-read.js"

export interface LazySnapshotRecord {
  path: string
  content: string
  virtualDocument: SourceDocument
  snapshot: ts.IScriptSnapshot
  sourceFingerprint: string
  bytes: number
  admissionToken?: ProjectFileAdmissionToken
}

interface Hooks {
  readonly limits: { maxFiles?: number; maxBytes?: number }
  readonly projectFileAccess?: ProjectFileAccessPort
  readonly readSourceFile: (filePath: string) => string | null
  readonly isMember: (filePath: string) => boolean
  readonly membership: () => { rootId: string; revision: number }
  readonly unavailable: (reason: "admission" | "read") => void
  readonly observed: (filePath: string, fingerprint: string) => void
  readonly checkpoint: () => void
}

interface OwnedSnapshot { readonly record: LazySnapshotRecord; readonly stamp: string }

/** Strong LRU stays bounded; weak records live only while the compiler owns their snapshot. */
export class TypeScriptLazySnapshots {
  private readonly records = new Map<string, LazySnapshotRecord>()
  private readonly paths = new Map<string, WeakRef<ts.IScriptSnapshot>>()
  private owned = new WeakMap<ts.IScriptSnapshot, OwnedSnapshot>()
  private bytes = 0
  private readonly maxFiles: number
  private readonly maxBytes: number
  private readonly projectFileAccess: ProjectFileAccessPort | undefined

  constructor(private readonly hooks: Hooks) {
    this.projectFileAccess = hooks.projectFileAccess
    this.maxFiles = cacheLimit(hooks.limits.maxFiles, MAX_LAZY_SNAPSHOTS, "lazy snapshot files")
    this.maxBytes = cacheLimit(hooks.limits.maxBytes, MAX_LAZY_SNAPSHOT_BYTES, "lazy snapshot bytes")
  }

  state() { return { files: this.records.size, bytes: this.bytes, maxFiles: this.maxFiles, maxBytes: this.maxBytes } }
  *keys(): IterableIterator<string> { yield* new Set([...this.records.keys(), ...this.paths.keys()]) }

  load(filePath: string): LazySnapshotRecord | undefined {
    if (!this.hooks.isMember(filePath)) return undefined
    const { rootId, revision } = this.hooks.membership()
    const admissionToken = this.projectFileAccess?.tokenFor(rootId, revision, filePath)
    if (this.projectFileAccess && admissionToken === undefined) {
      this.forget(filePath)
      this.hooks.unavailable("admission")
      return undefined
    }
    const cached = this.records.get(filePath)
    if (cached && (!this.projectFileAccess || cached.admissionToken === admissionToken)) {
      this.records.delete(filePath)
      this.records.set(filePath, cached)
      return cached
    }
    if (cached) this.forget(filePath)
    const retained = this.compilerOwned(filePath, admissionToken)
    if (retained) return retained
    if (!this.projectFileAccess && !isRegularBoundedFile(filePath)) return undefined
    const identity = this.projectFileAccess ? requestFileIdentity(filePath, () => diskIdentity(filePath)) : undefined
    const sourceContent = this.projectFileAccess ? this.projectFileAccess.read(
      rootId, revision, filePath, admissionToken!,
    ) : this.hooks.readSourceFile(filePath)
    if (sourceContent === null) {
      if (this.projectFileAccess) this.hooks.unavailable("read")
      return undefined
    }
    const afterRead = identity ? diskIdentity(filePath) : undefined
    this.hooks.checkpoint()
    const virtualDocument = createSourceDocument(sourceContent), content = virtualDocument.generatedContent
    const record: LazySnapshotRecord = { path: filePath, content, virtualDocument,
      snapshot: ts.ScriptSnapshot.fromString(content),
      sourceFingerprint: createHash("sha256").update(sourceContent).digest("hex"),
      bytes: Buffer.byteLength(sourceContent) + Buffer.byteLength(content),
      ...(admissionToken === undefined ? {} : { admissionToken }) }
    this.hooks.observed(filePath, record.sourceFingerprint)
    if (record.bytes <= this.maxBytes && this.maxFiles > 0) {
      if (identity && afterRead?.stamp === identity.stamp) {
        this.owned.set(record.snapshot, { record, stamp: identity.stamp })
        this.paths.set(filePath, new WeakRef(record.snapshot))
      }
      this.records.set(filePath, record)
      this.bytes += record.bytes
      while (this.records.size > this.maxFiles || this.bytes > this.maxBytes) {
        const oldest = this.records.keys().next().value
        if (oldest === undefined) break
        this.removeStrong(oldest)
      }
    }
    return record
  }

  private compilerOwned(filePath: string, token: ProjectFileAdmissionToken | undefined): LazySnapshotRecord | undefined {
    const snapshot = this.paths.get(filePath)?.deref()
    const input = snapshot && this.owned.get(snapshot)
    if (!input || input.record.admissionToken !== token) { this.forget(filePath); return undefined }
    const current = () => {
      this.hooks.checkpoint()
      return requestFileIdentity(filePath, () => diskIdentity(filePath))?.stamp === input.stamp
    }
    if (!validateRequestInput(snapshot, 0, 0, current)) { this.forget(filePath); return undefined }
    return input.record
  }

  private removeStrong(filePath: string): void {
    const record = this.records.get(filePath)
    if (record) this.bytes -= record.bytes
    this.records.delete(filePath)
  }

  forget(filePath: string): void {
    this.removeStrong(filePath)
    const snapshot = this.paths.get(filePath)?.deref()
    if (snapshot) this.owned.delete(snapshot)
    this.paths.delete(filePath)
  }

  clearCompilerOwned(): void { this.owned = new WeakMap(); this.paths.clear() }
  clear(): void { this.records.clear(); this.bytes = 0; this.clearCompilerOwned() }
}
