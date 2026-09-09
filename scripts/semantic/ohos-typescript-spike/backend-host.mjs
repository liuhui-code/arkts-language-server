import path from "node:path"

export function createSpikeProject(compiler, root, inputFiles, runtime = {}) {
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
  const snapshotPool = runtime.snapshotPool ?? new Map()
  let snapshotMaterializationCount = 0
  let snapshotMaterializedBytes = 0
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: (fileName) => files.get(fileName)?.version ?? "0",
    getScriptKind: (fileName) => fileName.endsWith(".ets")
      ? compiler.ScriptKind.ETS
      : compiler.getScriptKindFromFileName(fileName),
    getScriptSnapshot: (fileName) => {
      snapshotReads.set(fileName, (snapshotReads.get(fileName) ?? 0) + 1)
      const record = files.get(fileName)
      const text = record?.text ?? compiler.sys.readFile(fileName)
      if (text === undefined) return undefined
      const version = record?.version ?? "disk"
      const poolKey = fileName + "\0" + version
      const cached = snapshotPool.get(poolKey)
      if (cached?.text === text) return cached.snapshot
      const snapshot = compiler.ScriptSnapshot.fromString(text)
      snapshotPool.set(poolKey, { text, snapshot })
      snapshotMaterializationCount += 1
      snapshotMaterializedBytes += Buffer.byteLength(text)
      return snapshot
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (settings) => compiler.getDefaultLibFilePath(settings),
    fileExists: (fileName) => files.has(fileName) || compiler.sys.fileExists(fileName),
    readFile: (fileName) => files.get(fileName)?.text ?? compiler.sys.readFile(fileName),
    readDirectory: compiler.sys.readDirectory,
    useCaseSensitiveFileNames: () => compiler.sys.useCaseSensitiveFileNames,
    getNewLine: () => compiler.sys.newLine,
  }
  const registry = runtime.registry
    ?? compiler.createDocumentRegistry(compiler.sys.useCaseSensitiveFileNames, root)
  const service = compiler.createLanguageService(host, registry)
  let disposed = false
  let trimCount = 0

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
    references(relativePath, position) {
      return service.getReferencesAtPosition(this.fileName(relativePath), position) ?? []
    },
    renameInfo(relativePath, position) {
      return service.getRenameInfo(this.fileName(relativePath), position, {})
    },
    renameLocations(relativePath, position) {
      return service.findRenameLocations(
        this.fileName(relativePath),
        position,
        false,
        false,
        true,
      ) ?? []
    },
    update(relativePath, text) {
      const fileName = this.fileName(relativePath)
      const previous = files.get(fileName)
      files.set(fileName, {
        text,
        version: String(Number(previous?.version ?? "0") + 1),
      })
    },
    remove(relativePath) {
      files.delete(this.fileName(relativePath))
    },
    sourceFile(relativePath) {
      return service.getProgram()?.getSourceFile(this.fileName(relativePath))
    },
    trim() {
      if (disposed) throw new Error("Cannot trim a disposed spike context")
      if (typeof service.cleanupSemanticCache !== "function") {
        throw new Error("Official backend does not expose cleanupSemanticCache")
      }
      service.cleanupSemanticCache()
      trimCount += 1
    },
    stats() {
      return {
        projectFileCount: files.size,
        snapshotReadCount: [...snapshotReads.values()].reduce((sum, count) => sum + count, 0),
        uniqueSnapshotReadCount: snapshotReads.size,
        snapshotMaterializationCount,
        snapshotMaterializedBytes,
        trimCount,
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
