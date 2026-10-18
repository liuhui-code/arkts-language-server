import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { DocumentSnapshot } from "../../src/contracts/document.js"
import type { SemanticCallHierarchyItem } from "../../src/contracts/semantic-engine.js"
import type { StructuredLogger } from "../../src/observability/logger.js"
import { SidecarWorkspaceIndex } from "../../src/index/sidecar-workspace-index.js"
import { SingleRootProjectResolver } from "../../src/project/single-root-project-resolver.js"
import { SemanticWorkerEngine } from "../../src/semantic/semantic-worker-proxy.js"
import { DefaultWorkspaceSymbolService } from "../../src/workspace/default-workspace-symbol-service.js"
import { boundedCallHierarchyItems, boundedIncomingCalls } from "../../src/lsp/call-hierarchy-adapter.js"
import { observeOwnerPressure } from "./query-layer-pressure.js"

interface Suite {
  workspace: string; sdk: string; server: string; sidecar: string; outputPath: string
  runtime: { env: NodeJS.ProcessEnv; timeoutMs: number }
  preOpenTargetIds?: string[]
  targets: Array<{ id: string; kind: string; file: string; includeDeclaration?: boolean
    callHierarchyTargetId?: string; callHierarchySelector?: { name: string; kind?: number }
    position: { line: number; character: number } }>
  scenarios: Array<{ id: string; targetId: string; bucket: string
    resolvedOverlay?: { path: string; text: string; version: number } }>
}

/** Calls the production semantic port, including candidate planning and Worker IPC, without LSP scheduling. */
export async function runOwnerLayer(suite: Suite,
  capture: { mark?: (phase: string, details?: Record<string, unknown>) => void } = {}) {
  const rootUri = pathToFileURL(suite.workspace).href
  const environment: NodeJS.ProcessEnv & { ARKTS_MEMORY_METRICS_FILE: string } = { ...process.env, ...suite.runtime.env,
    ARKTS_MEMORY_METRICS_FILE: `${suite.outputPath}.metrics.jsonl` }
  if (fs.existsSync(environment.ARKTS_MEMORY_METRICS_FILE)) throw new Error("QUERY_LAYER_METRICS_EXISTS")
  const events: Array<{ event: string; monotonicMs: number; [key: string]: unknown }> = []
  const record: StructuredLogger["info"] = (event, fields) => {
    events.push({ ...fields, event, monotonicMs: performance.now() })
  }
  const index = new SidecarWorkspaceIndex({ env: environment, sidecarPath: suite.sidecar })
  const semantic = new SemanticWorkerEngine(new SingleRootProjectResolver(rootUri),
    { info: record, error: record }, { env: environment, exportIndex: index, referenceIndex: index,
      workerPath: path.join(path.dirname(suite.server), "semantic-worker.cjs") })
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-owner-layer-index-"))
  const workspaceSymbols = new DefaultWorkspaceSymbolService({ index, catalog: index, semantic, cacheDirectory })
  const documents = new Map<string, DocumentSnapshot>()
  const sync = (file: string, text: string, version: number) => {
    const uri = pathToFileURL(file).href
    const document = { uri, workspaceId: rootUri, text, version }
    documents.set(uri, document)
    semantic.sync(document)
    workspaceSymbols.sync(document)
    return document
  }
  try {
    semantic.configureSdk({ path: suite.sdk })
    const catalogAt = performance.now()
    capture.mark?.("catalog-start")
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("QUERY_LAYER_CATALOG_TIMEOUT")), suite.runtime.timeoutMs)
      workspaceSymbols.start([{ id: rootUri, rootUri }], progress => {
        if (progress.phase === "ready") { clearTimeout(timer); resolve() }
        else if (["degraded", "cancelled"].includes(progress.phase)) {
          clearTimeout(timer); reject(new Error("QUERY_LAYER_CATALOG_INCOMPLETE"))
        }
      })
    })
    const catalogMs = performance.now() - catalogAt
    capture.mark?.("catalog-complete")
    const prepareAt = performance.now()
    capture.mark?.("preparation-start")
    const semanticReadiness = await semantic.semanticReadiness({ rootUri, prepare: true,
      signal: AbortSignal.timeout(suite.runtime.timeoutMs) })
    const preparationMs = performance.now() - prepareAt
    capture.mark?.("preparation-complete", { semanticState: semanticReadiness.semanticState })
    for (const id of suite.preOpenTargetIds ?? []) {
      const target = suite.targets.find(item => item.id === id)!
      const file = path.resolve(suite.workspace, target.file)
      sync(file, fs.readFileSync(file, "utf8"), 1)
    }
    const requests = []
    const callItems = new Map<string, readonly SemanticCallHierarchyItem[]>()
    const attempted = new Set<string>()
    const completed = new Set<string>()
    for (const scenario of suite.scenarios) {
      const failureStarted = performance.now()
      let querySignal: AbortSignal | undefined
      try {
        if (scenario.bucket === "restart-after-validated-ready"
          || ["after-eviction", "pressure-recovery-repeat"].includes(scenario.bucket) && (environment.ARKTS_BENCHMARK_CONTROL !== "1"
            || environment.ARKTS_REFERENCES_TRACE !== "1")) {
          throw new Error(`QUERY_LAYER_CONTROL_UNSUPPORTED:${scenario.bucket}`)
        }
        const target = suite.targets.find(item => item.id === scenario.targetId)
        if (!target || !["references", "implementation", "definition", "prepareCallHierarchy", "incomingCalls"].includes(target.kind)) throw new Error("QUERY_LAYER_SCENARIO_UNSUPPORTED")
        const identity = JSON.stringify([target.kind, target.file, target.position, target.includeDeclaration,
          target.callHierarchyTargetId, target.callHierarchySelector])
        let control
        if (scenario.resolvedOverlay) completed.clear()
        if (["after-eviction", "pressure-recovery-repeat"].includes(scenario.bucket)) {
          if (scenario.bucket === "after-eviction" && (attempted.size === 0 || attempted.has(identity))) {
            throw new Error("QUERY_LAYER_UNSEEN_RECOVERY_TARGET_REQUIRED")
          }
          if (scenario.bucket === "pressure-recovery-repeat" && !completed.has(identity)) {
            throw new Error("QUERY_LAYER_COMPLETE_SNAPSHOT_REQUIRED")
          }
          control = await observeOwnerPressure(semantic, events, suite.runtime.timeoutMs, scenario.id, capture.mark)
        }
        attempted.add(identity)
        if (scenario.resolvedOverlay) sync(scenario.resolvedOverlay.path,
          scenario.resolvedOverlay.text, scenario.resolvedOverlay.version)
        const file = path.resolve(suite.workspace, target.file)
        const document = documents.get(pathToFileURL(file).href) ?? sync(file, fs.readFileSync(file, "utf8"), 1)
        const query = { document, position: target.position, signal: querySignal = AbortSignal.timeout(suite.runtime.timeoutMs) }
        const eventStart = events.length
        const started = performance.now()
        capture.mark?.("query-start", { scenarioId: scenario.id, targetId: target.id })
        if (["prepareCallHierarchy", "incomingCalls"].includes(target.kind)) {
          let payload
          if (target.kind === "prepareCallHierarchy") {
            const response = await semantic.prepareCallHierarchy(query)
            if (response.documentVersion !== document.version) throw new Error("QUERY_LAYER_STALE_RESULT")
            if (response.value.status !== "complete") throw new Error(`QUERY_LAYER_OWNER_INCOMPLETE:${response.value.reason}`)
            callItems.set(target.id, response.value.items)
            payload = boundedCallHierarchyItems(response.value.items, rootUri)
          } else {
            const selector = target.callHierarchySelector!
            const selected = (callItems.get(target.callHierarchyTargetId!) ?? []).filter(item => {
              const mapped = boundedCallHierarchyItems([item], rootUri)[0]
              return mapped.name === selector.name && (selector.kind === undefined || mapped.kind === selector.kind)
            })
            if (selected.length !== 1) throw new Error("QUERY_LAYER_CALL_SOURCE_UNAVAILABLE")
            const item = selected[0]
            const open = documents.get(item.uri)
            const source = open ? { kind: "open" as const, document: open, workspaceRootUri: rootUri }
              : { kind: "disk" as const, uri: item.uri, text: fs.readFileSync(fileURLToPath(item.uri), "utf8"),
                workspaceId: rootUri, workspaceRootUri: rootUri }
            const outcome = await semantic.incomingCalls({ source, item, signal: query.signal })
            if (outcome.status !== "complete") throw new Error(`QUERY_LAYER_OWNER_INCOMPLETE:${outcome.status}`)
            payload = boundedIncomingCalls(outcome.calls, rootUri)
          }
          const elapsedMs = performance.now() - started
          requests.push({ scenarioId: scenario.id, targetId: target.id, bucket: scenario.bucket, elapsedMs,
            startedMs: started, completedMs: started + elapsedMs, payload, control, terminalStatus: "complete",
            answerCacheHit: false, memory: process.memoryUsage() })
          completed.add(identity)
          capture.mark?.("query-complete", { scenarioId: scenario.id, targetId: target.id, request: requests.at(-1) })
          continue
        }
        const response = target.kind === "references"
          ? await semantic.references({ ...query, includeDeclaration: target.includeDeclaration! })
          : target.kind === "definition" ? await semantic.define(query)
          : await semantic.implementations(query)
        const elapsedMs = performance.now() - started
        if (response.documentVersion !== document.version) throw new Error("QUERY_LAYER_STALE_RESULT")
        const outcome = response.value
        const terminalStatus = Array.isArray(outcome) ? "complete" : outcome.status
        if (!Array.isArray(outcome) && outcome.status !== "complete") {
          throw new Error(`QUERY_LAYER_OWNER_INCOMPLETE:${outcome.reason}`)
        }
        const raw = Array.isArray(outcome) ? outcome : outcome.references
        const locations = raw.map(item => {
          const relative = path.relative(suite.workspace, fileURLToPath(item.uri))
          if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw new Error("QUERY_LAYER_RESULT_OUTSIDE_WORKSPACE")
          }
          return { file: relative.split(path.sep).join("/"), range: item.range }
        })
        requests.push({ scenarioId: scenario.id, targetId: target.id, bucket: scenario.bucket, elapsedMs,
          startedMs: started, completedMs: started + elapsedMs, locations, control, terminalStatus,
          answerCacheHit: events.slice(eventStart).some(event => event.event === "references.cache.hit"),
          memory: process.memoryUsage() })
        completed.add(identity)
        capture.mark?.("query-complete", { scenarioId: scenario.id, targetId: target.id, request: requests.at(-1) })
      } catch (error) {
        const failure = error instanceof Error ? error.message : String(error)
        requests.push({ scenarioId: scenario.id, targetId: scenario.targetId, bucket: scenario.bucket,
          elapsedMs: performance.now() - failureStarted,
          terminalStatus: querySignal?.aborted ? "timeout" : "error", failure,
          answerCacheHit: false, memory: process.memoryUsage() })
        capture.mark?.("query-failed", { scenarioId: scenario.id, targetId: scenario.targetId, failure })
        break
      }
    }
    return { hostParity: "PRODUCTION_SEMANTIC_OWNER",
      measurementBoundary: "SEMANTIC_ENGINE_PORT_WITH_PROXY_AND_WORKER_IPC",
      excludedLspWork: ["stdio-framing", "diagnostic-settling", "lsp-ready-refresh", "result-encoding"],
      preparationMs, preparation: { elapsedMs: preparationMs, catalogMs, semanticReadiness, targetQueries: 0 },
      requests, events, metricsPath: environment.ARKTS_MEMORY_METRICS_FILE,
      memory: { process: process.memoryUsage(), maximumRssBytes: process.resourceUsage().maxRSS * 1024 } }
  } finally {
    await workspaceSymbols.dispose()
    await semantic.dispose()
    fs.rmSync(cacheDirectory, { recursive: true, force: true })
  }
}
