import fs from "node:fs"
import path from "node:path"
import { threadId } from "node:worker_threads"

import ts from "typescript"

import type { ProjectSdkSelection } from "../../../core/sdk/project-sdk.js"
import { OHOS_TYPESCRIPT_BACKEND_IDENTITY } from "./identity.js"

const registries = new Map<string, ts.DocumentRegistry>()
type RegistryKey = { readonly resolvedPath: ts.Path; readonly scriptKind: ts.ScriptKind }
type RefCountRegistry = ts.DocumentRegistry & {
  getLanguageServiceRefCounts?: (resolvedPath: ts.Path, scriptKind: ts.ScriptKind) =>
    readonly (readonly [string, number | undefined])[]
}
interface RegistryProbeSnapshot {
  readonly registry: RefCountRegistry
  readonly keys: readonly RegistryKey[]
  readonly serviceId: number
  readonly captureProgramMs: number
  readonly captureOrigin: "program"
}
let nextServiceId = 0
let nextSampleId = 0

export function officialDocumentRegistryFor(sdk: ProjectSdkSelection): ts.DocumentRegistry {
  const key = JSON.stringify([
    OHOS_TYPESCRIPT_BACKEND_IDENTITY.revision,
    sdk.path ? path.resolve(sdk.path) : null,
    sdk.identity?.status ?? "unavailable",
    sdk.identity?.apiVersion ?? null,
    sdk.identity?.componentVersion ?? null,
    "ets",
  ])
  let registry = registries.get(key)
  if (!registry) {
    registry = ts.createDocumentRegistry(ts.sys.useCaseSensitiveFileNames)
    registries.set(key, registry)
  }
  return registry
}

/** Recycle the LS at L2: this fork's cleanupSemanticCache drops Program ownership without releasing registry refs. */
export function recycleOfficialSemanticService(
  service: ts.LanguageService,
  host: ts.LanguageServiceHost,
  sdk: ProjectSdkSelection,
): ts.LanguageService {
  const replacement = ts.createLanguageService(host, officialDocumentRegistryFor(sdk))
  const file = registryProbeFile()
  const sampleId = file ? ++nextSampleId : 0
  const snapshot = file ? captureRegistryProbe(service, sdk) : undefined
  if (file && snapshot) writeRegistryProbe(file, "before-trim", sampleId, snapshot)
  try {
    service.dispose()
  } catch (error) {
    replacement.dispose()
    throw error
  } finally {
    if (file && snapshot) {
      writeRegistryProbe(file, "after-trim", sampleId, snapshot)
    }
  }
  return replacement
}

/** Benchmark-only observation of the current LS around disposal. */
export function disposeOfficialSemanticService(service: ts.LanguageService, sdk: ProjectSdkSelection): void {
  const file = registryProbeFile()
  if (!file) return service.dispose()
  const sampleId = ++nextSampleId
  const snapshot = captureRegistryProbe(service, sdk)
  if (snapshot) writeRegistryProbe(file, "before-dispose", sampleId, snapshot)
  try {
    service.dispose()
  } finally {
    if (snapshot) writeRegistryProbe(file, "after-dispose", sampleId, snapshot)
  }
}

function registryProbeFile(): string | undefined {
  const file = process.env.ARKTS_L01_REGISTRY_PROBE_FILE
  return process.env.ARKTS_BENCHMARK_CONTROL === "1" && file && path.isAbsolute(file)
    ? file : undefined
}

function captureRegistryProbe(
  service: ts.LanguageService,
  sdk: ProjectSdkSelection,
): RegistryProbeSnapshot | undefined {
  try {
    const started = performance.now()
    const files = service.getProgram()?.getSourceFiles() ?? []
    const keys: RegistryKey[] = []
    for (const file of files) {
      const internal = file as ts.SourceFile & { resolvedPath?: ts.Path; scriptKind?: ts.ScriptKind }
      if (internal.resolvedPath && internal.scriptKind !== undefined) {
        keys.push({ resolvedPath: internal.resolvedPath, scriptKind: internal.scriptKind })
      }
    }
    return { registry: officialDocumentRegistryFor(sdk) as RefCountRegistry, keys,
      serviceId: ++nextServiceId,
      captureProgramMs: performance.now() - started, captureOrigin: "program" }
  } catch {
    return undefined
  }
}

function writeRegistryProbe(
  file: string,
  phase: "before-trim" | "after-trim" | "before-dispose" | "after-dispose",
  sampleId: number,
  snapshot: RegistryProbeSnapshot,
): void {
  try {
    const refCounts = snapshot.registry.getLanguageServiceRefCounts
    let totalRefCount = 0
    let retainedSourceFiles = 0
    if (refCounts) {
      for (const key of snapshot.keys) {
        let countForFile = 0
        for (const [, count] of refCounts(key.resolvedPath, key.scriptKind)) {
          countForFile += count ?? 0
        }
        totalRefCount += countForFile
        if (countForFile > 0) retainedSourceFiles++
      }
    }
    fs.appendFileSync(file, `${JSON.stringify({ event: "l01.registry.refcount", phase,
      epochMs: Date.now(), pid: process.pid, threadId,
      sampleId, serviceId: snapshot.serviceId, captureOrigin: snapshot.captureOrigin,
      sampledSourceFiles: snapshot.keys.length, retainedSourceFiles,
      totalRefCount: refCounts ? totalRefCount : null,
      captureProgramMs: snapshot.captureProgramMs })}\n`)
  } catch { /* Diagnostic observation must not change semantic results or disposal. */ }
}
