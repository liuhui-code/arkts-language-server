#!/usr/bin/env node

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PINNED_SOURCE_SHA256 = "af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const defaultSource = path.join(root, "node_modules/typescript/lib/typescript.js")

try {
  const options = parseArgs(process.argv.slice(2))
  const source = fs.readFileSync(options.source)
  const sourceSha256 = sha256(source)
  if (sourceSha256 !== PINNED_SOURCE_SHA256) {
    throw new Error(`PINNED_COMPILER_MISMATCH: expected ${PINNED_SOURCE_SHA256}, got ${sourceSha256}`)
  }
  const artifact = patchCompiler(source.toString("utf8"))
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, artifact, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({
    hypothesis: "compiler-bulk-reference-groups-v3",
    productionApproved: false,
    sourceSha256,
    artifactSha256: sha256(artifact),
    artifactPath: options.out,
    hook: "FindAllReferences.Core.bulkConstructorReferenceGroups",
  })}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!["--out", "--source"].includes(name) || !value || options[name.slice(2)] !== undefined) {
      throw new Error("usage: build-bulk-hook.mjs --out <new .cjs file> [--source <pinned bundle>]")
    }
    options[name.slice(2)] = path.resolve(value)
  }
  options.source ??= defaultSource
  if (!options.out?.endsWith(".cjs") || options.out === options.source) {
    throw new Error("output must be a new .cjs file distinct from compiler source")
  }
  return options
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex")
}

function replaceOnce(source, before, after) {
  const first = source.indexOf(before)
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`PINNED_COMPILER_LAYOUT_MISMATCH: ${before.slice(0, 80)}`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

function patchCompiler(pinnedSource) {
  let source = pinnedSource
  source = replaceOnce(source,
    "function findReferencedSymbols(program, cancellationToken, sourceFiles, sourceFile, position) {",
    "function findReferencedSymbols(program, cancellationToken, sourceFiles, sourceFile, position, bulkIndex) {")
  source = replaceOnce(source,
    "const referencedSymbols = Core.getReferencedSymbolsForNode(position, node, program, sourceFiles, cancellationToken, options);",
    "const referencedSymbols = Core.getReferencedSymbolsForNode(position, node, program, sourceFiles, cancellationToken, options, void 0, bulkIndex);")
  source = replaceOnce(source,
    "function getReferencedSymbolsForNode(position, node, program, sourceFiles, cancellationToken, options = {}, sourceFilesSet = new Set2(sourceFiles.map((f) => f.fileName))) {",
    "function getReferencedSymbolsForNode(position, node, program, sourceFiles, cancellationToken, options = {}, sourceFilesSet = new Set2(sourceFiles.map((f) => f.fileName)), bulkIndex) {")
  source = replaceOnce(source,
    "const references = getReferencedSymbolsForSymbol(symbol, node, sourceFiles, sourceFilesSet, checker, cancellationToken, options);",
    "const references = getReferencedSymbolsForSymbol(symbol, node, sourceFiles, sourceFilesSet, checker, cancellationToken, options, bulkIndex);")
  source = replaceOnce(source,
    "function getReferencedSymbolsForSymbol(originalSymbol, node, sourceFiles, sourceFilesSet, checker, cancellationToken, options) {",
    "function getReferencedSymbolsForSymbol(originalSymbol, node, sourceFiles, sourceFilesSet, checker, cancellationToken, options, bulkIndex) {")
  source = replaceOnce(source,
    "new State(sourceFiles, sourceFilesSet, node ? getSpecialSearchKind(node) : SpecialSearchKind.None, checker, cancellationToken, searchMeaning, options, result);",
    "new State(sourceFiles, sourceFilesSet, node ? getSpecialSearchKind(node) : SpecialSearchKind.None, checker, cancellationToken, searchMeaning, options, result, bulkIndex);")
  source = replaceOnce(source,
    "constructor(sourceFiles, sourceFilesSet, specialSearchKind, checker, cancellationToken, searchMeaning, options, result) {",
    "constructor(sourceFiles, sourceFilesSet, specialSearchKind, checker, cancellationToken, searchMeaning, options, result, bulkIndex) {")
  source = replaceOnce(source,
    "      this.sourceFiles = sourceFiles;\n      this.sourceFilesSet = sourceFilesSet;",
    "      this.sourceFiles = sourceFiles;\n      this.bulkIndex = bulkIndex;\n      this.sourceFilesSet = sourceFilesSet;")
  source = replaceOnce(source,
    "      for (const sourceFile of state.sourceFiles) {\n        state.cancellationToken.throwIfCancellationRequested();\n        searchForName(sourceFile, search, state);\n      }",
    "      for (const sourceFile of state.bulkIndex ? state.bulkIndex.get(search.escapedText) || emptyArray : state.sourceFiles) {\n        state.cancellationToken.throwIfCancellationRequested();\n        if (state.bulkIndex) state.bulkIndex.candidateFileSearches += 1;\n        searchForName(sourceFile, search, state);\n      }")
  source = replaceOnce(source,
    "  function getReferencesInContainer(container, sourceFile, search, state, addReferencesHere) {\n    if (!state.markSearchedSymbols(sourceFile, search.allSearchSymbols)) {",
    "  function getReferencesInContainer(container, sourceFile, search, state, addReferencesHere) {\n    if (state.bulkIndex) state.bulkIndex.containerSearches += 1;\n    if (!state.markSearchedSymbols(sourceFile, search.allSearchSymbols)) {")
  source = replaceOnce(source,
    "  Core2.getReferencedSymbolsForNode = getReferencedSymbolsForNode;",
    `  Core2.getReferencedSymbolsForNode = getReferencedSymbolsForNode;
  function bulkConstructorReferenceGroups(program, sourceFiles, cancellationToken) {
    const sourceFilesByName = new Map2();
    sourceFilesByName.candidateFileSearches = 0;
    sourceFilesByName.containerSearches = 0;
    let bulkIndexEntries = 0;
    const constructors = [];
    // One shared source-file pass builds the name candidate map for every target.
    // The pinned compiler still owns symbol relations and reference grouping.
    for (const sourceFile of sourceFiles) {
      cancellationToken.throwIfCancellationRequested();
      for (const [name] of getNameTable(sourceFile)) {
        let candidates = sourceFilesByName.get(name);
        if (!candidates) sourceFilesByName.set(name, candidates = []);
        candidates.push(sourceFile);
        bulkIndexEntries += 1;
      }
      function visit(node) {
        if (isConstructorDeclaration(node)) {
          const keyword = findChildOfKind(node, 136 /* ConstructorKeyword */, sourceFile);
          if (keyword) constructors.push({ sourceFile, keyword });
        }
        forEachChild(node, visit);
      }
      forEachChild(sourceFile, visit);
    }
    const groups = constructors.map(({ sourceFile, keyword }) => {
      cancellationToken.throwIfCancellationRequested();
      const symbols = findReferencedSymbols(program, cancellationToken, sourceFiles, sourceFile,
        keyword.getStart(sourceFile), sourceFilesByName) || emptyArray;
      return {
        declaration: { fileName: sourceFile.fileName, textSpan: getTextSpan(keyword, sourceFile) },
        references: flatMap(symbols, (symbol) => symbol.references),
      };
    });
    return { groups, metrics: { fullProgramPasses: 1,
      fullProgramPassesScope: "shared name-table indexing; compiler ancillary scans are not counted",
      innerFindReferencesCalls: 0, internalGroupQueries: constructors.length,
      candidateFileSearches: sourceFilesByName.candidateFileSearches,
      containerSearches: sourceFilesByName.containerSearches,
      bulkIndexEntries, constructorGroups: groups.length,
      indexedSourceFiles: sourceFiles.length } };
  }
  Core2.bulkConstructorReferenceGroups = bulkConstructorReferenceGroups;`)
  return source
}
