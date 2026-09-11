import fs from "node:fs"
import path from "node:path"
import { parentPort, workerData } from "node:worker_threads"

import type { SemanticDocumentPosition } from "../../core/protocol.js"
import { LocalPackageResolver } from "../../core/sdk/local-package-resolver.js"
import { TypeScriptLanguageServiceEngine } from "../../core/types/typescript-language-service.js"
import {
  MAX_DISK_SNAPSHOT_BYTES,
  type ProjectFileAccessPort,
  type SemanticWorkspaceView,
} from "../../core/workspace/document-store.js"

interface ReferenceVerifierWorkerData {
  readonly operation: "references" | "definition"
  readonly workspace: SemanticWorkspaceView
  readonly position: SemanticDocumentPosition
  readonly includeDeclaration?: boolean
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
}

const port = parentPort
if (!port) throw new Error("Reference verifier requires a parent port")
const data = workerData as ReferenceVerifierWorkerData
const packageResolver = new LocalPackageResolver()
packageResolver.configureProject(data.projectConfiguration)
const projectFileAccess = data.workspace.projectFileIdentities
  ? snapshotProjectFileAccess(data.workspace)
  : undefined
const engine = new TypeScriptLanguageServiceEngine(data.workspace.rootPath, {
  packageResolver,
  projectFileAccess,
  sdkConfiguration: data.sdkConfiguration,
})

try {
  engine.prepare(data.workspace)
  if (data.operation === "definition") {
    port.postMessage({
      ok: true,
      definitions: engine.define(data.position),
      stats: engine.programFileStats(),
      memory: process.memoryUsage(),
    })
  } else {
    const result = engine.references(data.position, data.includeDeclaration === true)
    port.postMessage({
      ok: true,
      result,
      stats: engine.programFileStats(),
      memory: process.memoryUsage(),
    })
  }
} catch (error) {
  port.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  })
} finally {
  engine.dispose()
  port.close()
}

function snapshotProjectFileAccess(workspace: SemanticWorkspaceView): ProjectFileAccessPort {
  const membership = workspace.projectMembership
  if (!membership || membership.status !== "complete") {
    throw new Error("Reference verifier requires complete project membership")
  }
  const rootId = workspace.canonicalRootId
  const revision = membership.revision
  const identities = new Map(workspace.projectFileIdentities)
  return {
    tokenFor(canonicalRootId, catalogRevision, filePath) {
      if (canonicalRootId !== rootId || catalogRevision !== revision) return undefined
      return identities.get(path.resolve(filePath))
    },
    read(canonicalRootId, catalogRevision, filePath, token) {
      const resolvedPath = path.resolve(filePath)
      if (
        canonicalRootId !== rootId
        || catalogRevision !== revision
        || identities.get(resolvedPath) !== token
      ) return null
      return readAdmittedSource(rootId, resolvedPath, token)
    },
  }
}

function readAdmittedSource(rootId: string, filePath: string, token: string): string | null {
  let descriptor: number | undefined
  try {
    if (!fs.lstatSync(filePath).isFile()) return null
    const physicalPath = fs.realpathSync.native(filePath)
    const relative = path.relative(rootId, physicalPath)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return null
    }
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0))
    const before = fs.fstatSync(descriptor)
    if (
      !before.isFile()
      || before.size > MAX_DISK_SNAPSHOT_BYTES
      || sourceStatIdentity(before) !== token
    ) return null
    const bytes = Buffer.allocUnsafe(before.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (count === 0) break
      offset += count
    }
    const after = fs.fstatSync(descriptor)
    if (offset !== before.size || sourceStatIdentity(after) !== token) return null
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes.subarray(0, offset))
  } catch {
    return null
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch { /* best effort */ }
    }
  }
}

function sourceStatIdentity(stat: fs.Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":")
}
