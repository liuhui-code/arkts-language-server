import ts from "typescript"
import { withRequestInputValidation } from "../../project/request-input-validation.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

const MAX_RESOLUTION_CALLS = 32
const MAX_DIRECTORY_PRESENCE = 32
const MAX_DIRECTORY_CODE_UNITS = 32 * 1024
const MAX_RELATIVE_CANDIDATE_BYTES = 1024 * 1024

/** The official lookup cache belongs to one synchronous query, never to the LS lifetime. */
export class QueryModuleResolution {
  private active?: { cache: ts.ModuleResolutionCache; calls: number;
    directories: Map<string, boolean>; directoryCodeUnits: number;
    candidates: Map<string, string | undefined>; candidateBytes: number }

  constructor(private readonly rootPath: string, private readonly options: ts.CompilerOptions) {}

  query<Result>(run: () => Result): Result {
    return withRequestInputValidation(() => this.queryModules(run), () => { throw new SemanticInputUnavailableError() })
  }

  private queryModules<Result>(run: () => Result): Result {
    if (this.active || (process.env.ARKTS_QUERY_MODULE_RESOLUTION_REUSE ?? "1") !== "1") return run()
    const active = { calls: 0, directories: new Map<string, boolean>(), directoryCodeUnits: 0,
      candidates: new Map<string, string | undefined>(), candidateBytes: 0,
      cache: ts.createModuleResolutionCache(this.rootPath,
      file => ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase(), this.options) }
    this.active = active
    try { return run() }
    finally { this.active = undefined; active.cache.clear(); active.directories.clear(); active.candidates.clear() }
  }

  /** Reuse the first witnessed candidate only within this synchronous query.
   * Source ownership/boundaries are still checked separately for every importer. */
  relativeCandidate(base: string, find: () => string | undefined): string | undefined {
    const active = this.active
    if (active?.candidates.has(base)) return active.candidates.get(base)
    const candidate = find()
    const bytes = 128 + 2 * (base.length + (candidate?.length ?? 0))
    if (active && active.candidateBytes + bytes <= MAX_RELATIVE_CANDIDATE_BYTES) {
      active.candidates.set(base, candidate)
      active.candidateBytes += bytes
    }
    return candidate
  }

  resolve(name: string, containingFile: string, host: ts.ModuleResolutionHost): ts.ResolvedModule | undefined {
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
