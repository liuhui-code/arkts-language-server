import { createHash } from "node:crypto"
import path from "node:path"
import type { SemanticReadinessReport } from "../contracts/semantic-readiness.js"
import type { SemanticDocumentStore, SemanticWorkspaceView } from "../core/workspace/document-store.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"

/** Transport actual enumeration and, only for complete-query admission, actual
 * disk bytes, including exact compiler read evidence inside its admitted lease.
 * Metadata alone is an admission guard, never a cross-request content proof.
 * Retained encoding is lexical metadata only, weakly owned by frozen membership.
 * No AST, source text, disk validity or content manifest is retained here.
 */
export function projectSourceNamespace(documents: SemanticDocumentStore, workspace: SemanticWorkspaceView,
  captureInputs: boolean, verifiedDiskDigest?: (filePath: string) => string | undefined): NonNullable<SemanticReadinessReport["sourceNamespace"]> {
  const membership = workspace.projectMembership!
  const encoding = sourceNamespaceEncoding(workspace)
  const names = { sha256: encoding.sha256, sources: membership.paths.length }
  if (!captureInputs) return names
  const inputs = createHash("sha256")
  const digests: Array<Buffer | undefined> = []
  let overlayOnly = false
  for (const { filePath, physicalPath, index } of encoding.entries) {
    const token = documents.tokenFor(workspace.canonicalRootId, membership.revision, filePath)
    if (token === undefined) {
      // Complete membership accepts overlay-only names before disk enumeration.
      // Native disk facts cannot narrow their semantic references.
      overlayOnly = true
      continue
    }
    const overlay = documents.overlayFor(workspace.overlayPaths?.get(physicalPath) ?? filePath)
    const borrowed = !overlay ? verifiedDiskDigest?.(filePath) : undefined
    if (borrowed !== undefined) digests[index] = Buffer.from(borrowed, "hex")
    else {
      const text = documents.read(workspace.canonicalRootId, membership.revision, filePath, token)
      if (text === null) throw new SemanticInputUnavailableError()
      digests[index] = createHash("sha256").update(text).digest()
    }
  }
  // Exact CompleteScanInputs v2 source digest: sorted canonical Native URIs,
  // u64 little-endian URI byte length, URI bytes, then raw SHA-256 source bytes.
  for (const { index, bytes, length } of encoding.sorted) {
    const digest = digests[index]
    if (digest) inputs.update(length).update(bytes).update(digest)
  }
  documents.refreshProjectMembership(workspace.rootPath)
  const current = documents.membershipFor(workspace.rootPath)
  if (current.status !== "complete" || current.revision !== membership.revision) throw new SemanticInputUnavailableError()
  return { ...names, diskSha256: inputs.digest("hex"), overlayOnly }
}


/** Same URI byte spelling as index-sqlite/cache_location.rs; fold only drive letters. */
export function indexSourceUri(filePath: string, platform: NodeJS.Platform = process.platform): string {
  let source = filePath
  if (platform === "win32") {
    source = source.replaceAll("\\", "/")
    if (source.startsWith("//?/UNC/")) source = `//${source.slice(8)}`
    else if (source.startsWith("//?/")) source = source.slice(4)
    source = source.replace(/^[A-Z](?=:)/, drive => drive.toLowerCase())
  }
  let encoded = ""
  for (const byte of Buffer.from(source)) {
    encoded += (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || (byte >= 48 && byte <= 57)
      || "-._~/:".includes(String.fromCharCode(byte)) ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
  }
  return platform === "win32" ? source.startsWith("//") ? `file:${encoded}` : `file:///${encoded}` : `file://${encoded}`
}

/** Frozen names determine encoding, never whether their current disk inputs qualify. */
function sourceNamespaceEncoding(workspace: SemanticWorkspaceView) {
  const paths = workspace.projectMembership!.paths
  const retained = Object.isFrozen(paths) ? encodings.get(paths) : undefined
  if (retained?.rootPath === workspace.rootPath && retained.canonicalRootId === workspace.canonicalRootId) return retained
  const entries = paths.map((filePath, index) => {
    const physicalPath = path.join(workspace.canonicalRootId, path.relative(workspace.rootPath, filePath))
    const uri = indexSourceUri(physicalPath), bytes = Buffer.from(uri), length = Buffer.alloc(8)
    length.writeBigUInt64LE(BigInt(bytes.length))
    return { index, filePath, physicalPath, uri, bytes, length }
  })
  const encoding = { rootPath: workspace.rootPath, canonicalRootId: workspace.canonicalRootId, entries,
    sorted: [...entries].sort((left, right) => left.uri < right.uri ? -1 : left.uri > right.uri ? 1 : 0),
    sha256: createHash("sha256").update(JSON.stringify([workspace.canonicalRootId, paths])).digest("hex") }
  if (Object.isFrozen(paths)) encodings.set(paths, encoding)
  return encoding
}

const encodings = new WeakMap<readonly string[], {
  rootPath: string; canonicalRootId: string; sha256: string
  entries: EncodedSource[]; sorted: EncodedSource[]
}>()
interface EncodedSource {
  index: number; filePath: string; physicalPath: string; uri: string; bytes: Buffer; length: Buffer
}
