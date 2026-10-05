import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { createSpikeProject } from "../ohos-typescript-spike/backend-host.mjs"
import { digest, inputIdentity, readSources } from "./input.mjs"

// This child is the only process that loads the experimental compiler artifact.
// It receives source files, never query positions or expected answers.
export function extractBulk(inputPath, artifactPath, hypothesis = "compiler-bulk-reference-groups-v3") {
  const require = createRequire(import.meta.url)
  const compiler = require(artifactPath)
  const originVariant = hypothesis === "compiler-origin-reference-groups-v5"
    || hypothesis === "compiler-origin-reference-groups-v6"
  const hookName = originVariant
    ? "bulkConstructorOriginGroups" : "bulkConstructorReferenceGroups"
  const hook = compiler.FindAllReferences?.Core?.[hookName]
  if (typeof hook !== "function") {
    return { status: "FAIL", failureCode: "HOOK_UNAVAILABLE", hypothesis,
      productionApproved: false, compilerArtifactSha256: digest(fs.readFileSync(artifactPath)) }
  }

  const input = readSources(inputPath)
  const root = path.dirname(inputPath)
  const started = process.hrtime.bigint()
  const cpu = process.cpuUsage()
  const project = createSpikeProject(compiler, root, input.files, { forbidReferenceQueries: true })
  try {
    const program = project.program()
    const sourceFiles = Object.keys(input.files).sort().map((file) => {
      const source = program.getSourceFile(project.fileName(file))
      if (!source) throw new Error(`fixture file missing from compiler Program: ${file}`)
      return source
    })
    const files = Object.fromEntries(sourceFiles.map((source) => {
      const file = relativeFile(root, source.fileName)
      const text = input.files[file]
      const lineStarts = source.getLineStarts()
      const lineEnds = lineStarts.map((start, index) => {
        let end = lineStarts[index + 1] ?? text.length
        while (end > start && (text[end - 1] === "\r" || text[end - 1] === "\n")) end -= 1
        return end
      })
      return [file, { contentSha256: digest(text), length: text.length, lineStarts, lineEnds }]
    }))
    let result
    try {
      result = hook(program, sourceFiles, { throwIfCancellationRequested() {} })
    } catch (error) {
      if (originVariant && error instanceof Error
        && /^ORIGIN_WORKLIST_UNSUPPORTED_[A-Z_]+$/u.test(error.message)) {
        return { status: "FAIL", failureCode: "HOOK_UNSUPPORTED", reason: error.message,
          hypothesis, productionApproved: false,
          compilerArtifactSha256: digest(fs.readFileSync(artifactPath)) }
      }
      throw error
    }
    if (!result || !(originVariant
      ? Array.isArray(result.origins) && Array.isArray(result.selections)
      : Array.isArray(result.groups)) || !result.metrics
      || (hypothesis === "compiler-bulk-reference-groups-v3"
        ? result.metrics.fullProgramPasses !== 1
        : !(result.metrics.fullProgramPasses >= 1))
      || result.metrics.innerFindReferencesCalls !== 0) {
      return { status: "FAIL", failureCode: "NON_BULK_OR_INVALID_HOOK", hypothesis,
        productionApproved: false, hookMetrics: result?.metrics ?? null }
    }

    const { symbols, selections, occurrences } = originVariant
      ? convertOriginGroups(program, root, files, result)
      : convertConstructorGroups(program, root, files, result.groups)
    const artifactSha256 = digest(fs.readFileSync(artifactPath))
    const stockRuntimeSha256 = digest(fs.readFileSync(require.resolve("typescript")))
    const pkg = require("typescript/package.json")
    const facts = { schemaVersion: 1, hypothesis, productionApproved: false,
      inputSha256: inputIdentity(input.files), files, symbols, selections, occurrences,
      compiler: { package: pkg.name, packageVersion: pkg.version,
        runtimeVersion: compiler.version, stockRuntimeSha256, artifactSha256 } }
    const diagnostics = Object.keys(input.files).flatMap((file) => [
      ...project.syntacticDiagnostics(file), ...project.semanticDiagnostics(file),
    ]).map((diagnostic) => ({ code: diagnostic.code, category: diagnostic.category,
      message: compiler.flattenDiagnosticMessageText(diagnostic.messageText, " ") }))
    return { facts, metrics: { pid: process.pid, requestedQueries: 0,
      findReferencesCalls: project.stats().referenceSearchCalls,
      referenceSearchGuard: "host references/referenceGroups forbidden",
      bulkHookCalls: 1, ...result.metrics,
      languageServiceContexts: 1, programSourceFiles: program.getSourceFiles().length,
      elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
      cpuMicroseconds: process.cpuUsage(cpu), endRssBytes: process.memoryUsage().rss,
      processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024,
      compactFactsBytes: Buffer.byteLength(JSON.stringify(facts)), diagnostics,
      errorDiagnostics: diagnostics.filter(({ category }) => (
        category === compiler.DiagnosticCategory.Error)).length } }
  } finally {
    project.dispose()
  }
}

/** Isolated S02 experiment: compiler hook and stock oracle share the pinned production host. */
export async function extractProductionBulk(input, artifactPath) {
  if (input.kind !== "disk-workspace" || !input.membershipSeedFile
    || !input.sdkDeclarationDigest || !input.sdkCompilerOptionsDigest
    || !input.projectConfigurationDigest) {
    throw new Error("production extraction requires a fully pinned workspace and membership seed")
  }
  const { productionDiskHookContext } = await import("./production-oracle-loader.mjs")
  let context
  try {
    context = await productionDiskHookContext(input, artifactPath)
  } catch (error) {
    if (error instanceof Error && /^ORIGIN_WORKLIST_UNSUPPORTED_[A-Z_]+$/u.test(error.message)) {
      const failureDetail = originFailureDetail(error, input.root, input.sdkRoot,
        process.env.ARKTS_S02_FAILURE_DETAIL === "1")
      return { status: "FAIL", failureCode: "HOOK_UNSUPPORTED", reason: error.message,
        ...(failureDetail ? { failureDetail } : {}),
        hypothesis: "compiler-origin-reference-groups-v6", productionApproved: false,
        compilerArtifactSha256: digest(fs.readFileSync(artifactPath)) }
    }
    throw error
  }
  const result = context.result
  if (!result || !Array.isArray(result.origins) || !Array.isArray(result.selections)
    || !result.metrics || result.metrics.fullProgramPasses < 1
    || result.metrics.innerFindReferencesCalls !== 0
    || result.metrics.internalGroupQueries !== 0
    || result.metrics.perTargetFullFileScans !== 0
    || result.metrics.sharedWorklistPasses !== 1) {
    return { status: "FAIL", failureCode: "NON_BULK_OR_INVALID_HOOK",
      hypothesis: "compiler-origin-reference-groups-v6", productionApproved: false,
      hookMetrics: result?.metrics ?? null }
  }
  const unknownSelectionCount = result.selections.filter((selection) =>
    selection.unknownReason === "OUTSIDE_SEARCH_ROOTS" && selection.originIds.length === 0).length
  if (result.selections.some((selection) => selection.unknownReason !== undefined
    && (selection.unknownReason !== "OUTSIDE_SEARCH_ROOTS" || selection.originIds.length !== 0))) {
    return { status: "FAIL", failureCode: "INVALID_UNKNOWN_SELECTION",
      hypothesis: "compiler-origin-reference-groups-v6", productionApproved: false }
  }
  const expected = Object.keys(input.files).sort()
  const actual = Object.keys(context.files).sort()
  const additional = actual.filter((file) => !Object.hasOwn(input.files, file))
  const admitted = context.packageSourceFiles?.filter((file) =>
    !Object.hasOwn(input.files, file)).sort() ?? []
  if (expected.some((file) => !Object.hasOwn(context.files, file))
    || JSON.stringify(additional) !== JSON.stringify(admitted)) {
    throw new Error("production extraction facts do not cover only pinned semantic sources")
  }
  const { symbols, selections, occurrences } = convertOriginGroups(
    positionLookup(context.files, input.root), input.root, context.files, result)
  const require = createRequire(import.meta.url)
  const compiler = require(artifactPath)
  const pkg = require("typescript/package.json")
  const facts = { schemaVersion: 1, hypothesis: "compiler-origin-reference-groups-v6",
    productionApproved: false, inputSha256: input.inputSha256,
    ...(unknownSelectionCount ? { coverage: "PARTIAL" } : {}),
    files: context.files, symbols, selections, occurrences,
    compiler: { package: pkg.name, packageVersion: pkg.version,
      runtimeVersion: compiler.version,
      stockRuntimeSha256: digest(fs.readFileSync(require.resolve("typescript"))),
      artifactSha256: digest(fs.readFileSync(artifactPath)) } }
  const failureDetail = unknownSelectionCount
    ? originFailureDetail({ failureDetail: result.firstUnsupportedDetail }, input.root, input.sdkRoot)
    : null
  return { ...(unknownSelectionCount ? { status: "FAIL", failureCode: "PARTIAL_UNSUPPORTED",
    coverage: "PARTIAL", ...(failureDetail ? { failureDetail } : {}) } : {}),
    facts, inputSha256: input.inputSha256, inputMode: "disk-workspace",
    hostParity: context.hostParity, productionApproved: false,
    sdkDeclarationDigest: context.sdkDeclarationDigest,
    sdkCompilerOptionsDigest: context.sdkCompilerOptionsDigest,
    projectConfigurationDigest: context.projectConfigurationDigest,
    sdkIdentity: context.sdkIdentity,
    projectMembershipCount: context.projectMembershipCount,
    metrics: { ...context.metrics, ...result.metrics, bulkHookCalls: 1,
      unknownSelectionCount,
      compactFactsBytes: Buffer.byteLength(JSON.stringify(facts)) } }
}

function originFailureDetail(error, workspaceRoot, sdkRoot, includeAdjusted = false) {
  const detail = error.failureDetail
  if (detail?.failedPredicate === "ADJUSTED_BRANCH" && !includeAdjusted) return null
  if (!detail || !["ORIGIN_SOURCE_MISSING", "OUTSIDE_SEARCH_ROOTS", "ORIGIN_SPAN_INVALID",
    "ADJUSTED_BRANCH"]
    .includes(detail.failedPredicate)) return null
  const safeLocation = (location) => {
    const fileName = location?.fileName
    if (typeof fileName !== "string" || !path.isAbsolute(fileName)) return null
    const file = path.resolve(fileName)
    const scoped = (scope, root) => {
      const relative = path.relative(root, file)
      if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)) {
        return { scope, file: relative.split(path.sep).join("/") }
      }
      return null
    }
    const identity = scoped("workspace", workspaceRoot) ?? scoped("sdk", sdkRoot)
      ?? { scope: "external", file: null, identity: digest(file).slice(0, 16) }
    const span = location.textSpan
    return { ...identity, span: {
      start: Number.isSafeInteger(span?.start) ? span.start : null,
      length: Number.isSafeInteger(span?.length) ? span.length : null,
    } }
  }
  const selection = safeLocation(detail.selection)
  const definition = safeLocation(detail.definition)
  if (!selection || !definition) return null
  if (detail.failedPredicate === "ADJUSTED_BRANCH") {
    if (selection.scope !== "workspace" || !validSpan(selection.span)
      || !validSpan(definition.span)) return null
    const publicDefinition = definition.scope === "workspace" ? definition
      : { scope: definition.scope === "sdk" ? "sdk" : "external",
        file: null, span: definition.span }
    return { failedPredicate: detail.failedPredicate, selection, definition: publicDefinition }
  }
  return { failedPredicate: detail.failedPredicate, selection, definition }
}

function validSpan(span) {
  return Number.isSafeInteger(span.start) && span.start >= 0
    && Number.isSafeInteger(span.length) && span.length > 0
}

function positionLookup(files, root) {
  return { getSourceFile(fileName) {
    const record = files[relativeKnownFile(root, fileName, files)]
    if (!record) return undefined
    return { getLineAndCharacterOfPosition(offset) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > record.length) {
        throw new Error("compiler reference offset outside pinned source")
      }
      let low = 0
      let high = record.lineStarts.length
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2)
        if (record.lineStarts[middle] <= offset) low = middle
        else high = middle
      }
      return { line: low, character: offset - record.lineStarts[low] }
    } }
  } }
}

function convertOriginGroups(program, root, files, result) {
  const symbols = []
  const occurrences = []
  for (const origin of result.origins) {
    const definition = checkedLocation(program, root, files, origin.definition)
    const key = digest(JSON.stringify([definition.file, origin.definition.textSpan.start,
      origin.definition.textSpan.length, files[definition.file].contentSha256]))
    symbols.push({ key, declarations: [{ file: definition.file,
      start: origin.definition.textSpan.start, length: origin.definition.textSpan.length,
      contentSha256: files[definition.file].contentSha256 }] })
    if (!Array.isArray(origin.references)) throw new Error("invalid compiler origin references")
    for (const reference of origin.references) {
      const location = checkedLocation(program, root, files, reference)
      const canonical = location.file === definition.file
        && reference.textSpan.start === origin.definition.textSpan.start
        && reference.textSpan.length === origin.definition.textSpan.length
      occurrences.push({ key, location,
        isCanonicalDeclaration: Boolean(reference.isDefinition || canonical) })
    }
  }
  const selections = result.selections.map((selection) => {
    const location = checkedLocation(program, root, files, selection)
    if (!Array.isArray(selection.originIds)
      || selection.originIds.some((id) => !Number.isSafeInteger(id)
        || id < 0 || id >= symbols.length)) throw new Error("invalid compiler origin selection")
    return { file: location.file, start: selection.textSpan.start,
      length: selection.textSpan.length,
      keys: selection.originIds.map((id) => symbols[id].key),
      ...(selection.unknownReason ? { unknownReason: selection.unknownReason } : {}) }
  })
  return { symbols, selections, occurrences }
}

function convertConstructorGroups(program, root, files, groups) {
  const symbols = []
  const selections = []
  const occurrences = []
  for (const group of groups) {
    const declaration = checkedLocation(program, root, files, group.declaration)
    const key = digest(JSON.stringify([declaration.file, group.declaration.textSpan.start,
      group.declaration.textSpan.length, files[declaration.file].contentSha256]))
    symbols.push({ key, declarations: [{ file: declaration.file,
      start: group.declaration.textSpan.start, length: group.declaration.textSpan.length,
      contentSha256: files[declaration.file].contentSha256 }] })
    selections.push({ file: declaration.file, start: group.declaration.textSpan.start,
      length: group.declaration.textSpan.length, key })
    if (!Array.isArray(group.references)) throw new Error("invalid compiler reference group")
    for (const reference of group.references) {
      const location = checkedLocation(program, root, files, reference)
      const canonical = location.file === declaration.file
        && reference.textSpan.start === group.declaration.textSpan.start
        && reference.textSpan.length === group.declaration.textSpan.length
      occurrences.push({ key, location,
        isCanonicalDeclaration: Boolean(reference.isDefinition || canonical) })
    }
  }
  return { symbols, selections, occurrences }
}

function checkedLocation(program, root, files, reference) {
  if (!reference || typeof reference.fileName !== "string"
    || !Number.isSafeInteger(reference.textSpan?.start)
    || !Number.isSafeInteger(reference.textSpan?.length)
    || reference.textSpan.start < 0 || reference.textSpan.length <= 0) {
    throw new Error("invalid compiler reference span")
  }
  const file = relativeKnownFile(root, reference.fileName, files)
  const record = files[file]
  const source = program.getSourceFile(reference.fileName)
  if (!record || !source || reference.textSpan.start + reference.textSpan.length > record.length) {
    throw new Error(`compiler reference outside fixture: ${file}`)
  }
  return { file, start: source.getLineAndCharacterOfPosition(reference.textSpan.start),
    end: source.getLineAndCharacterOfPosition(reference.textSpan.start + reference.textSpan.length) }
}

function relativeFile(root, file) {
  return path.relative(root, file).split(path.sep).join("/")
}

function relativeKnownFile(root, file, files) {
  const relative = relativeFile(root, file)
  if (Object.hasOwn(files, relative)) return relative
  try {
    const realRoot = fs.realpathSync(root)
    const physicalLexical = relativeFile(realRoot, file)
    if (Object.hasOwn(files, physicalLexical)) return physicalLexical
    const inside = (name) => name && name !== ".." && !name.startsWith("../")
      && !path.isAbsolute(name)
    if (!inside(relative) && !inside(physicalLexical)) return relative
    const physical = relativeFile(realRoot, fs.realpathSync(file))
    if (Object.hasOwn(files, physical)) return physical
  } catch { /* Virtual fixture paths need not exist on disk. */ }
  return relative
}
