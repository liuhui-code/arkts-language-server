#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

import JSON5 from "json5"
import ts from "typescript"

const MAX_SOURCE_BYTES = 1024 * 1024
const MAX_ETS_CONFIG_BYTES = 256 * 1024

try {
  const { sourcePath, sdkRoot } = parseInputs(process.argv.slice(2))
  const sourceStat = fs.statSync(sourcePath)
  if (!sourceStat.isFile()) throw new Error("--source must identify a file")
  if (sourceStat.size > MAX_SOURCE_BYTES) {
    throw new Error(`--source exceeds ${MAX_SOURCE_BYTES} bytes`)
  }
  if (!sourcePath.endsWith(".ets")) throw new Error("--source must end in .ets")

  const emittedFiles = new Map()
  const sdk = loadSdk(sdkRoot)
  const options = {
    allowNonTsExtensions: true,
    declaration: true,
    declarationMap: true,
    emitDeclarationOnly: true,
    experimentalDecorators: true,
    lib: ["lib.es2021.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2021,
    ...sdk.compilerOptions,
  }
  const host = ts.createCompilerHost(options, true)
  host.resolveModuleNames = (moduleNames, containingFile) => moduleNames.map((moduleName) => {
    const sdkModule = sdkRoot ? resolveSdkModule(sdkRoot, moduleName) : null
    if (sdkModule) {
      return {
        resolvedFileName: sdkModule,
        extension: sdkModule.endsWith(".d.ets") ? ts.Extension.Dets : ts.Extension.Dts,
        isExternalLibraryImport: true,
      }
    }
    return ts.resolveModuleName(moduleName, containingFile, options, host).resolvedModule
  })
  const program = ts.createProgram([sourcePath, ...sdk.declarationPaths], options, host)
  const emitResult = program.emit(
    undefined,
    (fileName, text) => emittedFiles.set(path.resolve(fileName), text),
    undefined,
    true,
  )
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...emitResult.diagnostics,
  ]
  const errorDiagnostics = diagnostics.filter(({ category }) => (
    category === ts.DiagnosticCategory.Error
  ))
  const declarations = [...emittedFiles]
    .filter(([fileName]) => fileName.endsWith(".d.ets"))
    .map(([fileName, text]) => ({
      fileName: path.basename(fileName),
      relativeFileName: relativeOutputPath(sourcePath, fileName),
      text,
    }))
    .sort(compareRelativeOutput)
  const rootDeclarationName = `${path.basename(sourcePath, ".ets")}.d.ets`
  const rootDeclaration = declarations.find(({ relativeFileName }) => (
    relativeFileName === rootDeclarationName
  ))
  const sourceMaps = [...emittedFiles]
    .filter(([fileName]) => fileName.endsWith(".d.ets.map"))
    .map(([fileName, text]) => {
      const parsed = JSON.parse(text)
      return {
        fileName: path.basename(fileName),
        relativeFileName: relativeOutputPath(sourcePath, fileName),
        sources: parsed.sources,
        mappings: parsed.mappings,
      }
    })
    .sort(compareRelativeOutput)
  const rootSourceMapName = `${rootDeclarationName}.map`
  const rootSourceMap = sourceMaps.find(({ relativeFileName }) => (
    relativeFileName === rootSourceMapName
  ))
  const status = rootDeclaration && rootSourceMap && errorDiagnostics.length === 0 ? "PASS" : "FAIL"
  const report = {
    schemaVersion: 1,
    status,
    compilerVersion: ts.version,
    sourceExtension: ".ets",
    outputExtension: rootDeclaration ? ".d.ets" : null,
    declarationText: rootDeclaration?.text ?? null,
    declarations,
    sourceMaps,
    sdkDeclarationFiles: sdk.declarationPaths.length,
    programSourceFiles: program.getSourceFiles().length,
    errorDiagnostics: errorDiagnostics.length,
    diagnostics: errorDiagnostics.slice(0, 20).map(normalizeDiagnostic),
  }
  process.stdout.write(`${JSON.stringify(report)}\n`)
  if (status !== "PASS") process.exitCode = 42
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseInputs(args) {
  let sourcePath = null
  let sdkRoot = null
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1]
    if (!value) throw new Error(usage())
    if (args[index] === "--source" && sourcePath === null) sourcePath = path.resolve(value)
    else if (args[index] === "--sdk" && sdkRoot === null) sdkRoot = path.resolve(value)
    else throw new Error(usage())
  }
  if (!sourcePath) throw new Error(usage())
  return { sourcePath, sdkRoot }
}

function loadSdk(sdkRoot) {
  if (!sdkRoot) return { compilerOptions: {}, declarationPaths: [] }
  if (!fs.statSync(sdkRoot).isDirectory()) throw new Error("--sdk must identify a directory")
  const loaderRoot = path.join(sdkRoot, "ets", "build-tools", "ets-loader")
  const configPath = path.join(loaderRoot, "tsconfig.json")
  const configStat = fs.statSync(configPath)
  if (!configStat.isFile() || configStat.size > MAX_ETS_CONFIG_BYTES) {
    throw new Error("SDK ETS compiler configuration is missing or too large")
  }
  const parsed = JSON5.parse(fs.readFileSync(configPath, "utf8"))
  const ets = parsed?.compilerOptions?.ets
  if (!ets || typeof ets !== "object" || Array.isArray(ets)) {
    throw new Error("SDK ETS compiler configuration has no compilerOptions.ets")
  }
  const ambientDeclaration = [
    path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    path.join(sdkRoot, "ets", "component", "common.d.ts"),
    path.join(sdkRoot, "ets", "component", "arkui.d.ts"),
  ].find((candidate) => fs.existsSync(candidate))
  const declarationPaths = ambientDeclaration ? [ambientDeclaration] : []
  return {
    compilerOptions: { ets, etsLoaderPath: loaderRoot },
    declarationPaths,
  }
}

function usage() {
  return "usage: ets-declaration-facade-spike.mjs --source <file.ets> [--sdk <sdk-root>]"
}

function relativeOutputPath(sourcePath, outputPath) {
  return path.relative(path.dirname(sourcePath), outputPath).split(path.sep).join("/")
}

function compareRelativeOutput(left, right) {
  if (left.relativeFileName < right.relativeFileName) return -1
  if (left.relativeFileName > right.relativeFileName) return 1
  return 0
}

function resolveSdkModule(sdkRoot, moduleName) {
  if (moduleName.includes("/") || moduleName.includes("\\")) return null
  let directories
  if (moduleName.startsWith("@ohos.") || moduleName.startsWith("@system.")) {
    directories = [
      path.join(sdkRoot, "ets", "api"),
      path.join(sdkRoot, "js", "api"),
    ]
  } else if (moduleName.startsWith("@kit.")) {
    directories = [path.join(sdkRoot, "ets", "kits")]
  } else if (moduleName.startsWith("@arkts.")) {
    directories = [path.join(sdkRoot, "ets", "arkts")]
  } else {
    return null
  }
  for (const directory of directories) {
    for (const extension of [".d.ts", ".d.ets"]) {
      const candidate = path.join(directory, `${moduleName}${extension}`)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

function normalizeDiagnostic(diagnostic) {
  const location = diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    : null
  return {
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    fileName: diagnostic.file ? path.basename(diagnostic.file.fileName) : null,
    line: location ? location.line + 1 : null,
    character: location ? location.character + 1 : null,
  }
}
