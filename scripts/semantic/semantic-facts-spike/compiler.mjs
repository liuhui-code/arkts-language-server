import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import ts from "typescript"

import { createSpikeProject } from "../ohos-typescript-spike/backend-host.mjs"
import { digest, inputIdentity, normalizeLocations, ordinal, queryOffset, readOracleSources, readSources } from "./input.mjs"

// Experimental projections, NOT accepted complete references algorithms.
export function extract(inputPath, hypothesis = "public-checker-binding-projection-v1") {
  const input = readSources(inputPath)
  const started = process.hrtime.bigint()
  const cpu = process.cpuUsage()
  const root = path.dirname(inputPath)
  const project = createSpikeProject(ts, root, input.files, { forbidReferenceQueries: true })
  try {
    const program = project.program()
    const checker = program.getTypeChecker()
    const files = sourceRecords(program, root, input.files)
    const symbols = new Map()
    const selections = []
    const occurrences = []
    const unsupportedSelections = []
    const unsupportedConstructorKeys = new Set()
    let symbolQueries = 0
    let aliasQueries = 0
    let resolvedSignatureQueries = 0
    function constructorFact(declaration) {
      if (!declaration || !ts.isConstructorDeclaration(declaration) || declaration.modifiers?.length
        || declaration.parent.members.filter(ts.isConstructorDeclaration).length !== 1) return undefined
      const sourceFile = declaration.getSourceFile()
      const file = relativeFile(root, sourceFile.fileName)
      if (!files[file]) return undefined
      const keyword = declaration.getChildren(sourceFile)
        .find((child) => child.kind === ts.SyntaxKind.ConstructorKeyword)
      if (!keyword) return undefined
      const span = tokenSpan(keyword, sourceFile)
      const declarations = [{ file, ...span, contentSha256: files[file].contentSha256 }]
      const key = digest(JSON.stringify(declarations))
      symbols.set(key, { key, declarations })
      return { key, file, span, sourceFile }
    }
    for (const file of Object.keys(input.files).sort()) {
      const source = program.getSourceFile(project.fileName(file))
      function visit(node) {
        if (hypothesis === "resolved-signature-explicit-constructor-v2") {
          if (ts.isNewExpression(node)) {
            unsupportedSelections.push({ file, ...tokenSpan(node.expression, source) })
          }
          if (ts.isConstructorDeclaration(node)) {
            const fact = constructorFact(node)
            if (fact) {
              selections.push({ file: fact.file, ...fact.span, key: fact.key })
              occurrences.push({ key: fact.key,
                location: sourceLocation(fact.sourceFile, fact.file, fact.span),
                isCanonicalDeclaration: true })
            }
          } else if (ts.isNewExpression(node)
            || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword)) {
            resolvedSignatureQueries += 1
            const fact = constructorFact(checker.getResolvedSignature(node)?.declaration)
            if (fact) {
              const callee = node.expression
              const calleeSymbol = ts.isIdentifier(callee) ? checker.getSymbolAtLocation(callee) : undefined
              const classDeclaration = calleeSymbol?.declarations?.[0]
              const directClass = calleeSymbol && !(calleeSymbol.flags & ts.SymbolFlags.Alias)
                && calleeSymbol.declarations?.length === 1 && ts.isClassDeclaration(classDeclaration)
                && files[relativeFile(root, classDeclaration.getSourceFile().fileName)]
              if (ts.isCallExpression(node) || callee.kind === ts.SyntaxKind.ThisKeyword || directClass) {
                occurrences.push({ key: fact.key,
                  location: sourceLocation(source, file, tokenSpan(callee, source)),
                  isCanonicalDeclaration: false })
              } else {
                unsupportedConstructorKeys.add(fact.key)
              }
            }
          }
        }
        if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
          symbolQueries += 1
          let symbol = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
            ? checker.getShorthandAssignmentValueSymbol(node.parent)
            : checker.getSymbolAtLocation(node)
          if (symbol?.flags & ts.SymbolFlags.Alias) {
            aliasQueries += 1
            symbol = checker.getAliasedSymbol(symbol)
          }
          const declarations = (symbol?.declarations ?? []).flatMap((declaration) => {
            const sourceFile = declaration.getSourceFile()
            const relative = relativeFile(root, sourceFile.fileName)
            if (!files[relative] || !declaration.name) return []
            return [{ file: relative, ...tokenSpan(declaration.name, sourceFile),
              contentSha256: files[relative].contentSha256 }]
          }).sort((left, right) => ordinal(JSON.stringify(left), JSON.stringify(right)))
          if (declarations.length) {
            const key = digest(JSON.stringify(declarations))
            symbols.set(key, { key, declarations })
            const span = tokenSpan(node, source)
            const location = sourceLocation(source, file, span)
            const isCanonicalDeclaration = declarations.some((declaration) => (
              declaration.file === file && declaration.start === span.start
              && declaration.length === span.length
            ))
            selections.push({ file, ...span, key })
            occurrences.push({ key, location, isCanonicalDeclaration })
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    const facts = {
      schemaVersion: 1, hypothesis,
      productionApproved: false, inputSha256: inputIdentity(input.files),
      compiler: compilerIdentity(), files,
      symbols: [...symbols.values()], selections, occurrences,
      ...(hypothesis === "resolved-signature-explicit-constructor-v2"
        ? { unsupportedSelections, unsupportedConstructorKeys: [...unsupportedConstructorKeys] } : {}),
    }
    const diagnostics = Object.keys(input.files).flatMap((file) => [
      ...project.syntacticDiagnostics(file), ...project.semanticDiagnostics(file),
    ]).map((diagnostic) => ({ code: diagnostic.code, category: diagnostic.category,
      file: diagnostic.file ? relativeFile(root, diagnostic.file.fileName) : null,
      start: diagnostic.start ?? null, length: diagnostic.length ?? null,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") }))
    return { facts, metrics: {
      pid: process.pid, requestedQueries: 0, findReferencesCalls: project.stats().referenceSearchCalls,
      referenceSearchGuard: "host references/referenceGroups forbidden",
      languageServiceContexts: 1, programSourceFiles: program.getSourceFiles().length,
      explicitSymbolQueries: symbolQueries, explicitAliasQueries: aliasQueries,
      ...(hypothesis === "resolved-signature-explicit-constructor-v2" ? { resolvedSignatureQueries } : {}),
      ...resourceMetrics(started, cpu), compactFactsBytes: Buffer.byteLength(JSON.stringify(facts)),
      diagnostics, errorDiagnostics: diagnostics.filter(({ category }) => category === ts.DiagnosticCategory.Error).length,
    } }
  } finally {
    project.dispose()
  }
}

// Oracle follows production definition→findReferences and declaration filtering.
// Only this oracle is permitted to perform one full search per selected target.
export function oracle(inputPath, queries) {
  const input = readOracleSources(inputPath)
  const root = input.root
  const started = process.hrtime.bigint()
  const cpu = process.cpuUsage()
  const project = createSpikeProject(ts, root, input.files)
  let findReferencesCalls = 0
  try {
    const program = project.program()
    const files = sourceRecords(program, root, input.files)
    const answers = queries.map((query) => {
      const offset = queryOffset(files[query.file], query)
      const definitions = project.definitions(query.file, offset)
      const canonical = new Set(definitions.map((definition) => (
        JSON.stringify([relativeFile(root, definition.fileName),
          definition.textSpan.start, definition.textSpan.length])
      )))
      const locations = []
      for (const definition of definitions) {
        findReferencesCalls += 1
        for (const group of project.referenceGroups(relativeFile(root, definition.fileName), definition.textSpan.start)) {
          for (const reference of group.references) {
            const file = relativeFile(root, reference.fileName)
            const key = JSON.stringify([file, reference.textSpan.start, reference.textSpan.length])
            if (!query.includeDeclaration && (reference.isDefinition || canonical.has(key))) continue
            if (!files[file]) throw new Error(`oracle reference outside fixture: ${file}`)
            locations.push(sourceLocation(program.getSourceFile(reference.fileName), file,
              reference.textSpan))
          }
        }
      }
      return { id: query.id, status: "COMPLETE", locations: normalizeLocations(locations) }
    })
    if (input.kind === "disk-workspace"
      && readOracleSources(inputPath).inputSha256 !== input.inputSha256) {
      throw new Error("disk oracle workspace changed during query")
    }
    return { answers, inputSha256: input.inputSha256, compiler: compilerIdentity(),
      ...(input.kind === "disk-workspace" ? { inputMode: input.kind,
        hostParity: "HOST_PARITY_NOT_MET", productionApproved: false,
        workspaceRoot: root, listedSourceSha256: input.inputSha256,
        sdkRoot: input.sdkRoot, sdkUsedByHost: false } : {}),
      queriesSha256: digest(JSON.stringify(queries)), metrics: { pid: process.pid, findReferencesCalls,
      requestedQueries: queries.length, ...resourceMetrics(started, cpu) } }
  } finally {
    project.dispose()
  }
}

function sourceRecords(program, root, inputs) {
  return Object.fromEntries(Object.entries(inputs).map(([file, text]) => {
    const source = program.getSourceFile(path.resolve(root, file))
    const lineStarts = source.getLineStarts()
    const lineEnds = lineStarts.map((start, index) => {
      let end = lineStarts[index + 1] ?? text.length
      while (end > start && (text[end - 1] === "\r" || text[end - 1] === "\n")) end -= 1
      return end
    })
    return [file, { contentSha256: digest(text), length: text.length, lineStarts, lineEnds }]
  }))
}

function tokenSpan(node, source) {
  // Same quote exclusion as pinned compiler FindAllReferences.getTextSpan.
  const nodeStart = node.getStart(source)
  const quote = ts.isStringLiteralLike(node) && node.getEnd() - nodeStart > 2 ? 1 : 0
  const start = nodeStart + quote
  return { start, length: node.getEnd() - quote - start }
}

function sourceLocation(source, file, span) {
  return { file, start: source.getLineAndCharacterOfPosition(span.start),
    end: source.getLineAndCharacterOfPosition(span.start + span.length) }
}

function relativeFile(root, file) {
  return path.relative(root, file).split(path.sep).join("/")
}

function compilerIdentity() {
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve("typescript/package.json")
  const directory = path.dirname(packagePath)
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"))
  return { package: pkg.name, packageVersion: pkg.version, runtimeVersion: ts.version,
    runtimeSha256: digest(fs.readFileSync(require.resolve("typescript"))),
    declarationsSha256: digest(fs.readFileSync(path.join(directory, "lib/typescript.d.ts"))),
    licenseSha256: digest(fs.readFileSync(path.join(directory, "LICENSE"))) }
}

function resourceMetrics(started, cpu) {
  return { elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    cpuMicroseconds: process.cpuUsage(cpu), endRssBytes: process.memoryUsage().rss,
    processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024,
    memoryBasis: "OS process high-water through extraction/query; includes startup, excludes later disposal/serialization; not a sampled curve" }
}
