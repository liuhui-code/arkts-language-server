import path from "node:path"

export function createSpikeProject(compiler, root, inputFiles) {
  const files = new Map()
  for (const [relativePath, text] of Object.entries(inputFiles)) {
    const fileName = path.resolve(root, ...relativePath.split("/"))
    files.set(fileName, { text, version: "1" })
  }
  const options = {
    target: compiler.ScriptTarget.ES2021,
    module: compiler.ModuleKind.ESNext,
    moduleResolution: compiler.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    skipLibCheck: true,
  }
  const snapshotReads = new Map()
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: (fileName) => files.get(fileName)?.version ?? "0",
    getScriptKind: (fileName) => fileName.endsWith(".ets")
      ? compiler.ScriptKind.ETS
      : compiler.getScriptKindFromFileName(fileName),
    getScriptSnapshot: (fileName) => {
      snapshotReads.set(fileName, (snapshotReads.get(fileName) ?? 0) + 1)
      const text = files.get(fileName)?.text ?? compiler.sys.readFile(fileName)
      return text === undefined ? undefined : compiler.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (settings) => compiler.getDefaultLibFilePath(settings),
    fileExists: (fileName) => files.has(fileName) || compiler.sys.fileExists(fileName),
    readFile: (fileName) => files.get(fileName)?.text ?? compiler.sys.readFile(fileName),
    readDirectory: compiler.sys.readDirectory,
    useCaseSensitiveFileNames: () => compiler.sys.useCaseSensitiveFileNames,
    getNewLine: () => compiler.sys.newLine,
  }
  const registry = compiler.createDocumentRegistry(compiler.sys.useCaseSensitiveFileNames, root)
  const service = compiler.createLanguageService(host, registry)
  let disposed = false

  return {
    fileName(relativePath) {
      return path.resolve(root, ...relativePath.split("/"))
    },
    syntacticDiagnostics(relativePath) {
      return service.getSyntacticDiagnostics(this.fileName(relativePath))
    },
    semanticDiagnostics(relativePath) {
      return service.getSemanticDiagnostics(this.fileName(relativePath))
    },
    completions(relativePath, position) {
      return service.getCompletionsAtPosition(this.fileName(relativePath), position, {
        includeCompletionsForModuleExports: true,
        includeInsertTextCompletions: true,
      })
    },
    definitions(relativePath, position) {
      return service.getDefinitionAtPosition(this.fileName(relativePath), position) ?? []
    },
    sourceFile(relativePath) {
      return service.getProgram()?.getSourceFile(this.fileName(relativePath))
    },
    stats() {
      return {
        projectFileCount: files.size,
        snapshotReadCount: [...snapshotReads.values()].reduce((sum, count) => sum + count, 0),
        uniqueSnapshotReadCount: snapshotReads.size,
        disposed,
      }
    },
    dispose() {
      if (disposed) return
      service.dispose()
      disposed = true
    },
  }
}

export function materializeMarkedFixture(markedText, marker = "/*@query*/") {
  const position = markedText.indexOf(marker)
  if (position < 0 || markedText.indexOf(marker, position + marker.length) >= 0) {
    throw new Error("Fixture must contain exactly one query marker")
  }
  return {
    text: markedText.slice(0, position) + markedText.slice(position + marker.length),
    position,
  }
}

export function diagnosticIdentity(compiler, diagnostic) {
  return {
    code: diagnostic.code,
    start: diagnostic.start ?? null,
    length: diagnostic.length ?? null,
    message: compiler.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  }
}
