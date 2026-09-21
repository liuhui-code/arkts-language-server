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
import type { ReferenceSdkAmbientProfile } from "./reference-runtime.js"

interface ReferenceVerifierWorkerData {
  readonly operation: "references" | "definition"
  readonly workspace: SemanticWorkspaceView
  readonly position: SemanticDocumentPosition
  readonly includeDeclaration?: boolean
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
  readonly sdkAmbientProfile?: ReferenceSdkAmbientProfile
  readonly trace?: boolean
  readonly tolerateUnadmittedProjectDependencies?: boolean
}

const port = parentPort
if (!port) throw new Error("Reference verifier requires a parent port")
const data = workerData as ReferenceVerifierWorkerData
applyTestDelay()
const packageResolver = new LocalPackageResolver()
packageResolver.configureProject(data.projectConfiguration)
const projectAccess = data.workspace.projectFileIdentities
  ? snapshotProjectFileAccess(data.workspace)
  : undefined
const projectFileAccess = projectAccess?.port
const engine = new TypeScriptLanguageServiceEngine(data.workspace.rootPath, {
  packageResolver,
  projectFileAccess,
  sdkConfiguration: data.sdkConfiguration,
  sdkAmbientProfile: data.sdkAmbientProfile,
  tolerateUnadmittedProjectDependencies: data.tolerateUnadmittedProjectDependencies,
})

try {
  const prepareStarted = performance.now()
  engine.prepare(data.workspace)
  const prepareHostMs = performance.now() - prepareStarted
  const programStarted = performance.now()
  const compilerTimings = data.trace ? engine.measureCompilerReadiness() : undefined
  const prepared = {
    stats: engine.programFileStats(),
    memory: process.memoryUsage(),
  }
  const programReadyMs = performance.now() - programStarted
  if (data.operation === "definition") {
    port.postMessage({
      ok: true,
      definitions: engine.define(data.position),
      prepared,
      stats: engine.programFileStats(),
      memory: process.memoryUsage(),
    })
  } else {
    const queryStarted = performance.now()
    const result = engine.references(data.position, data.includeDeclaration === true)
    const queryMs = performance.now() - queryStarted
    port.postMessage({
      ok: true,
      result,
      timings: { prepareHostMs, programReadyMs, queryMs, ...compilerTimings },
      unavailableProjectPaths: projectAccess?.unavailablePaths,
      prepared,
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

function snapshotProjectFileAccess(workspace: SemanticWorkspaceView): {
  readonly port: ProjectFileAccessPort
  readonly unavailablePaths: readonly string[]
} {
  const membership = workspace.projectMembership
  if (!membership || membership.status !== "complete") {
    throw new Error("Reference verifier requires complete project membership")
  }
  const rootId = workspace.canonicalRootId
  const revision = membership.revision
  const identities = new Map(workspace.projectFileIdentities)
  const membershipPaths = new Set(membership.paths.map(filePath => path.resolve(filePath)))
  const unavailablePaths: string[] = []
  const unavailable = new Set<string>()
  const recordUnavailable = (filePath: string) => {
    const resolvedPath = path.resolve(filePath)
    if (identities.has(resolvedPath) || !membershipPaths.has(resolvedPath)
      || unavailable.has(resolvedPath) || unavailablePaths.length >= 16) return
    unavailable.add(resolvedPath)
    unavailablePaths.push(resolvedPath)
  }
  const access: ProjectFileAccessPort = {
    tokenFor(canonicalRootId, catalogRevision, filePath) {
      if (canonicalRootId !== rootId || catalogRevision !== revision) return undefined
      recordUnavailable(filePath)
      return identities.get(path.resolve(filePath))
    },
    read(canonicalRootId, catalogRevision, filePath, token) {
      const resolvedPath = path.resolve(filePath)
      if (canonicalRootId !== rootId || catalogRevision !== revision) return null
      if (identities.get(resolvedPath) !== token) {
        recordUnavailable(resolvedPath)
        return null
      }
      return readAdmittedSource(rootId, resolvedPath, token)
    },
  }
  return { port: access, unavailablePaths }
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

function applyTestDelay(): void {
  const delayMs = Number.parseInt(
    process.env.ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS ?? "0",
    10,
  )
  if (!Number.isSafeInteger(delayMs) || delayMs <= 0 || delayMs > 10_000) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
}
