import path from "node:path"
import ts from "typescript"
import type { ProjectSdkSelection } from "../../../core/sdk/project-sdk.js"
import { sdkExportIndex } from "./sdk-export-index.js"
import { SemanticInputUnavailableError } from "../../../core/types/typescript-query-inputs.js"
import { initialPreparationActive } from "../../coordinator/initial-preparation.js"

const sdkEntries = new WeakMap<ts.CompletionInfo, readonly ts.CompletionEntry[]>()
const fences = new WeakMap<ts.LanguageService, { begin(): void; end(): void; assert(): void }>()
export const sdkExportCompletionEntries = (info: ts.CompletionInfo): readonly ts.CompletionEntry[] => sdkEntries.get(info) ?? []
export function withSdkExportQuery<T>(service: ts.LanguageService, run: () => T): T {
  const fence = fences.get(service)
  fence?.begin()
  try { return run() } finally { fence?.end() }
}
export function assertSdkExportInputs(service: ts.LanguageService): void { fences.get(service)?.assert() }

/** Extend the pinned compiler's native auto-import provider; all items and edits remain compiler-issued. */
export function sdkExportLanguageService(host: ts.LanguageServiceHost, sdk: ProjectSdkSelection,
  registry: ts.DocumentRegistry, create: (host: ts.LanguageServiceHost) => ts.LanguageService): ts.LanguageService {
  if (!sdk.ready || sdk.identity?.status !== "identified") return create(host)
  const enriched = { ...host }
  const index = sdkExportIndex(sdk, enriched, registry)
  let disabled = false
  let used = false
  let depth = 0
  Object.assign(enriched, { getPackageJsonAutoImportProvider: () => {
    const program = disabled ? undefined : index.getProgram()
    if (program) used = true
    return program
  } })
  const service = create(enriched)
  fences.set(service, { begin() { if (depth++ === 0) used = false }, end() { depth-- },
    assert() { if (used && !index.current()) throw new SemanticInputUnavailableError() } })
  const completions = service.getCompletionsAtPosition.bind(service)
  const details = service.getCompletionEntryDetails.bind(service)
  const dispose = service.dispose.bind(service)
  const sdkEntry = (entry: ts.CompletionEntry) => entry.data?.isPackageJsonImport === true
    && typeof entry.data.fileName === "string" && index.owns(entry.data.fileName)
  const kitEntry = (entry: ts.CompletionEntry) => sdkEntry(entry) && path.basename(entry.data!.fileName!).startsWith("@kit.")
  service.getCompletionsAtPosition = (file, offset, preferences, format) => {
    const result = completions(file, offset, preferences, format)
    if (!result || !preferences?.includeCompletionsForModuleExports) return result
    if (disabled || !index.usable()) { result.isIncomplete = true; return result }
    const kit = completions(file, offset, { ...preferences, ...index.kitPreferences() }, format)
    if (!index.current()) {
      disabled = true
      index.revoke()
      used = false
      const fallback = completions(file, offset, preferences, format)
      if (fallback) fallback.isIncomplete = true
      return fallback
    }
    const merged = new Map<string, ts.CompletionEntry>()
    // Public Kit routes precede equivalent direct API exports, without dropping the latter.
    for (const entry of [...kit?.entries.filter(kitEntry) ?? [], ...result.entries.filter(sdkEntry)]) {
      merged.set(`${entry.name}\0${entry.source}`, entry)
    }
    sdkEntries.set(result, [...merged.values()])
    if (index.incomplete()) result.isIncomplete = true
    return result
  }
  service.getCompletionEntryDetails = (file, offset, name, format, source, preferences, data) => {
    if (data?.isPackageJsonImport && (disabled || !index.getProgram())) return undefined
    const kit = data?.isPackageJsonImport && typeof data.fileName === "string" && path.basename(data.fileName).startsWith("@kit.")
    const result = details(file, offset, name, format, source, kit ? { ...preferences, ...index.kitPreferences() } : preferences, data)
    if (!index.current()) { disabled = true; index.revoke(); used = false; return undefined }
    return result
  }
  service.dispose = () => { try { dispose() } finally { fences.delete(service); index.release() } }
  if (initialPreparationActive()) {
    try {
      index.getProgram()
      if (!index.current()) { disabled = true; index.revoke() }
    } catch (error) {
      // No coordinator entry owns this service until construction returns.
      try { service.dispose() }
      catch (cleanup) { throw new AggregateError([error, cleanup], "Failed to clean up SDK service construction") }
      throw error
    }
  }
  return service
}
