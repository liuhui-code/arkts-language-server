#!/usr/bin/env node

// Isolated compiler-fork experiment. This never patches the installed package.
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
  const v4Artifact = patchCompiler(source.toString("utf8"))
  const artifact = options.variant === "usage-v6"
    ? patchUsageHook(patchOriginHook(v4Artifact))
    : options.variant === "origin-v5" ? patchOriginHook(v4Artifact) : v4Artifact
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, artifact, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({
    hypothesis: options.variant === "usage-v6" ? "compiler-origin-reference-groups-v6"
      : options.variant === "origin-v5" ? "compiler-origin-reference-groups-v5"
        : "compiler-constructor-shared-worklist-v4",
    productionApproved: false,
    sourceSha256,
    artifactSha256: sha256(artifact),
    artifactPath: options.out,
    hook: options.variant === "origin-v5" || options.variant === "usage-v6"
      ? "FindAllReferences.Core.bulkConstructorOriginGroups"
      : "FindAllReferences.Core.bulkConstructorReferenceGroups",
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
    if (!["--out", "--source", "--variant"].includes(name)
      || !value || options[name.slice(2)] !== undefined) {
      throw new Error("usage: build-worklist-hook.mjs --out <new .cjs file> [--source <pinned bundle>] [--variant origin-v5|usage-v6]")
    }
    options[name.slice(2)] = name === "--variant" ? value : path.resolve(value)
  }
  if (options.variant && !["origin-v5", "usage-v6"].includes(options.variant)) {
    throw new Error("unsupported compiler hook variant")
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
    "constructor(sourceFiles, sourceFilesSet, specialSearchKind, checker, cancellationToken, searchMeaning, options, result) {",
    "constructor(sourceFiles, sourceFilesSet, specialSearchKind, checker, cancellationToken, searchMeaning, options, result, bulkWorklist) {")
  source = replaceOnce(source,
    "      this.sourceFiles = sourceFiles;\n      this.sourceFilesSet = sourceFilesSet;",
    "      this.sourceFiles = sourceFiles;\n      this.bulkWorklist = bulkWorklist;\n      this.sourceFilesSet = sourceFilesSet;")
  source = replaceOnce(source,
    "        this.importTracker = createImportTracker(this.sourceFiles, this.sourceFilesSet, this.checker, this.cancellationToken);",
    "        this.importTracker = this.bulkWorklist ? this.bulkWorklist.getImportTracker() : createImportTracker(this.sourceFiles, this.sourceFilesSet, this.checker, this.cancellationToken);")
  source = replaceOnce(source,
    `    } else {
      for (const sourceFile of state.sourceFiles) {
        state.cancellationToken.throwIfCancellationRequested();
        searchForName(sourceFile, search, state);
      }
    }
  }
  function getSpecialSearchKind(node) {`,
    `    } else if (state.bulkWorklist) {
      state.bulkWorklist.enqueueGlobal(search, state);
    } else {
      for (const sourceFile of state.sourceFiles) {
        state.cancellationToken.throwIfCancellationRequested();
        searchForName(sourceFile, search, state);
      }
    }
  }
  function getSpecialSearchKind(node) {`)
  source = replaceOnce(source,
    `  function searchForName(sourceFile, search, state) {
    if (getNameTable(sourceFile).get(search.escapedText) !== void 0) {
      getReferencesInSourceFile(sourceFile, search, state);
    }
  }`,
    `  function searchForName(sourceFile, search, state) {
    if ((state.bulkWorklist ? state.bulkWorklist.hasName(sourceFile, search.escapedText) : getNameTable(sourceFile).get(search.escapedText) !== void 0)) {
      getReferencesInSourceFile(sourceFile, search, state);
    }
  }`)
  source = replaceOnce(source,
    `  function getReferencesInContainer(container, sourceFile, search, state, addReferencesHere) {
    if (!state.markSearchedSymbols(sourceFile, search.allSearchSymbols)) {
      return;
    }
    for (const position of getPossibleSymbolReferencePositions(sourceFile, search.text, container)) {
      getReferencesAtLocation(sourceFile, position, search, state, addReferencesHere);
    }
  }`,
    `  function getReferencesInContainer(container, sourceFile, search, state, addReferencesHere) {
    if (state.bulkWorklist) {
      state.bulkWorklist.enqueue(container, sourceFile, search, state, addReferencesHere);
      return;
    }
    if (!state.markSearchedSymbols(sourceFile, search.allSearchSymbols)) {
      return;
    }
    for (const position of getPossibleSymbolReferencePositions(sourceFile, search.text, container)) {
      getReferencesAtLocation(sourceFile, position, search, state, addReferencesHere);
    }
  }`)
  source = replaceOnce(source,
    "  Core2.getReferencedSymbolsForNode = getReferencedSymbolsForNode;",
    `  Core2.getReferencedSymbolsForNode = getReferencedSymbolsForNode;
  function bulkConstructorReferenceGroups(program, sourceFiles, cancellationToken, selectionSourceFiles = sourceFiles) {
    const checker = program.getTypeChecker();
    const sourceFilesSet = new Set2(sourceFiles.map((file) => file.fileName));
    const selectionSourceFileSet = new Set2(selectionSourceFiles);
    if (selectionSourceFiles.some((file) => !sourceFilesSet.has(file.fileName))) {
      throw new Error("BULK_WORKLIST_SELECTION_OUTSIDE_SEARCH_ROOTS");
    }
    const options = { use: 1 /* References */ };
    const filesByName = new Map2();
    const fileNames = new Map2();
    const positionsByFile = new Map2();
    const pending = [];
    const constructors = [];
    const metrics = { fullProgramPasses: 1,
      fullProgramPassesScope: "shared name table plus optional shared import map; candidate file/text scans counted separately",
      sharedWorklistPasses: 1,
      innerFindReferencesCalls: 0, internalGroupQueries: 0, perTargetFullFileScans: 0,
      importTrackerFullScans: 0, onDemandFileNameTableScans: 0,
      candidateFileSearches: 0,
      containerSearches: 0, sharedPositionReuses: 0,
      bulkIndexEntries: 0, constructorGroups: 0,
      indexedSourceFiles: sourceFiles.length, selectionSourceFiles: selectionSourceFiles.length };
    for (const sourceFile of sourceFiles) {
      cancellationToken.throwIfCancellationRequested();
      const names = getNameTable(sourceFile);
      fileNames.set(sourceFile, names);
      for (const [name] of names) {
        let candidates = filesByName.get(name);
        if (!candidates) filesByName.set(name, candidates = []);
        candidates.push(sourceFile);
        metrics.bulkIndexEntries++;
      }
      if (!selectionSourceFileSet.has(sourceFile)) continue;
      function visit(node) {
        if (isConstructorDeclaration(node)) {
          const keyword = findChildOfKind(node, 136 /* ConstructorKeyword */, sourceFile);
          if (keyword) constructors.push({ sourceFile, keyword });
        }
        forEachChild(node, visit);
      }
      forEachChild(sourceFile, visit);
    }
    let draining = false;
    let importTracker;
    const worklist = {
      hasName(sourceFile, name) {
        let names = fileNames.get(sourceFile);
        if (!names) {
          // Import/heritage traversal may reach a dependency outside the
          // caller's search roots. The stock compiler still inspects it.
          names = getNameTable(sourceFile);
          fileNames.set(sourceFile, names);
          metrics.onDemandFileNameTableScans++;
        }
        return names.get(name) !== void 0;
      },
      getImportTracker() {
        if (!importTracker) {
          importTracker = createImportTracker(sourceFiles, sourceFilesSet, checker, cancellationToken);
          metrics.fullProgramPasses++;
          metrics.importTrackerFullScans++;
        }
        return importTracker;
      },
      enqueueGlobal(search, state) {
        // One name-table pass replaces the per-constructor full-file loop.
        for (const sourceFile of filesByName.get(search.escapedText) || emptyArray) {
          cancellationToken.throwIfCancellationRequested();
          this.enqueue(sourceFile, sourceFile, search, state, true);
        }
      },
      enqueue(container, sourceFile, search, state, addReferencesHere) {
        const task = { container, sourceFile, search, state, addReferencesHere };
        // Dynamic import/heritage searches execute depth-first, as in the
        // original compiler. Only initial target searches are deferred.
        if (draining) this.process(task);
        else pending.push(task);
      },
      process({ container, sourceFile, search, state, addReferencesHere }) {
        cancellationToken.throwIfCancellationRequested();
        metrics.containerSearches++;
        if (!state.markSearchedSymbols(sourceFile, search.allSearchSymbols)) return;
        let names = positionsByFile.get(sourceFile);
        if (!names) positionsByFile.set(sourceFile, names = new Map2());
        let positions = names.get(search.text);
        if (!positions) {
          positions = getPossibleSymbolReferencePositions(sourceFile, search.text, sourceFile);
          names.set(search.text, positions);
          metrics.candidateFileSearches++;
        } else {
          metrics.sharedPositionReuses++;
        }
        for (const position of positions) {
          if (position >= container.pos && position <= container.end) {
            getReferencesAtLocation(sourceFile, position, search, state, addReferencesHere);
          }
        }
      },
      drain() {
        draining = true;
        try {
          for (const task of pending) this.process(task);
        } finally {
          draining = false;
        }
      }
    };
    const prepared = constructors.map(({ sourceFile, keyword }) => {
      cancellationToken.throwIfCancellationRequested();
      const node = getAdjustedNode(getTouchingPropertyName(sourceFile, keyword.getStart(sourceFile)), options);
      if (node.kind !== 136 /* ConstructorKeyword */ || !isConstructorDeclaration(node.parent)) {
        throw new Error("BULK_WORKLIST_UNSAFE_ADJUSTED_CONSTRUCTOR");
      }
      const originalSymbol = checker.getSymbolAtLocation(node);
      if (!originalSymbol) throw new Error("BULK_WORKLIST_UNSAFE_MISSING_SYMBOL");
      const symbol = skipPastExportOrImportSpecifierOrUnion(originalSymbol, node, checker, true) || originalSymbol;
      const searchMeaning = getIntersectingMeaningFromDeclarations(node, symbol);
      const result = [];
      const state = new State(sourceFiles, sourceFilesSet, getSpecialSearchKind(node),
        checker, cancellationToken, searchMeaning, options, result, worklist);
      const search = state.createSearch(node, symbol, void 0, {
        allSearchSymbols: populateSearchSymbolSet(symbol, node, checker, false, false, false)
      });
      getReferencesInContainerOrFiles(symbol, state, search);
      return { sourceFile, keyword, node, state };
    });
    worklist.drain();
    const groups = prepared.map(({ sourceFile, keyword, node, state }) => {
      const definitionSymbol = checker.getSymbolAtLocation(node);
      return {
        declaration: { fileName: sourceFile.fileName, textSpan: getTextSpan(keyword, sourceFile) },
        references: flatMap(state.result, (group) => group.definition
          ? group.references.map((reference) => toReferencedSymbolEntry(reference, definitionSymbol))
          : emptyArray)
      };
    });
    metrics.constructorGroups = groups.length;
    return { groups, metrics };
  }
  Core2.bulkConstructorReferenceGroups = bulkConstructorReferenceGroups;`)
  return source
}

function patchOriginHook(v4Artifact) {
  let source = replaceOnce(v4Artifact,
    "  function bulkConstructorReferenceGroups(program, sourceFiles, cancellationToken, selectionSourceFiles = sourceFiles) {",
    "  function bulkConstructorOriginGroups(program, sourceFiles, cancellationToken, selectionSourceFiles = sourceFiles) {")
  source = replaceOnce(source,
    "      bulkIndexEntries: 0, constructorGroups: 0,",
    "      bulkIndexEntries: 0, constructorGroups: 0, definitionCalls: 0, originStateCount: 0,")
  source = replaceOnce(source,
    `    const prepared = constructors.map(({ sourceFile, keyword }) => {
      cancellationToken.throwIfCancellationRequested();
      const node = getAdjustedNode(getTouchingPropertyName(sourceFile, keyword.getStart(sourceFile)), options);
      if (node.kind !== 136 /* ConstructorKeyword */ || !isConstructorDeclaration(node.parent)) {
        throw new Error("BULK_WORKLIST_UNSAFE_ADJUSTED_CONSTRUCTOR");
      }
      const originalSymbol = checker.getSymbolAtLocation(node);
      if (!originalSymbol) throw new Error("BULK_WORKLIST_UNSAFE_MISSING_SYMBOL");
      const symbol = skipPastExportOrImportSpecifierOrUnion(originalSymbol, node, checker, true) || originalSymbol;
      const searchMeaning = getIntersectingMeaningFromDeclarations(node, symbol);
      const result = [];
      const state = new State(sourceFiles, sourceFilesSet, getSpecialSearchKind(node),
        checker, cancellationToken, searchMeaning, options, result, worklist);
      const search = state.createSearch(node, symbol, void 0, {
        allSearchSymbols: populateSearchSymbolSet(symbol, node, checker, false, false, false)
      });
      getReferencesInContainerOrFiles(symbol, state, search);
      return { sourceFile, keyword, node, state };
    });
    worklist.drain();
    const groups = prepared.map(({ sourceFile, keyword, node, state }) => {
      const definitionSymbol = checker.getSymbolAtLocation(node);
      return {
        declaration: { fileName: sourceFile.fileName, textSpan: getTextSpan(keyword, sourceFile) },
        references: flatMap(state.result, (group) => group.definition
          ? group.references.map((reference) => toReferencedSymbolEntry(reference, definitionSymbol))
          : emptyArray)
      };
    });
    metrics.constructorGroups = groups.length;
    return { groups, metrics };`,
    `    const origins = [];
    const originBySpan = new Map2();
    let firstUnsupported;
    const selections = constructors.map(({ sourceFile, keyword }) => {
      cancellationToken.throwIfCancellationRequested();
      metrics.definitionCalls++;
      const definitions = ts_GoToDefinition_exports.getDefinitionAtPosition(
        program, sourceFile, keyword.getStart(sourceFile));
      if (!definitions || !definitions.length) throw new Error("ORIGIN_WORKLIST_UNSUPPORTED_NO_DEFINITION");
      const originIds = definitions.map((definition) => {
        const originSource = program.getSourceFile(definition.fileName);
        const span = definition.textSpan;
        if (!originSource || !sourceFilesSet.has(originSource.fileName)
          || !Number.isSafeInteger(span == null ? void 0 : span.start)
          || !Number.isSafeInteger(span == null ? void 0 : span.length)
          || span.start < 0 || span.length <= 0 || span.start + span.length > originSource.text.length) {
          const failure = new Error("ORIGIN_WORKLIST_UNSUPPORTED_OUTSIDE_ROOT_OR_SPAN");
          failure.failureDetail = {
            failedPredicate: !originSource ? "ORIGIN_SOURCE_MISSING"
              : !sourceFilesSet.has(originSource.fileName) ? "OUTSIDE_SEARCH_ROOTS"
                : "ORIGIN_SPAN_INVALID",
            selection: { fileName: sourceFile.fileName,
              textSpan: getTextSpan(keyword, sourceFile) },
            definition: { fileName: definition.fileName,
              textSpan: { start: Number.isSafeInteger(span == null ? void 0 : span.start) ? span.start : null,
                length: Number.isSafeInteger(span == null ? void 0 : span.length) ? span.length : null } }
          };
          if (originSource && !sourceFilesSet.has(originSource.fileName)
            && Number.isSafeInteger(span == null ? void 0 : span.start)
            && Number.isSafeInteger(span == null ? void 0 : span.length)
            && span.start >= 0 && span.length > 0
            && span.start + span.length <= originSource.text.length) {
            firstUnsupported ||= failure;
            return void 0;
          }
          throw failure;
        }
        const key = definition.fileName + "\\0" + span.start + "\\0" + span.length;
        let id = originBySpan.get(key);
        if (id !== void 0) return id;
        const node = getAdjustedNode(getTouchingPropertyName(originSource, span.start), options);
        if (!(node.kind === 136 /* ConstructorKeyword */ && isConstructorDeclaration(node.parent)
          || isConstructorDeclaration(node))) {
          throw new Error("ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH");
        }
        const originalSymbol = checker.getSymbolAtLocation(
          isConstructorDeclaration(node) && node.parent.name || node);
        if (!originalSymbol) throw new Error("ORIGIN_WORKLIST_UNSUPPORTED_MISSING_SYMBOL");
        const symbol = skipPastExportOrImportSpecifierOrUnion(originalSymbol, node, checker, true)
          || originalSymbol;
        const result = [];
        const state = new State(sourceFiles, sourceFilesSet, getSpecialSearchKind(node),
          checker, cancellationToken, getIntersectingMeaningFromDeclarations(node, symbol),
          options, result, worklist);
        const search = state.createSearch(node, symbol, void 0, {
          allSearchSymbols: populateSearchSymbolSet(symbol, node, checker, false, false, false)
        });
        getReferencesInContainerOrFiles(symbol, state, search);
        id = origins.length;
        originBySpan.set(key, id);
        origins.push({ definition: { fileName: definition.fileName, textSpan: span }, node, state });
        return id;
      });
      const unknown = originIds.includes(void 0);
      return { fileName: sourceFile.fileName, textSpan: getTextSpan(keyword, sourceFile),
        originIds: unknown ? [] : originIds,
        ...(unknown ? { unknownReason: "OUTSIDE_SEARCH_ROOTS" } : {}) };
    });
    if (firstUnsupported && !selections.some((selection) => selection.originIds.length)) {
      throw firstUnsupported;
    }
    worklist.drain();
    const completeOrigins = origins.map(({ definition, node, state }) => {
      const definitionSymbol = isDefinitionForReference(node) ? checker.getSymbolAtLocation(node) : void 0;
      return { definition, references: flatMap(state.result, (group) => group.definition
        ? group.references.map((reference) => toReferencedSymbolEntry(reference, definitionSymbol))
        : emptyArray) };
    });
    metrics.originStateCount = origins.length;
    metrics.constructorGroups = selections.length;
    return { selections, origins: completeOrigins, metrics,
      firstUnsupportedDetail: firstUnsupported && firstUnsupported.failureDetail };`)
  source = replaceOnce(source,
    "  Core2.bulkConstructorReferenceGroups = bulkConstructorReferenceGroups;",
    "  Core2.bulkConstructorOriginGroups = bulkConstructorOriginGroups;")
  return source
}

function patchUsageHook(v5Artifact) {
  let source = replaceOnce(v5Artifact,
    `        forEachChild(node, visit);
      }
      forEachChild(sourceFile, visit);`,
    `        if (isNewExpression(node) && isIdentifier(node.expression)) {
          constructors.push({ sourceFile, keyword: node.expression });
        }
        forEachChild(node, visit);
      }
      forEachChild(sourceFile, visit);`)
  source = replaceOnce(source,
    `        if (!(node.kind === 136 /* ConstructorKeyword */ && isConstructorDeclaration(node.parent)
          || isConstructorDeclaration(node))) {
          throw new Error("ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH");
        }`,
    `        const classNameOrigin = isIdentifier(node) && isClassLike(node.parent)
          && node.parent.name === node
          && getTextSpan(node, originSource).start === span.start
          && getTextSpan(node, originSource).length === span.length;
        if (!(node.kind === 136 /* ConstructorKeyword */ && isConstructorDeclaration(node.parent)
          || isConstructorDeclaration(node) || classNameOrigin)) {
          const failure = new Error("ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH");
          failure.failureDetail = { failedPredicate: "ADJUSTED_BRANCH",
            selection: { fileName: sourceFile.fileName,
              textSpan: getTextSpan(keyword, sourceFile) },
            definition: { fileName: definition.fileName,
              textSpan: { start: span.start, length: span.length } } };
          throw failure;
        }`)
  return source
}
