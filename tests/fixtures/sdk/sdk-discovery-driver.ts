import path from "node:path"

import { defaultHarmonySdkCandidates } from "../../../src/core/sdk/discovery.js"
import { TypeScriptLanguageServiceEngine } from "../../../src/core/types/typescript-language-service.js"
import { SemanticDocumentStore } from "../../../src/core/workspace/document-store.js"

export { discoverHarmonySdk } from "../../../src/core/sdk/discovery.js"
export { discoverProjectSdk } from "../../../src/core/sdk/project-sdk.js"
export { harmonySdkModuleCandidates } from "../../../src/core/sdk/module-resolver.js"

export function candidatesForDarwinHome(homeDirectory: string): string[] {
  return defaultHarmonySdkCandidates("darwin", homeDirectory)
}

export function sdkQueries(rootPath: string, documentPath: string, content: string) {
  const documents = new SemanticDocumentStore()
  const engine = new TypeScriptLanguageServiceEngine(rootPath)
  const position = { path: documentPath, workspaceRoot: rootPath, line: 1, column: 20 }
  documents.sync({ path: documentPath, workspaceRoot: rootPath, content, documentVersion: 1 })
  engine.prepare(documents.prepare(position))
  return {
    define: () => engine.define(position),
    defineFresh: (index: number) => {
      const fresh = { ...position, path: path.join(rootPath, `Page${index}.ets`) }
      documents.sync({ path: fresh.path, workspaceRoot: rootPath, content, documentVersion: 1 })
      engine.prepare(documents.prepare(fresh))
      return engine.define(fresh)
    },
    dispose: () => { engine.dispose(); documents.dispose() },
  }
}
