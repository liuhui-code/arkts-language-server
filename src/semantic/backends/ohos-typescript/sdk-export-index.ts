import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { LoadedConfigurationWitness } from "../../../project/loaded-configuration-witness.js"
import type { ProjectSdkSelection } from "../../../core/sdk/project-sdk.js"
import { resolveHarmonySdkModule, isHarmonySdkModuleSpecifier } from "../../../core/sdk/module-resolver.js"
import { safeRead } from "../../../core/types/typescript-safe-source-read.js"
import { isWithinRoot } from "../../../core/types/typescript-source-boundary.js"
import { witnessedModuleResolutionHost } from "../../../core/types/typescript-resolution-witness.js"
import { isCompilerLibrary } from "./sdk-registry-cache.js"
import { harmonyCompilerResources } from "../../../core/sdk/compiler-resources.js"
import { sdkDeclarationInputCheck } from "./sdk-declaration-inputs.js"

/** SDK-only compiler export index. No project sources or additional LanguageService. */
export function sdkExportIndex(sdk: ProjectSdkSelection, host: ts.LanguageServiceHost, registry: ts.DocumentRegistry) {
  const inputs = new LoadedConfigurationWitness()
  const leases = new Map<string, { file: ts.SourceFile; kind: ts.ScriptKind; resolved: ts.Path }>()
  let program: ts.Program | undefined
  let coverageIncomplete = sdk.components?.some(component => component.issue) === true
  let unavailable = !sdk.ready || sdk.identity?.status !== "identified"
    || sdk.targetQualification !== undefined && sdk.targetQualification.status !== "compatible"
  const options = host.getCompilationSettings()
  const settingsKey = registry.getKeyForCompilationSettings(options)
  const checkpoint = () => {
    if (host.getCancellationToken?.().isCancellationRequested()) throw new ts.OperationCanceledException()
  }
  const owns = (file: string): boolean => (sdk.components ?? []).some(component => !component.issue
    && (isWithinRoot(component.root, file) || isWithinRoot(component.physicalRoot, file)))
  const admitted = (file: string, directory = false): boolean => {
    if (isCompilerLibrary(file)) return true
    if (!directory && !/\.d\.(?:ts|ets)$/.test(file)) return false
    if (!owns(file)) return false
    try {
      const physical = inputs.observePath(file, () => fs.realpathSync.native(file))
      return (sdk.components ?? []).some(component => !component.issue && isWithinRoot(component.physicalRoot, physical))
    } catch { return false }
  }
  const release = () => {
    program = undefined
    for (const { file, kind, resolved } of leases.values()) registry.releaseDocumentWithKey(resolved, settingsKey, kind, file.impliedNodeFormat)
    leases.clear()
  }
  const roots = (): string[] => {
    const modules = new Map<string, string>()
    const pending = (sdk.components ?? []).filter(c => !c.issue).flatMap(c => c.apiPaths)
    while (pending.length) {
      checkpoint()
      const directory = pending.pop()!
      if (!admitted(directory, true)) continue
      let entries: fs.Dirent[]
      try { entries = inputs.observeSourceNamespace(directory, () => fs.readdirSync(directory, { withFileTypes: true })) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error }
      for (const entry of entries) {
        checkpoint()
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) { pending.push(file); continue }
        const specifier = entry.name.replace(/\.d\.(?:ts|ets)$/, "")
        if (!/\.d\.(?:ts|ets)$/.test(entry.name) || !isHarmonySdkModuleSpecifier(specifier, sdk) || modules.has(specifier)) continue
        const resolved = resolveHarmonySdkModule(sdk, specifier, inputs)
        if (resolved && admitted(resolved)) modules.set(specifier, resolved)
      }
    }
    const resources = sdk.path ? harmonyCompilerResources(sdk.path) : undefined
    const ambient = new Set(resources ? [...resources.runtimeAmbientCandidates, ...resources.componentAmbientCandidates,
      ...resources.coreAmbientCandidates].map(file => path.resolve(file)) : [])
    return [...host.getScriptFileNames().filter(file => ambient.has(path.resolve(file))), ...modules.values()]
  }
  const getProgram = (): ts.Program | undefined => {
    if (unavailable) return undefined
    if (program) return program
    try {
      const compilerHost = ts.createCompilerHost(options)
      const lookup = witnessedModuleResolutionHost(inputs)
      compilerHost.readFile = file => admitted(file) ? inputs.observeSourceNamespace(file, () => safeRead(file) ?? undefined) : undefined
      compilerHost.fileExists = file => admitted(file) && lookup.fileExists(file)
      compilerHost.getSourceFile = file => {
        checkpoint()
        const text = compilerHost.readFile(file)
        if (text === undefined) return undefined
        const previous = leases.get(file)
        if (previous) return previous.file
        const kind = file.endsWith(".ets") ? ts.ScriptKind.ETS : ts.ScriptKind.TS
        const normalized = path.resolve(file).split(path.sep).join("/")
        const resolved = (host.useCaseSensitiveFileNames?.() ? normalized : normalized.toLowerCase()) as ts.Path
        const source = registry.acquireDocumentWithKey(file, resolved, host, settingsKey, ts.ScriptSnapshot.fromString(text), "0", kind)
        if (source.text !== text) {
          registry.releaseDocumentWithKey(resolved, settingsKey, kind, source.impliedNodeFormat)
          throw new Error("SDK index bytes changed")
        }
        leases.set(file, { file: source, kind, resolved })
        return source
      }
      compilerHost.resolveModuleNames = (names, importer) => names.map(name => {
        const sdkFile = resolveHarmonySdkModule(sdk, name, inputs)
        const resolved = sdkFile ? { resolvedFileName: sdkFile,
          extension: sdkFile.endsWith(".ets") ? ts.Extension.Dets : ts.Extension.Dts } : name.startsWith(".")
          ? ts.resolveModuleName(name, importer, options, { ...lookup, fileExists: compilerHost.fileExists,
            readFile: compilerHost.readFile }).resolvedModule : undefined
        return resolved && admitted(resolved.resolvedFileName) ? resolved : undefined
      })
      program = ts.createProgram(roots(), options, compilerHost)
      program.getTypeChecker()
      const declarationInputsComplete = sdkDeclarationInputCheck(program, checkpoint)
      coverageIncomplete ||= program.getOptionsDiagnostics().length > 0 || program.getSourceFiles().some(file => (
        (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length
        || !declarationInputsComplete(file)
      ))
      return program
    } catch (error) {
      release()
      if (error instanceof ts.OperationCanceledException) throw error
      unavailable = true
      return undefined
    }
  }
  return { getProgram, owns, release,
    usable: () => !unavailable,
    incomplete: () => unavailable || coverageIncomplete,
    current: () => !program || inputs.freshness(checkpoint, "capture")?.() === true,
    revoke: () => { unavailable = true; release() },
    kitPreferences: (): ts.UserPreferences => ({ autoImportFileExcludePatterns: getProgram()?.getSourceFiles()
      .filter(file => owns(file.fileName) && ts.isExternalModule(file) && !path.basename(file.fileName).startsWith("@kit."))
      .map(file => file.fileName) ?? [] }),
  }
}
