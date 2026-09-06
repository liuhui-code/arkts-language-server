import { constants, promises as fs, type Stats } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { TextDocuments } from "vscode-languageserver/node.js"
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type {
  SemanticCallHierarchyFailureReason,
  SemanticCallHierarchyItem,
  SemanticCallHierarchySource,
} from "../contracts/semantic-engine.js"
import { MAX_DISK_SNAPSHOT_BYTES } from "../core/workspace/document-store.js"
import { isCanonicalCallHierarchyFileUri } from "./call-hierarchy-adapter.js"

interface ConfiguredWorkspaceRoot {
  id: string
  rootUri: string
}

interface CallHierarchySourceAuthorityDependencies {
  documents: TextDocuments<TextDocument>
  snapshot(document: TextDocument): DocumentSnapshot
  workspaceRoots(): readonly ConfiguredWorkspaceRoot[]
}

interface FileIdentity {
  rootRealPath: string
  sourceRealPath: string
  dev: number
  ino: number
  size: number
  mtimeMs: number
  ctimeMs: number
}

interface OpenIdentity {
  uri: string
  version: number
  sourceFingerprint: string
  rootRealPath: string
  sourceRealPath: string
}

type ResultIdentity =
  | { kind: "open"; identity: OpenIdentity; rootUri: string }
  | { kind: "disk"; identity: FileIdentity; uri: string; rootUri: string }

const MAX_RESULT_SOURCE_BYTES = 16 * 1_024 * 1_024

export type CallHierarchySourceResolution =
  | {
      status: "complete"
      source: SemanticCallHierarchySource
      identity: FileIdentity | OpenIdentity
    }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }

export class CallHierarchySourceAuthority {
  constructor(private readonly dependencies: CallHierarchySourceAuthorityDependencies) {}

  rootUriFor(documentUri: string): string | undefined {
    if (!isCanonicalCallHierarchyFileUri(documentUri)) return undefined
    let documentPath: string
    try {
      documentPath = fileURLToPath(documentUri)
    } catch {
      return undefined
    }
    return this.dependencies.workspaceRoots()
      .filter(({ rootUri }) => {
        if (!isCanonicalCallHierarchyFileUri(rootUri)) return false
        try {
          return isInside(fileURLToPath(rootUri), documentPath)
        } catch {
          return false
        }
      })
      .sort((left, right) => right.rootUri.length - left.rootUri.length)[0]?.rootUri
  }

  workspace(rootUri: string): ConfiguredWorkspaceRoot | undefined {
    if (!isCanonicalCallHierarchyFileUri(rootUri)) return undefined
    return this.dependencies.workspaceRoots().find((workspace) => workspace.rootUri === rootUri)
  }

  async resolve(
    documentUri: string,
    rootUri: string,
    maxBytes = MAX_DISK_SNAPSHOT_BYTES,
  ): Promise<CallHierarchySourceResolution> {
    const workspace = this.workspace(rootUri)
    if (!workspace || this.rootUriFor(documentUri) !== rootUri) {
      return { status: "incomplete", reason: "source-outside-workspace" }
    }
    const sourcePath = fileURLToPath(documentUri)
    if (!isSourcePath(sourcePath)) {
      return { status: "incomplete", reason: "source-unavailable" }
    }

    const openDocument = this.dependencies.documents.get(documentUri)
    if (openDocument) {
      const contained = await realPathContained(rootUri, sourcePath, true)
      if (contained.status !== "complete") return contained
      const document = this.dependencies.snapshot(openDocument)
      if (
        document.workspaceId !== workspace.id
        || await this.physicalRootUriFor(contained.sourceRealPath) !== rootUri
      ) {
        return { status: "incomplete", reason: "source-outside-workspace" }
      }
      const documentBytes = Buffer.byteLength(document.text)
      if (documentBytes > MAX_DISK_SNAPSHOT_BYTES || documentBytes > maxBytes) {
        return { status: "incomplete", reason: "result-limit-exceeded" }
      }
      return {
        status: "complete",
        source: { kind: "open", document, workspaceRootUri: rootUri },
        identity: {
          uri: document.uri,
          version: document.version,
          sourceFingerprint: sourceFingerprint(document.text),
          rootRealPath: contained.rootRealPath,
          sourceRealPath: contained.sourceRealPath,
        },
      }
    }

    const contained = await realPathContained(rootUri, sourcePath, false)
    if (contained.status !== "complete") return contained
    if (await this.physicalRootUriFor(contained.sourceRealPath) !== rootUri) {
      return { status: "incomplete", reason: "source-outside-workspace" }
    }
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined
    try {
      const candidate = await fs.stat(contained.sourceRealPath)
      if (!candidate.isFile() || !isBoundedSize(candidate.size)) {
        return { status: "incomplete", reason: "source-unavailable" }
      }
      if (candidate.size > maxBytes) {
        return { status: "incomplete", reason: "result-limit-exceeded" }
      }
      handle = await fs.open(
        contained.sourceRealPath,
        constants.O_RDONLY | constants.O_NONBLOCK,
      )
      const before = await handle.stat()
      if (!before.isFile() || !isBoundedSize(before.size)) {
        return { status: "incomplete", reason: "source-unavailable" }
      }
      if (before.size > maxBytes) {
        return { status: "incomplete", reason: "result-limit-exceeded" }
      }
      const bytes = await readBounded(handle, before.size)
      const after = await handle.stat()
      if (
        !bytes
        || bytes.length !== before.size
        || !sameStat(before, after)
      ) return { status: "incomplete", reason: "source-unavailable" }
      const sourceRealPathAfter = await fs.realpath(sourcePath)
      const rootRealPathAfter = await fs.realpath(fileURLToPath(rootUri))
      if (
        sourceRealPathAfter !== contained.sourceRealPath
        || rootRealPathAfter !== contained.rootRealPath
        || !isInside(rootRealPathAfter, sourceRealPathAfter)
      ) return { status: "incomplete", reason: "source-outside-workspace" }
      let text: string
      try {
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
      } catch {
        return { status: "incomplete", reason: "source-unavailable" }
      }
      return {
        status: "complete",
        source: {
          kind: "disk",
          uri: documentUri,
          text,
          workspaceId: workspace.id,
          workspaceRootUri: rootUri,
        },
        identity: toIdentity(contained, after),
      }
    } catch {
      return { status: "incomplete", reason: "source-unavailable" }
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  async validateResultItems(
    items: readonly SemanticCallHierarchyItem[],
    rootUri: string,
  ): Promise<SemanticCallHierarchyFailureReason | undefined> {
    const fingerprints = new Map<string, string>()
    for (const item of items) {
      if (
        typeof item?.uri !== "string"
        || typeof item.sourceFingerprint !== "string"
        || !/^[0-9a-f]{64}$/.test(item.sourceFingerprint)
      ) return "source-unavailable"
      const previous = fingerprints.get(item.uri)
      if (previous !== undefined && previous !== item.sourceFingerprint) {
        return "source-unavailable"
      }
      fingerprints.set(item.uri, item.sourceFingerprint)
    }

    const identities: ResultIdentity[] = []
    let sourceBytes = 0
    for (const [documentUri, fingerprint] of fingerprints) {
      const resolution = await this.resolve(
        documentUri,
        rootUri,
        MAX_RESULT_SOURCE_BYTES - sourceBytes,
      )
      if (resolution.status === "incomplete") return resolution.reason
      const text = resolution.source.kind === "open"
        ? resolution.source.document.text
        : resolution.source.text
      sourceBytes += Buffer.byteLength(text)
      if (sourceBytes > MAX_RESULT_SOURCE_BYTES) return "result-limit-exceeded"
      if (sourceFingerprint(text) !== fingerprint) return "source-unavailable"
      identities.push(resolution.source.kind === "open"
        ? {
            kind: "open",
            identity: resolution.identity as OpenIdentity,
            rootUri: resolution.source.workspaceRootUri,
          }
        : {
            kind: "disk",
            identity: resolution.identity as FileIdentity,
            uri: resolution.source.uri,
            rootUri: resolution.source.workspaceRootUri,
          })
    }
    for (const identity of identities) {
      if (!await this.isResultIdentityCurrent(identity)) return "source-unavailable"
    }
    return undefined
  }

  async isCurrent(resolution: Extract<CallHierarchySourceResolution, { status: "complete" }>): Promise<boolean> {
    if (resolution.source.kind === "open") {
      const identity = resolution.identity as OpenIdentity
      return this.isResultIdentityCurrent({
        kind: "open",
        identity,
        rootUri: resolution.source.workspaceRootUri,
      })
    }
    if (this.dependencies.documents.get(resolution.source.uri)) return false
    const identity = resolution.identity as FileIdentity
    try {
      const rootRealPath = await fs.realpath(fileURLToPath(resolution.source.workspaceRootUri))
      const sourcePath = fileURLToPath(resolution.source.uri)
      const sourceRealPath = await fs.realpath(sourcePath)
      const stat = await fs.stat(sourcePath)
      return stat.isFile()
        && rootRealPath === identity.rootRealPath
        && sourceRealPath === identity.sourceRealPath
        && isInside(rootRealPath, sourceRealPath)
        && await this.physicalRootUriFor(sourceRealPath) === resolution.source.workspaceRootUri
        && sameIdentity(identity, stat)
    } catch {
      return false
    }
  }

  private async isResultIdentityCurrent(result: ResultIdentity): Promise<boolean> {
    if (result.kind === "disk") {
      if (this.dependencies.documents.get(result.uri)) return false
      try {
        const rootRealPath = await fs.realpath(fileURLToPath(result.rootUri))
        const sourcePath = fileURLToPath(result.uri)
        const sourceRealPath = await fs.realpath(sourcePath)
        const stat = await fs.stat(sourcePath)
        return stat.isFile()
          && rootRealPath === result.identity.rootRealPath
          && sourceRealPath === result.identity.sourceRealPath
          && isInside(rootRealPath, sourceRealPath)
          && await this.physicalRootUriFor(sourceRealPath) === result.rootUri
          && sameIdentity(result.identity, stat)
      } catch {
        return false
      }
    }
    const current = this.dependencies.documents.get(result.identity.uri)
    if (
      current?.version !== result.identity.version
      || sourceFingerprint(current.getText()) !== result.identity.sourceFingerprint
    ) return false
    const contained = await realPathContained(
      result.rootUri,
      fileURLToPath(result.identity.uri),
      true,
    )
    return contained.status === "complete"
      && contained.rootRealPath === result.identity.rootRealPath
      && contained.sourceRealPath === result.identity.sourceRealPath
      && await this.physicalRootUriFor(contained.sourceRealPath) === result.rootUri
  }

  private async physicalRootUriFor(sourceRealPath: string): Promise<string | undefined> {
    const candidates: Array<{ rootUri: string; rootRealPath: string }> = []
    for (const { rootUri } of this.dependencies.workspaceRoots()) {
      if (!isCanonicalCallHierarchyFileUri(rootUri)) continue
      try {
        const rootRealPath = await fs.realpath(fileURLToPath(rootUri))
        if (isInside(rootRealPath, sourceRealPath)) candidates.push({ rootUri, rootRealPath })
      } catch {
        // An unavailable configured root cannot own a source.
      }
    }
    candidates.sort((left, right) => (
      right.rootRealPath.length - left.rootRealPath.length
      || compareOrdinal(left.rootUri, right.rootUri)
    ))
    const owner = candidates[0]
    if (!owner) return undefined
    if (candidates.some((candidate) => (
      candidate.rootUri !== owner.rootUri
      && candidate.rootRealPath === owner.rootRealPath
    ))) return undefined
    return owner.rootUri
  }
}

function sourceFingerprint(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex")
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

async function realPathContained(
  rootUri: string,
  sourcePath: string,
  allowMissingSource: boolean,
): Promise<
  | { status: "complete"; rootRealPath: string; sourceRealPath: string }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }
> {
  try {
    const rootRealPath = await fs.realpath(fileURLToPath(rootUri))
    const sourceRealPath = allowMissingSource
      ? await prospectiveRealPath(sourcePath)
      : await fs.realpath(sourcePath)
    return isInside(rootRealPath, sourceRealPath)
      ? { status: "complete", rootRealPath, sourceRealPath }
      : { status: "incomplete", reason: "source-outside-workspace" }
  } catch {
    return { status: "incomplete", reason: "source-unavailable" }
  }
}

async function prospectiveRealPath(filePath: string): Promise<string> {
  let cursor = filePath
  const suffix: string[] = []
  while (true) {
    try {
      return path.join(await fs.realpath(cursor), ...suffix)
    } catch (realPathError) {
      try {
        await fs.lstat(cursor)
      } catch (statError) {
        if (!isMissingPathError(statError)) throw realPathError
        const parent = path.dirname(cursor)
        if (parent === cursor) throw realPathError
        suffix.unshift(path.basename(cursor))
        cursor = parent
        continue
      }
      // Existing entries, including dangling symlinks, must resolve exactly.
      // Only a genuinely absent path may inherit its nearest ancestor's realpath.
      throw realPathError
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === "ENOENT"
}

function isSourcePath(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase()
  return extension === ".ets" || extension === ".ts"
}

function isInside(rootPath: string, filePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
  return relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

function isBoundedSize(size: number): boolean {
  return Number.isSafeInteger(size) && size >= 0 && size <= MAX_DISK_SNAPSHOT_BYTES
}

async function readBounded(
  handle: Awaited<ReturnType<typeof fs.open>>,
  declaredSize: number,
): Promise<Buffer | undefined> {
  const buffer = Buffer.allocUnsafe(Math.min(declaredSize + 1, MAX_DISK_SNAPSHOT_BYTES + 1))
  let offset = 0
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      null,
    )
    if (bytesRead === 0) return buffer.subarray(0, offset)
    offset += bytesRead
  }
  return undefined
}

function sameStat(left: Stats, right: Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
}

function toIdentity(
  paths: { rootRealPath: string; sourceRealPath: string },
  stat: Stats,
): FileIdentity {
  return {
    ...paths,
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  }
}

function sameIdentity(identity: FileIdentity, stat: Stats): boolean {
  return identity.dev === stat.dev
    && identity.ino === stat.ino
    && identity.size === stat.size
    && identity.mtimeMs === stat.mtimeMs
    && identity.ctimeMs === stat.ctimeMs
}
