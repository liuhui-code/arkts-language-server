#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

const QUERY_MARKER = "/*@query*/"
const MAX_SOURCE_BYTES = 1024 * 1024

try {
  const { declarationPath, consumerPath, sdkRoot, line, character } = parseInputs(process.argv.slice(2))
  const declarationText = readSource(declarationPath)
  const consumerText = readSource(consumerPath)
  const queryMarker = consumerText.indexOf(QUERY_MARKER)
  let queryPosition
  if (line !== null && character !== null) {
    queryPosition = checkedOffsetAt(consumerText, line, character)
  } else {
    if (queryMarker === -1 || consumerText.indexOf(QUERY_MARKER, queryMarker + 1) !== -1) {
      throw new Error("--consumer must contain exactly one /*@query*/ marker or an explicit position")
    }
    queryPosition = queryMarker + QUERY_MARKER.length
  }

  const emitRunner = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "ets-declaration-facade-spike.mjs",
  )
  const emitArgs = [emitRunner, "--source", declarationPath]
  if (sdkRoot) emitArgs.push("--sdk", sdkRoot)
  const emitted = spawnSync(process.execPath, emitArgs, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  })
  if (emitted.status !== 0) {
    process.stdout.write(emitted.stdout)
    process.stderr.write(emitted.stderr)
    process.exitCode = emitted.status ?? 42
  } else {
    const facadeReport = JSON.parse(emitted.stdout)
    const facadeFiles = new Map()
    const replacements = new Map()
    const remaps = new Map()
    for (const declaration of facadeReport.declarations) {
      const facadePath = path.resolve(path.dirname(declarationPath), declaration.relativeFileName)
      const sourceMap = facadeReport.sourceMaps.find(({ relativeFileName }) => (
        relativeFileName === `${declaration.relativeFileName}.map`
      ))
      if (!sourceMap || sourceMap.sources.length !== 1) {
        throw new Error(`emitted façade has no single-source map: ${declaration.fileName}`)
      }
      const sourcePath = path.resolve(path.dirname(facadePath), sourceMap.sources[0])
      const sourceText = readSource(sourcePath)
      facadeFiles.set(facadePath, declaration.text)
      replacements.set(sourcePath, facadePath)
      remaps.set(facadePath, {
        facadePath,
        sourcePath,
        sourceText,
        facadeText: declaration.text,
        mappings: sourceMap.mappings,
      })
    }

    const source = queryService({
      roots: [consumerPath, declarationPath],
      files: new Map([
        [consumerPath, consumerText],
        [declarationPath, declarationText],
      ]),
      queryPath: consumerPath,
      queryPosition,
    })
    const facadeConsumer = queryService({
      roots: [consumerPath, ...facadeFiles.keys()],
      files: new Map([
        [consumerPath, consumerText],
        ...facadeFiles,
      ]),
      queryPath: consumerPath,
      queryPosition,
      replacements,
      remaps,
    })
    const definitionTarget = source.definitionTarget
    if (!definitionTarget) throw new Error("source query has no definition target")
    const ownerPath = path.resolve(definitionTarget.fileName)
    const ownerFacadePath = replacements.get(ownerPath)
    if (!ownerFacadePath) throw new Error("source definition is outside emitted façade closure")
    const ownerFiles = new Map(facadeFiles)
    ownerFiles.delete(ownerFacadePath)
    ownerFiles.set(ownerPath, readSource(ownerPath))
    const ownerReplacements = new Map(replacements)
    ownerReplacements.delete(ownerPath)
    const ownerRemaps = new Map(remaps)
    ownerRemaps.delete(ownerFacadePath)
    const owner = queryService({
      roots: [ownerPath, ...ownerFiles.keys()],
      files: ownerFiles,
      queryPath: ownerPath,
      queryPosition: definitionTarget.start,
      replacements: ownerReplacements,
      remaps: ownerRemaps,
    })
    const facade = {
      ...facadeConsumer,
      references: uniqueSorted([...facadeConsumer.references, ...owner.references]),
      facadeOnlyReferences: facadeConsumer.references,
      ownerReferences: owner.references,
      programSourceFiles: Math.max(facadeConsumer.programSourceFiles, owner.programSourceFiles),
      programTextBytes: Math.max(facadeConsumer.programTextBytes, owner.programTextBytes),
      programAstNodes: Math.max(facadeConsumer.programAstNodes, owner.programAstNodes),
      ownerProgramSourceFiles: owner.programSourceFiles,
      ownerProgramTextBytes: owner.programTextBytes,
      ownerProgramAstNodes: owner.programAstNodes,
      ownerSourceFiles: 1,
    }
    delete source.definitionTarget
    delete facade.definitionTarget
    delete facadeConsumer.definitionTarget
    delete owner.definitionTarget
    const definitionExact = sameLocations(source.definition, facade.definition)
    const referencesExact = sameLocations(source.references, facade.references)
    const status = definitionExact && referencesExact && !facade.loadedSourceDeclaration
      ? "PASS"
      : "FAIL"
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      status,
      compilerVersion: ts.version,
      definitionExact,
      referencesExact,
      source,
      facade,
    })}\n`)
    if (status !== "PASS") process.exitCode = 42
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function queryService({
  roots,
  files,
  queryPath,
  queryPosition,
  replacements,
  remaps,
}) {
  const options = {
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true,
    lib: ["lib.es2021.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2021,
  }
  const canonicalFiles = new Map([...files].map(([fileName, text]) => [path.resolve(fileName), text]))
  const moduleHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: (fileName) => canonicalFiles.has(path.resolve(fileName)) || ts.sys.fileExists(fileName),
    getCurrentDirectory: () => path.dirname(queryPath),
    getDirectories: ts.sys.getDirectories,
    readFile: (fileName) => canonicalFiles.get(path.resolve(fileName)) ?? ts.sys.readFile(fileName),
    realpath: ts.sys.realpath,
  }
  const host = {
    ...moduleHost,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (compilerOptions) => ts.getDefaultLibFilePath(compilerOptions),
    getNewLine: () => ts.sys.newLine,
    getProjectVersion: () => "1",
    getScriptFileNames: () => roots,
    getScriptSnapshot: (fileName) => {
      const text = moduleHost.readFile(fileName)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getScriptVersion: () => "1",
    readDirectory: ts.sys.readDirectory,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    resolveModuleNames: (moduleNames, containingFile) => moduleNames.map((moduleName) => {
      const resolved = ts.resolveModuleName(moduleName, containingFile, options, moduleHost).resolvedModule
      if (!resolved || !replacements) return resolved
      const facadePath = replacements.get(path.resolve(resolved.resolvedFileName))
      if (!facadePath) return resolved
      return {
        resolvedFileName: facadePath,
        extension: ts.Extension.Dets,
      }
    }),
  }
  const service = ts.createLanguageService(host)
  try {
    const normalize = (fileName, textSpan) => normalizeLocation(fileName, textSpan, remaps)
    const rawDefinition = service.getDefinitionAtPosition(queryPath, queryPosition) ?? []
    const definition = rawDefinition.map((entry) => normalize(entry.fileName, entry.textSpan))
    const references = (service.findReferences(queryPath, queryPosition) ?? [])
      .flatMap(({ references: entries }) => entries.map((entry) => normalize(entry.fileName, entry.textSpan)))
    const program = service.getProgram()
    const sourceFiles = program?.getSourceFiles() ?? []
    return {
      definition: uniqueSorted(definition),
      definitionTarget: rawDefinition[0]
        ? { fileName: rawDefinition[0].fileName, start: rawDefinition[0].textSpan.start }
        : null,
      references: uniqueSorted(references),
      programSourceFiles: sourceFiles.length,
      programTextBytes: sourceFiles.reduce((total, sourceFile) => total + sourceFile.text.length, 0),
      programAstNodes: sourceFiles.reduce((total, sourceFile) => total + countAstNodes(sourceFile), 0),
      loadedSourceDeclaration: sourceFiles.some(({ fileName }) => (
        replacements?.has(path.resolve(fileName))
      )),
      loadedSourceDeclarations: sourceFiles.filter(({ fileName }) => (
        replacements?.has(path.resolve(fileName))
      )).length,
    }
  } finally {
    service.dispose()
  }
}

function countAstNodes(sourceFile) {
  let count = 0
  const visit = (node) => {
    count += 1
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return count
}

function normalizeLocation(fileName, textSpan, remaps) {
  const remap = remaps?.get(path.resolve(fileName))
  if (!remap) {
    return { fileName: path.basename(fileName), start: textSpan.start, length: textSpan.length }
  }
  const start = remapOffset(textSpan.start, remap)
  const end = textSpan.length === 0
    ? start
    : remapOffset(textSpan.start + textSpan.length - 1, remap) + 1
  return {
    fileName: path.basename(remap.sourcePath),
    start,
    length: end - start,
  }
}

function remapOffset(offset, remap) {
  const generated = lineAndCharacter(remap.facadeText, offset)
  const original = originalPositionForGenerated(
    remap.mappings,
    generated.line,
    generated.character,
  )
  if (!original) throw new Error("declaration map has no segment for semantic location")
  return offsetAt(remap.sourceText, original.line, original.character)
}

function originalPositionForGenerated(mappings, targetLine, targetColumn) {
  const state = { source: 0, originalLine: 0, originalColumn: 0 }
  const lines = mappings.split(";")
  for (let line = 0; line <= targetLine; line += 1) {
    let generatedColumn = 0
    let best = null
    for (const segment of (lines[line] ?? "").split(",").filter(Boolean)) {
      const fields = decodeSourceMapSegment(segment)
      generatedColumn += fields[0]
      if (fields.length < 4) continue
      state.source += fields[1]
      state.originalLine += fields[2]
      state.originalColumn += fields[3]
      if (state.source === 0 && line === targetLine && generatedColumn <= targetColumn) {
        best = {
          line: state.originalLine,
          character: state.originalColumn + targetColumn - generatedColumn,
        }
      }
    }
    if (line === targetLine) return best
  }
  return null
}

function decodeSourceMapSegment(segment) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const values = []
  let value = 0
  let shift = 0
  for (const character of segment) {
    const digit = alphabet.indexOf(character)
    if (digit === -1) throw new Error("invalid declaration map VLQ")
    value += (digit & 31) << shift
    if ((digit & 32) !== 0) {
      shift += 5
      continue
    }
    values.push((value >> 1) * ((value & 1) === 1 ? -1 : 1))
    value = 0
    shift = 0
  }
  return values
}

function lineAndCharacter(text, offset) {
  const prefix = text.slice(0, offset)
  const lines = prefix.split("\n")
  return { line: lines.length - 1, character: lines.at(-1).length }
}

function offsetAt(text, targetLine, targetCharacter) {
  const lines = text.split("\n")
  let offset = 0
  for (let line = 0; line < targetLine; line += 1) offset += lines[line].length + 1
  return offset + targetCharacter
}

function checkedOffsetAt(text, targetLine, targetCharacter) {
  const lines = text.split("\n")
  if (targetLine < 0 || targetLine >= lines.length) throw new Error("--line is outside --consumer")
  if (targetCharacter < 0 || targetCharacter > lines[targetLine].length) {
    throw new Error("--character is outside --consumer line")
  }
  return offsetAt(text, targetLine, targetCharacter)
}

function uniqueSorted(locations) {
  const unique = new Map(locations.map((location) => [JSON.stringify(location), location]))
  return [...unique.values()].sort((left, right) => (
    left.fileName.localeCompare(right.fileName)
    || left.start - right.start
    || left.length - right.length
  ))
}

function sameLocations(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function readSource(fileName) {
  const stat = fs.statSync(fileName)
  if (!stat.isFile()) throw new Error("source input must identify a file")
  if (stat.size > MAX_SOURCE_BYTES) throw new Error(`source input exceeds ${MAX_SOURCE_BYTES} bytes`)
  return fs.readFileSync(fileName, "utf8")
}

function parseInputs(args) {
  const parsed = {
    declarationPath: null,
    consumerPath: null,
    sdkRoot: null,
    line: null,
    character: null,
  }
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1]
    if (!value) throw new Error(usage())
    if (args[index] === "--declaration" && !parsed.declarationPath) {
      parsed.declarationPath = path.resolve(value)
    } else if (args[index] === "--consumer" && !parsed.consumerPath) {
      parsed.consumerPath = path.resolve(value)
    } else if (args[index] === "--sdk" && !parsed.sdkRoot) {
      parsed.sdkRoot = path.resolve(value)
    } else if (args[index] === "--line" && parsed.line === null && /^\d+$/u.test(value)) {
      parsed.line = Number(value)
    } else if (args[index] === "--character" && parsed.character === null && /^\d+$/u.test(value)) {
      parsed.character = Number(value)
    } else {
      throw new Error(usage())
    }
  }
  if (!parsed.declarationPath || !parsed.consumerPath) throw new Error(usage())
  if ((parsed.line === null) !== (parsed.character === null)) throw new Error(usage())
  if (!parsed.declarationPath.endsWith(".ets") || !parsed.consumerPath.endsWith(".ets")) {
    throw new Error("--declaration and --consumer must end in .ets")
  }
  return parsed
}

function usage() {
  return "usage: ets-declaration-facade-consumer-spike.mjs --declaration <file.ets> --consumer <file.ets> [--line <0-based> --character <UTF-16>] [--sdk <sdk-root>]"
}
