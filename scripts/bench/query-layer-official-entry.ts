import fs from "node:fs"
import path from "node:path"
import type ts from "typescript"

import { LocalPackageResolver } from "../../src/core/sdk/local-package-resolver.js"
import { TypeScriptLanguageServiceEngine } from "../../src/core/types/typescript-language-service.js"
import { SemanticDocumentStore } from "../../src/core/workspace/document-store.js"
import type { ProjectSdkSelection } from "../../src/core/sdk/project-sdk.js"
import { queryOfficialCallHierarchy } from "./query-layer-call-hierarchy.js"

interface Target {
  id: string; kind: string; file: string; includeDeclaration?: boolean
  callHierarchyTargetId?: string; callHierarchySelector?: { name: string; kind?: number }
  position: { line: number; character: number }
}
interface Suite {
  workspace: string; sdk: string; targets: Target[]
  preOpenTargetIds?: string[]
  scenarios: Array<{ id: string; targetId: string; bucket: string; edit?: unknown
    resolvedOverlay?: { path: string; text: string; version: number } }>
}
interface Capture {
  calls: number; targetQueryCalls: number; host?: ts.LanguageServiceHost; service?: ts.LanguageService
  mark?: (phase: string, details?: Record<string, unknown>) => void
}

/** Direct official queries with the same production Host, not another compiler or simplified resolver. */
export function runOfficialLayer(suite: Suite, capture: Capture) {
  const resolver = new LocalPackageResolver()
  resolver.enableConfigurationWitness()
  const documents = new SemanticDocumentStore({ packageResolver: resolver })
  let engine: TypeScriptLanguageServiceEngine | undefined
  let selected: ProjectSdkSelection | undefined
  try {
    const initial = documents.prepareRoot(suite.workspace)
    if (initial?.projectMembership?.status !== "complete") throw new Error("QUERY_LAYER_MEMBERSHIP_INCOMPLETE")
    engine = new TypeScriptLanguageServiceEngine(suite.workspace, {
      packageResolver: resolver, projectFileAccess: documents,
      sdkConfiguration: { path: suite.sdk }, sdkAmbientProfile: "full", residentReferenceReuse: true,
      onSdkSelected: (_root, sdk) => { selected = sdk },
    })
    if (!selected?.ready || selected.identity?.status !== "identified"
      || fs.realpathSync(selected.path!) !== fs.realpathSync(suite.sdk)) throw new Error("QUERY_LAYER_SDK_UNAVAILABLE")
    const prepareStarted = performance.now()
    capture.mark?.("preparation-start")
    engine.prepare(initial)
    const service = capture.service
    if (!service || !capture.host || capture.calls !== 1) throw new Error("QUERY_LAYER_HOST_UNAVAILABLE")
    const program = service.getProgram()
    program?.getTypeChecker()
    const semanticReadiness = engine.semanticReadiness(initial, true)
    const preparationMs = performance.now() - prepareStarted
    const targetQueries = capture.targetQueryCalls
    capture.mark?.("preparation-complete", { semanticState: semanticReadiness.semanticState })
    if (!program || !initial.projectMembership.paths.every(file => program.getSourceFile(file))) {
      throw new Error("QUERY_LAYER_COVERAGE_INCOMPLETE")
    }
    for (const id of suite.preOpenTargetIds ?? []) {
      const target = suite.targets.find(item => item.id === id)!
      const filePath = path.resolve(suite.workspace, target.file)
      documents.sync({ path: filePath, content: fs.readFileSync(filePath, "utf8"),
        documentVersion: 1, workspaceRoot: suite.workspace })
    }
    const requests = []
    const callItems = new Map<string, readonly ts.CallHierarchyItem[]>()
    for (const scenario of suite.scenarios) {
      const failureStarted = performance.now()
      try {
        if (["after-eviction", "pressure-recovery-repeat", "restart-after-validated-ready"].includes(scenario.bucket)) {
          throw new Error(`QUERY_LAYER_CONTROL_UNSUPPORTED:${scenario.bucket}`)
        }
        const target = suite.targets.find(item => item.id === scenario.targetId)
        if (!target || !["references", "implementation", "definition", "prepareCallHierarchy", "incomingCalls"].includes(target.kind)) throw new Error("QUERY_LAYER_SCENARIO_UNSUPPORTED")
        if (scenario.resolvedOverlay) {
          documents.sync({ path: scenario.resolvedOverlay.path, content: scenario.resolvedOverlay.text,
            documentVersion: scenario.resolvedOverlay.version, workspaceRoot: suite.workspace })
        }
        const filePath = path.resolve(suite.workspace, target.file)
        const position = { path: filePath, workspaceRoot: suite.workspace,
          line: target.position.line + 1, column: target.position.character + 1 }
        const prepareAt = performance.now()
        capture.mark?.("query-start", { scenarioId: scenario.id, targetId: target.id })
        engine.prepare(documents.prepare(position, true))
        const ownerPreparationMs = performance.now() - prepareAt
        const text = capture.host.getScriptSnapshot(filePath)
        if (!text) throw new Error("QUERY_LAYER_SOURCE_UNAVAILABLE")
        const contents = text.getText(0, text.getLength())
        const lines = contents.split("\n")
        const offset = lines.slice(0, target.position.line).reduce((size, line) => size + line.length + 1, 0)
          + target.position.character
        const started = performance.now()
        let raw: readonly ts.DocumentSpan[] = []
        let callPayload: ReturnType<typeof queryOfficialCallHierarchy> | undefined
        if (["prepareCallHierarchy", "incomingCalls"].includes(target.kind)) {
          callPayload = queryOfficialCallHierarchy(service, filePath, offset, target, suite.workspace, callItems)
        } else if (target.kind === "implementation") {
          raw = service.getImplementationAtPosition(filePath, offset) ?? []
        } else if (target.kind === "definition") {
          raw = service.getDefinitionAtPosition(filePath, offset) ?? []
        } else {
          const definitions = service.getDefinitionAtPosition(filePath, offset) ?? []
          const declarationKeys = new Set(definitions.map(item => spanKey(item.fileName, item.textSpan)))
          raw = definitions.flatMap(definition => service.findReferences(definition.fileName, definition.textSpan.start) ?? [])
            .flatMap(symbol => symbol.references)
            .filter(item => target.includeDeclaration || !(item.isDefinition || declarationKeys.has(spanKey(item.fileName, item.textSpan))))
        }
        const compilerQueryMs = performance.now() - started
        const locations = [...new Map(raw.map(item => {
          const source = service.getProgram()?.getSourceFile(item.fileName)
          if (!source) throw new Error("QUERY_LAYER_RESULT_SOURCE_UNAVAILABLE")
          const relative = path.relative(suite.workspace, path.resolve(item.fileName))
          if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw new Error("QUERY_LAYER_RESULT_OUTSIDE_WORKSPACE")
          }
          const range = { start: source.getLineAndCharacterOfPosition(item.textSpan.start),
            end: source.getLineAndCharacterOfPosition(item.textSpan.start + item.textSpan.length) }
          const location = { file: relative.split(path.sep).join("/"), range }
          return [JSON.stringify(location), location] as const
        })).values()]
        requests.push({ scenarioId: scenario.id, targetId: target.id, bucket: scenario.bucket,
          elapsedMs: ownerPreparationMs + compilerQueryMs, ownerPreparationMs, compilerQueryMs,
          locations, ...(callPayload ? { payload: callPayload() } : {}), answerCacheHit: false, memory: process.memoryUsage() })
        capture.mark?.("query-complete", { scenarioId: scenario.id, targetId: target.id, request: requests.at(-1) })
      } catch (error) {
        const failure = error instanceof Error ? error.message : String(error)
        requests.push({ scenarioId: scenario.id, targetId: scenario.targetId, bucket: scenario.bucket,
          elapsedMs: performance.now() - failureStarted, terminalStatus: "error", failure,
          answerCacheHit: false, memory: process.memoryUsage() })
        capture.mark?.("query-failed", { scenarioId: scenario.id, targetId: scenario.targetId, failure })
        break
      }
    }
    return { hostParity: "PRODUCTION_HOST", membershipFiles: initial.projectMembership.paths.length,
      officialServiceStarts: capture.calls, preparationMs, requests,
      preparation: { elapsedMs: preparationMs, semanticReadiness, targetQueries },
      memory: { process: process.memoryUsage(), maximumRssBytes: process.resourceUsage().maxRSS * 1024 } }
  } finally {
    engine?.dispose()
    documents.dispose()
  }
}

function spanKey(file: string, span: ts.TextSpan) { return JSON.stringify([path.resolve(file), span.start, span.length]) }
