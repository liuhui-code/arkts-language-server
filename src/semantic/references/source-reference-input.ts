import { semanticRuntimeConfig } from "../coordinator/runtime-config.js"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { SemanticQuery, SemanticReferencesQuery } from "../../contracts/semantic-engine.js"
import { REFERENCE_QUERY_CACHE_PREFIX } from "../../contracts/reference-query-proof.js"
import { relativePathWithinRoot, sameResolvedPath } from "../../project/path-identity.js"
import { lookupIdentity } from "../../project/configuration-lookup-identity.js"
import { MAX_DISK_SNAPSHOT_BYTES, readDiskSource } from "../../core/workspace/workspace-disk-source.js"
import { toFilePath } from "../semantic-worker-file-identity.js"
import { SemanticWorkerSupervisorError } from "../semantic-worker-supervisor-errors.js"
import { captureReferenceSourceOverlays } from "./reference-input-snapshot.js"
import type { DocumentSnapshot } from "../../contracts/document.js"

export const SOURCE_REFERENCE_PROFILE = "source-declaration-lexical-v1:"

/** Cost hint only. Actual compiler binding/profile checks remain in the Worker. */
export function hasSourceReferenceCandidate(query: SemanticReferencesQuery): boolean {
  if (!/\.(?:ts|ets)$/.test(query.document.uri) || /\b(?:struct|namespace|declare)\b/.test(query.document.text)) return false
  const lines = query.document.text.split(/\r\n|\r|\n/)
  if (query.position.line >= lines.length) return false
  let offset = 0
  const starts = query.document.text.matchAll(/\r\n|\r|\n/g)
  for (let i = 0; i < query.position.line; i++) { const next = starts.next(); if (next.done) return false; offset = next.value.index! + next.value[0].length }
  offset += query.position.character
  for (const match of query.document.text.matchAll(/\b(?:let|const)\s+([$_\p{ID_Start}][$_\p{ID_Continue}\u200c\u200d]*)/gu)) {
    const start = match.index! + match[0].length - match[1].length
    if (offset >= start && offset < start + match[1].length) return true
  }
  return false
}

export function sourceReferenceCheckpoint(query: SemanticQuery): void {
  if (query.signal?.aborted) throw new SemanticWorkerSupervisorError(
    (query.signal.reason as { code?: unknown })?.code === "content-modified" ? "content-modified" : "client-cancelled")
}
const changed = (): never => { throw new SemanticWorkerSupervisorError("content-modified") }

/** Original descriptor-guarded target read plus path ancestry, not a workspace
 * enumeration. Missing/new files and physical escapes keep the full route. */
export function sourceReferenceInputKey(query: SemanticQuery): string | undefined {
  sourceReferenceCheckpoint(query)
  const file = toFilePath(query.document.uri), root = toFilePath(query.document.source?.rootUri ?? query.document.workspaceId)
  if (!file || !root || relativePathWithinRoot(root, file) === undefined) return undefined
  const rootIdentity = lookupIdentity(root, true)
  if (!rootIdentity) return changed()
  let physicalRoot: string, physicalFile: string
  try { physicalRoot = fs.realpathSync.native(root); physicalFile = fs.realpathSync.native(file) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !query.document.source) return undefined
    return changed()
  }
  if (relativePathWithinRoot(physicalRoot, physicalFile) === undefined) return undefined
  const directories: string[] = []
  for (let parent = path.dirname(file); ; parent = path.dirname(parent)) {
    directories.push(parent)
    if (sameResolvedPath(parent, root)) break
    if (parent === path.dirname(parent) || relativePathWithinRoot(root, parent) === undefined) return undefined
  }
  const ancestry = () => directories.map(directory => lookupIdentity(directory, true)?.identity)
  const parents = ancestry(), before = lookupIdentity(file)
  if (!before || parents.some(value => value === undefined)) return changed()
  try { if (fs.statSync(file).size > MAX_DISK_SNAPSHOT_BYTES) return undefined }
  catch { return changed() }
  const loaded = readDiskSource(file, MAX_DISK_SNAPSHOT_BYTES,
    { checkpoint: () => sourceReferenceCheckpoint(query) }, physicalFile)
  if (loaded.status !== "loaded" || lookupIdentity(file)?.identity !== before.identity
    || lookupIdentity(root, true)?.identity !== rootIdentity.identity
    || JSON.stringify(ancestry()) !== JSON.stringify(parents)) return changed()
  if (query.document.source && loaded.content !== query.document.text) return changed()
  sourceReferenceCheckpoint(query)
  const bytes = JSON.stringify([rootIdentity.identity, physicalRoot, physicalFile, parents, before.identity,
    createHash("sha256").update(loaded.content).digest("hex")])
  return SOURCE_REFERENCE_PROFILE + createHash("sha256").update(bytes).digest("hex")
}

/** A separate input-domain tag; old namespace receipts cannot acquire it. */
export function hasSourceReferenceCacheProof(proof: string | undefined): boolean {
  if (!proof?.startsWith(REFERENCE_QUERY_CACHE_PREFIX)) return false
  try { return JSON.parse(proof.slice(REFERENCE_QUERY_CACHE_PREFIX.length)).namespace?.startsWith(SOURCE_REFERENCE_PROFILE) === true }
  catch { return false }
}

/** Preserve effective physical-overlay authority; another open alias cannot be
 * ignored just because unrelated closed project files are irrelevant. */
export function sourceReferenceAuthority(query: SemanticQuery, documents: Iterable<DocumentSnapshot>): boolean {
  const file = toFilePath(query.document.uri)
  if (!file) return false
  const overlays = captureReferenceSourceOverlays(documents)
  if (!overlays.complete) return false
  const opened = overlays.hasOverlay(file)
  if (!query.document.source) return opened
  let physical: string
  try { physical = fs.realpathSync.native(file) } catch { return false }
  return !opened && overlays.overlayPath(physical) === undefined
}

/** Reuse the existing opt-in level2 admission boundary, not a new budget or
 * pressure state machine. Default null budgets never reject this profile. */
export function sourceReferenceBudgetAllows(environment: NodeJS.ProcessEnv): boolean {
  const config = semanticRuntimeConfig(environment)
  return config.memoryBudgetBytes === null
    || process.memoryUsage().rss / config.memoryBudgetBytes < config.level2Ratio
}
