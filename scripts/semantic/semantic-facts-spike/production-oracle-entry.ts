import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type ts from "typescript"
import { LocalPackageResolver } from "../../../src/core/sdk/local-package-resolver.js"
import type { ProjectSdkSelection } from "../../../src/core/sdk/project-sdk.js"
import { TypeScriptLanguageServiceEngine } from "../../../src/core/types/typescript-language-service.js"
import { discoverSdkAmbientDeclarations } from "../../../src/core/types/typescript-sdk-ambient.js"
import { SemanticDocumentStore } from "../../../src/core/workspace/document-store.js"
import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../../../src/core/protocol.js"
import { admittedPackageSources, pinnedPackageFile } from "./package-source-scope.js"

interface DiskInput {
  readonly kind: "disk-workspace"
  readonly root: string
  readonly sdkRoot: string
  readonly sdkDeclarationDigest: string
  readonly sdkCompilerOptionsDigest: string
  readonly projectConfigurationDigest: string
  readonly membershipSeedFile?: string
  readonly pinnedPackageSourceSha256?: Readonly<Record<string, string>>
  readonly files: Record<string, string>
  readonly inputSha256: string
}

interface HookCapture {
  host?: ts.LanguageServiceHost
  service?: ts.LanguageService
  calls: number
}

interface OriginHookCompiler {
  readonly version: string
  readonly FindAllReferences?: {
    readonly Core?: {
      readonly bulkConstructorOriginGroups?: (
        program: ts.Program, sourceFiles: readonly ts.SourceFile[], token: ts.CancellationToken,
        selectionSourceFiles?: readonly ts.SourceFile[],
      ) => unknown
    }
  }
}

interface Query {
  readonly id: string
  readonly file: string
  readonly line: number
  readonly character: number
  readonly includeDeclaration: boolean
}

interface Location {
  file: string
  start: { line: number; character: number }
  end: { line: number; character: number }
}

interface MembershipInput {
  readonly workspaceRoot: string
  readonly sdkRoot: string
  readonly queryFile: string
}

/** Read the same ProjectGraph-backed membership used by the production host. */
export function discoverDiskMembership({ workspaceRoot, sdkRoot, queryFile }: MembershipInput) {
  if (!path.isAbsolute(workspaceRoot) || !path.isAbsolute(sdkRoot)
    || !/\.(?:ets|ts)$/u.test(queryFile)) {
    throw new Error("production membership discovery requires workspace, SDK and source paths")
  }
  const root = path.resolve(workspaceRoot)
  const queryPath = path.resolve(root, queryFile)
  relativeFile(root, queryPath)
  const physicalRoot = fs.realpathSync(root)
  const physicalQuery = fs.realpathSync(queryPath)
  const physicalRelative = path.relative(physicalRoot, physicalQuery)
  if (!physicalRelative || physicalRelative === ".." || physicalRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(physicalRelative) || !fs.statSync(physicalQuery).isFile()) {
    throw new Error("production membership query source escapes workspace")
  }
  const sdkAmbient = discoverSdkAmbientDeclarations(sdkRoot, "full")
  if (!sdkAmbient.length) throw new Error("production membership SDK has no full ambient declarations")
  const packageResolver = new LocalPackageResolver()
  const documents = new SemanticDocumentStore({ packageResolver })
  let sdkSelection: ProjectSdkSelection | undefined
  let engine: TypeScriptLanguageServiceEngine | undefined
  try {
    const position: SemanticDocumentPosition = {
      path: queryPath, workspaceRoot: root, line: 1, column: 1,
    }
    const workspace = documents.prepare(position, true)
    const membership = workspace.projectMembership
    if (membership?.status !== "complete") {
      throw new Error(`production membership incomplete: ${membership?.reason ?? "missing"}`)
    }
    const files = membership.paths.map(file => relativeFile(root, file)).sort(ordinal)
    if (!files.includes(relativeFile(root, queryPath))) {
      throw new Error("production membership does not include query source")
    }
    engine = new TypeScriptLanguageServiceEngine(root, {
      packageResolver, projectFileAccess: documents,
      sdkConfiguration: { path: sdkRoot }, sdkAmbientProfile: "full",
      onSdkSelected: (_root, selection) => { sdkSelection = selection },
    })
    if (!sdkSelection?.ready || !sdkSelection.path
      || fs.realpathSync(sdkSelection.path) !== fs.realpathSync(sdkRoot)
      || sdkSelection.identity?.status !== "identified") {
      throw new Error("production membership selected SDK is not ready or identified")
    }
    engine.prepare(workspace)
    return {
      files, workspaceRoot: root, sdkRoot, queryFile: relativeFile(root, queryPath),
      sdkIdentity: sdkSelection.identity, sdkAmbientDeclarationCount: sdkAmbient.length,
      projectMembershipCount: files.length, membershipSha256: digest(JSON.stringify(files)),
      hostParity: "PRODUCTION_HOST", productionApproved: false,
    }
  } finally {
    engine?.dispose()
    documents.dispose()
  }
}

export function runProductionDiskOracle(input: DiskInput, queries: readonly Query[]) {
  if (input.kind !== "disk-workspace" || !path.isAbsolute(input.root) || !path.isAbsolute(input.sdkRoot)) {
    throw new Error("production oracle requires a pinned disk workspace and SDK")
  }
  const started = process.hrtime.bigint()
  const cpu = process.cpuUsage()
  const expected = Object.keys(input.files).sort(ordinal)
  if (!expected.length || !queries.length) throw new Error("production oracle requires sources and queries")
  assertSourcePin(input, expected)
  const root = path.resolve(input.root)
  const realSdk = fs.realpathSync(input.sdkRoot)
  const sdkAmbient = discoverSdkAmbientDeclarations(input.sdkRoot, "full")
  if (!sdkAmbient.length) throw new Error("production oracle SDK has no full ambient declarations")
  const packageResolver = new LocalPackageResolver()
  const documents = new SemanticDocumentStore({ packageResolver })
  let sdkSelection: ProjectSdkSelection | undefined
  let engine: TypeScriptLanguageServiceEngine | undefined
  try {
    const answers = []
    let programStats: ReturnType<TypeScriptLanguageServiceEngine["programFileStats"]> | undefined
    let membershipCount = 0
    for (const query of queries) {
      if (!Object.hasOwn(input.files, query.file)) {
        throw new Error(`production oracle query source is not pinned: ${query.file}`)
      }
      const absolute = path.resolve(root, query.file)
      assertQueryPosition(input.files[query.file], query)
      const position: SemanticDocumentPosition = {
        path: absolute, workspaceRoot: root, line: query.line + 1, column: query.character + 1,
      }
      const workspace = documents.prepare(position, true)
      const membership = workspace.projectMembership
      if (membership?.status !== "complete") {
        throw new Error(`production oracle membership incomplete: ${membership?.reason ?? "missing"}`)
      }
      const actual = membership.paths.map(file => relativeFile(root, file)).sort(ordinal)
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`production oracle membership mismatch: actualSha256=${digest(JSON.stringify(actual))} actualFiles=${JSON.stringify(actual)} expectedFiles=${JSON.stringify(expected)}`)
      }
      membershipCount = actual.length
      if (!engine) {
        engine = new TypeScriptLanguageServiceEngine(root, {
          packageResolver, projectFileAccess: documents,
          sdkConfiguration: { path: input.sdkRoot }, sdkAmbientProfile: "full",
          onSdkSelected: (_root, selection) => { sdkSelection = selection },
        })
        if (!sdkSelection?.ready || !sdkSelection.path
          || fs.realpathSync(sdkSelection.path) !== realSdk) {
          throw new Error("production oracle selected SDK does not match pinned SDK")
        }
      }
      engine.prepare(workspace)
      const result = engine.references(position, query.includeDeclaration)
      if (result.status !== "complete") {
        throw new Error(`production oracle query ${query.id} incomplete: ${result.reason}`)
      }
      const program = oracleProgram(engine)
      const packageSources = admittedPackageSources(program, root,
        input.pinnedPackageSourceSha256 ?? {})
      const locations = normalizeLocations(result.references.map(reference => (
        location(root, expected, packageSources, input.pinnedPackageSourceSha256 ?? {}, reference)
      )))
      answers.push({ id: query.id, status: "COMPLETE", locations })
      programStats = { ...engine.programFileStats(),
        ...programFingerprints(program) }
      assertSourcePin(input, expected)
    }
    if (!sdkSelection?.identity || sdkSelection.identity.status !== "identified") {
      throw new Error("production oracle selected SDK identity is unavailable")
    }
    return {
      answers, inputSha256: input.inputSha256, inputMode: "disk-workspace",
      hostParity: "PRODUCTION_HOST", productionApproved: false,
      workspaceRoot: root, sdkRoot: input.sdkRoot,
      sdkDeclarationDigest: input.sdkDeclarationDigest,
      sdkCompilerOptionsDigest: input.sdkCompilerOptionsDigest,
      projectConfigurationDigest: input.projectConfigurationDigest, sdkUsedByHost: true,
      sdkIdentity: sdkSelection.identity, sdkAmbientDeclarationCount: sdkAmbient.length,
      projectMembershipCount: membershipCount,
      queriesSha256: digest(JSON.stringify(queries)),
      metrics: { pid: process.pid, requestedQueries: queries.length,
        ...programStats, elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
        cpuMicroseconds: process.cpuUsage(cpu), endRssBytes: process.memoryUsage().rss,
        processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024 },
    }
  } finally {
    engine?.dispose()
    documents.dispose()
  }
}

/** Experimental hook only: run on the exact ProjectGraph/SDK host used by the stock oracle. */
export function runProductionDiskHook(
  input: DiskInput, compiler: OriginHookCompiler, capture: HookCapture,
) {
  if (input.kind !== "disk-workspace" || !path.isAbsolute(input.root)
    || !path.isAbsolute(input.sdkRoot) || !input.membershipSeedFile
    || !Object.hasOwn(input.files, input.membershipSeedFile)) {
    throw new Error("production extraction requires a pinned membership seed and disk workspace")
  }
  const hook = compiler.FindAllReferences?.Core?.bulkConstructorOriginGroups
  if (typeof hook !== "function") throw new Error("production extraction compiler hook unavailable")
  const started = process.hrtime.bigint()
  const cpu = process.cpuUsage()
  const expected = Object.keys(input.files).sort(ordinal)
  assertSourcePin(input, expected)
  const root = path.resolve(input.root)
  const realSdk = fs.realpathSync(input.sdkRoot)
  const sdkAmbient = discoverSdkAmbientDeclarations(input.sdkRoot, "full")
  if (!sdkAmbient.length) throw new Error("production extraction SDK has no full ambient declarations")
  const packageResolver = new LocalPackageResolver()
  const documents = new SemanticDocumentStore({ packageResolver })
  let sdkSelection: ProjectSdkSelection | undefined
  let engine: TypeScriptLanguageServiceEngine | undefined
  try {
    const seed: SemanticDocumentPosition = {
      path: path.resolve(root, input.membershipSeedFile), workspaceRoot: root,
      line: 1, column: 1,
    }
    const workspace = documents.prepare(seed, true)
    const membership = workspace.projectMembership
    if (membership?.status !== "complete") {
      throw new Error(`production extraction membership incomplete: ${membership?.reason ?? "missing"}`)
    }
    const actual = membership.paths.map(file => relativeFile(root, file)).sort(ordinal)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`production extraction membership mismatch: actualSha256=${digest(JSON.stringify(actual))}`)
    }
    engine = new TypeScriptLanguageServiceEngine(root, {
      packageResolver, projectFileAccess: documents,
      sdkConfiguration: { path: input.sdkRoot }, sdkAmbientProfile: "full",
      onSdkSelected: (_root, selection) => { sdkSelection = selection },
    })
    if (!sdkSelection?.ready || !sdkSelection.path
      || fs.realpathSync(sdkSelection.path) !== realSdk
      || sdkSelection.identity?.status !== "identified") {
      throw new Error("production extraction selected SDK does not match pinned SDK")
    }
    engine.prepare(workspace)
    if (capture.calls !== 1 || !capture.service || !capture.host) {
      throw new Error("production extraction did not capture exactly one actual language service")
    }
    const program = capture.service.getProgram()
    if (!program) throw new Error("production extraction language service has no Program")
    const hostDefaultLibFilePath = capture.host.getDefaultLibFileName(program.getCompilerOptions())
    if (!fs.existsSync(hostDefaultLibFilePath) || !fs.statSync(hostDefaultLibFilePath).isFile()) {
      throw new Error("production extraction host default library is unavailable")
    }
    const hostRoots = new Set(capture.host.getScriptFileNames().map(file => path.resolve(file)))
    if (expected.some(file => !hostRoots.has(path.resolve(root, file)))) {
      throw new Error("production extraction host omitted pinned project roots")
    }
    const projectSources = expected.map(file => {
      const source = program.getSourceFile(path.resolve(root, file))
      if (!source || source.text !== input.files[file]) {
        throw new Error(`production extraction Program source mismatch: ${file}`)
      }
      return { file, source, text: input.files[file] }
    })
    const packageSources = admittedPackageSources(program, root,
      input.pinnedPackageSourceSha256 ?? {})
    const sourceEntries = [...projectSources, ...[...packageSources].filter(([file]) =>
      !Object.hasOwn(input.files, file)).map(([file, source]) => (
      { file, source, text: source.text }))]
    const sources = sourceEntries.map(({ source }) => source)
    const files = Object.fromEntries(sourceEntries.map(({ file, source, text }) => {
      const lineStarts = source.getLineStarts()
      const lineEnds = lineStarts.map((start, line) => {
        let end = lineStarts[line + 1] ?? text.length
        while (end > start && (text[end - 1] === "\r" || text[end - 1] === "\n")) end -= 1
        return end
      })
      return [file, { contentSha256: digest(text), length: text.length, lineStarts, lineEnds }]
    }))
    const result = hook(program, sources, { throwIfCancellationRequested() {} },
      projectSources.map(({ source }) => source))
    if (!result) throw new Error("production extraction hook returned no result")
    const serializableResult = JSON.parse(JSON.stringify(result)) as unknown
    assertSourcePin(input, expected)
    return {
      result: serializableResult, files, inputSha256: input.inputSha256,
      packageSourceFiles: [...packageSources.keys()].sort(ordinal),
      inputMode: "disk-workspace", hostParity: "PRODUCTION_HOST", productionApproved: false,
      workspaceRoot: root, sdkRoot: input.sdkRoot,
      sdkDeclarationDigest: input.sdkDeclarationDigest,
      sdkCompilerOptionsDigest: input.sdkCompilerOptionsDigest,
      projectConfigurationDigest: input.projectConfigurationDigest,
      sdkUsedByHost: true, sdkIdentity: sdkSelection.identity,
      sdkAmbientDeclarationCount: sdkAmbient.length, projectMembershipCount: actual.length,
      compilerRuntimeVersion: compiler.version,
      hostDefaultLibFilePath,
      metrics: { pid: process.pid, requestedQueries: 0, bulkHookCalls: 1,
        languageServiceContexts: capture.calls, ...engine.programFileStats(),
        ...programFingerprints(program),
        elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
        cpuMicroseconds: process.cpuUsage(cpu), endRssBytes: process.memoryUsage().rss,
        processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024 },
    }
  } finally {
    engine?.dispose()
    documents.dispose()
  }
}

function oracleProgram(engine: TypeScriptLanguageServiceEngine): ts.Program {
  // Isolated experiment only: observe the already-created LanguageService Program.
  const service = (engine as unknown as { service: ts.LanguageService }).service
  const program = service.getProgram()
  if (!program) throw new Error("production oracle language service has no Program")
  return program
}

function programFingerprints(program: ts.Program) {
  return {
    programRootsSha256: digest(JSON.stringify(program.getRootFileNames().map(file => path.resolve(file)).sort(ordinal))),
    compilerOptionsSha256: digest(JSON.stringify(program.getCompilerOptions())),
  }
}

function assertSourcePin(input: DiskInput, expected: readonly string[]): void {
  const root = fs.realpathSync(input.root)
  const files: Record<string, string> = {}
  for (const file of expected) {
    const absolute = path.resolve(input.root, file)
    const physical = fs.realpathSync(absolute)
    const relative = path.relative(root, physical)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`production oracle source escapes workspace: ${file}`)
    }
    files[file] = fs.readFileSync(absolute, "utf8")
  }
  const identity = digest(JSON.stringify(expected.map(file => [file, digest(files[file])])))
  if (identity !== input.inputSha256 || expected.some(file => files[file] !== input.files[file])) {
    throw new Error("production oracle listed-source digest changed during query")
  }
}

function assertQueryPosition(source: string, query: Query): void {
  const lines = source.split(/\r\n|\r|\n/u)
  if (!Number.isSafeInteger(query.line) || !Number.isSafeInteger(query.character)
    || query.line < 0 || query.character < 0 || query.line >= lines.length
    || query.character >= lines[query.line].length) {
    throw new Error(`production oracle query ${query.id} is outside its source line`)
  }
}

function location(root: string, expected: readonly string[], packages: ReadonlyMap<string, ts.SourceFile>,
  pinned: Readonly<Record<string, string>>, reference: SemanticDefinitionCandidate): Location {
  const projectFile = relativeFile(root, reference.path)
  const file = expected.includes(projectFile) ? projectFile
    : pinnedPackageFile(root, reference.path, pinned)
  if (!file || (!expected.includes(file) && !packages.has(file))) {
    throw new Error(`production oracle reference outside pinned semantic sources: ${projectFile}`)
  }
  const range = reference.range
  for (const value of [range.startLine, range.startColumn, range.endLine, range.endColumn]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("production oracle returned invalid location")
  }
  if (range.endLine < range.startLine
    || (range.endLine === range.startLine && range.endColumn <= range.startColumn)) {
    throw new Error("production oracle returned empty or reversed location")
  }
  return { file,
    start: { line: range.startLine - 1, character: range.startColumn - 1 },
    end: { line: range.endLine - 1, character: range.endColumn - 1 } }
}

function relativeFile(root: string, absolute: string): string {
  const relative = path.relative(root, path.resolve(absolute))
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`production oracle path outside workspace: ${absolute}`)
  }
  return relative.split(path.sep).join("/")
}

function normalizeLocations(locations: Location[]): Location[] {
  return [...new Map(locations.map(item => [JSON.stringify([
    item.file, item.start.line, item.start.character, item.end.line, item.end.character,
  ]), item])).values()].sort((a, b) => ordinal(a.file, b.file)
    || a.start.line - b.start.line || a.start.character - b.start.character
    || a.end.line - b.end.line || a.end.character - b.end.character)
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
