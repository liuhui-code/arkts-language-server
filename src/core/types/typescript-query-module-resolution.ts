import ts from "typescript"
import path from "node:path"
import { withRequestInputValidation } from "../../project/request-input-validation.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

const MAX_RESOLUTION_CALLS = 32
const MAX_DIRECTORY_PRESENCE = 32
const MAX_DIRECTORY_CODE_UNITS = 32 * 1024
const MAX_RELATIVE_CANDIDATE_BYTES = 1024 * 1024
type Candidate = string | ts.ResolvedModule | undefined
interface CandidateEntry { readonly value: Candidate; readonly bytes: number }

/** The official lookup cache belongs to one synchronous query, never to the LS lifetime. */
export class QueryModuleResolution {
  private active?: { cache: ts.ModuleResolutionCache; calls: number;
    directories: Map<string, boolean>; directoryCodeUnits: number;
    candidates: Map<string, CandidateEntry>; candidateBytes: number }

  constructor(private readonly rootPath: string, private readonly options: ts.CompilerOptions) {}

  query<Result>(run: () => Result): Result {
    return withRequestInputValidation(() => this.queryModules(run), () => { throw new SemanticInputUnavailableError() })
  }

  private queryModules<Result>(run: () => Result): Result {
    if (this.active || (process.env.ARKTS_QUERY_MODULE_RESOLUTION_REUSE ?? "1") !== "1") return run()
    const active = { calls: 0, directories: new Map<string, boolean>(), directoryCodeUnits: 0,
      candidates: new Map<string, CandidateEntry>(), candidateBytes: 0,
      cache: ts.createModuleResolutionCache(this.rootPath,
      file => ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase(), this.options) }
    this.active = active
    try { return run() }
    finally { this.active = undefined; active.cache.clear(); active.directories.clear(); active.candidates.clear() }
  }

  /** Reuse the first witnessed candidate only within this synchronous query.
   * Source ownership/boundaries are still checked separately for every importer. */
  relativeCandidate(base: string, find: () => string | undefined): string | undefined {
    return this.candidate(base, find)
  }

  /** SDK/configuration identity belongs to this engine. The first lookup retains
   * its actual positive/negative witnesses; the final uncached union rechecks them. */
  sdkCandidate(name: string, find: () => string | undefined): string | undefined {
    return this.candidate(`\0sdk:${name}`, find)
  }

  private candidate<Value extends Candidate>(base: string, find: () => Value): Value {
    const active = this.active
    if (!active) return find()
    const known = active?.candidates.get(base)
    if (active && known) {
      active.candidates.delete(base)
      active.candidates.set(base, known)
      return known.value as Value
    }
    const candidate = find()
    const bytes = candidateSize(base, candidate)
    if (active && bytes <= MAX_RELATIVE_CANDIDATE_BYTES) {
      // Capacity limits retained metadata, not which later modules may reuse
      // their actual evidence. Retire cold entries instead of disabling reuse.
      while (active.candidateBytes + bytes > MAX_RELATIVE_CANDIDATE_BYTES) {
        const oldest = active.candidates.keys().next().value
        if (oldest === undefined) break
        const previous = active.candidates.get(oldest)
        active.candidates.delete(oldest)
        active.candidateBytes -= previous!.bytes
      }
      active.candidates.set(base, { value: candidate, bytes })
      active.candidateBytes += bytes
    }
    return candidate
  }

  resolve(name: string, containingFile: string, host: ts.ModuleResolutionHost,
    witnessed = false): ts.ResolvedModule | undefined {
    if (!witnessed) return this.resolveUncached(name, containingFile, host)
    // The witnessed Host/options belong to this compiler owner. Retain the
    // exact native answer (including package/extension flags), not its path alone.
    return this.candidate(`\0fallback:${JSON.stringify([path.dirname(containingFile), name])}`,
      () => this.resolveUncached(name, containingFile, host))
  }

  private resolveUncached(name: string, containingFile: string, host: ts.ModuleResolutionHost): ts.ResolvedModule | undefined {
    const active = this.active
    let cache: ts.ModuleResolutionCache | undefined
    if (active) {
      active.calls++
      if (active.calls <= MAX_RESOLUTION_CALLS) cache = active.cache
      else if (active.calls === MAX_RESOLUTION_CALLS + 1) active.cache.clear()
    }
    // First misses still execute the actual witnessed host. Capacity overflow
    // performs ordinary resolution; the caller's full end fence is unchanged.
    const directoryExists = host.directoryExists
    const queryHost = active && directoryExists ? { ...host, directoryExists: (directory: string): boolean => {
      const known = active.directories.get(directory)
      if (known !== undefined) return known
      // This engine's witnessed host owns the first actual lookup and load guards.
      // Reuse only inside its synchronous query; the full end fence is unchanged.
      const present = directoryExists.call(host, directory)
      if (active.directories.size < MAX_DIRECTORY_PRESENCE
        && active.directoryCodeUnits + directory.length <= MAX_DIRECTORY_CODE_UNITS) {
        active.directories.set(directory, present)
        active.directoryCodeUnits += directory.length
      }
      return present
    } } : host
    return ts.resolveModuleName(name, containingFile, this.options, queryHost, cache).resolvedModule
  }
}

/** Account native result metadata without copying its strings or retaining the
 * failed-lookup arrays of ResolvedModuleWithFailedLookupLocations. Unknown
 * callable/symbol payloads simply use ordinary uncached resolution. */
function candidateSize(key: string, value: Candidate): number {
  let bytes = 192 + 2 * key.length
  if (typeof value === "string" || value === undefined) return bytes + 2 * (value?.length ?? 0)
  const pending: unknown[] = [value], seen = new Set<object>()
  while (pending.length && bytes <= MAX_RELATIVE_CANDIDATE_BYTES) {
    const current = pending.pop()
    if (typeof current === "string") bytes += 2 * current.length
    else if (current && typeof current === "object" && !seen.has(current)) {
      seen.add(current); bytes += 128
      for (const [name, item] of Object.entries(current)) { bytes += 16 + 2 * name.length; pending.push(item) }
    } else if (typeof current === "function" || typeof current === "symbol") return Number.POSITIVE_INFINITY
  }
  return bytes
}
