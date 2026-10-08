import {
  ErrorCodes, ResponseError, type Connection,
} from "vscode-languageserver/node.js"

import type { SemanticEnginePort } from "../contracts/semantic-engine.js"

interface BenchmarkControls {
  readonly connection: Connection
  readonly semantic: SemanticEnginePort
  readonly suspendDiagnostics: () => Promise<() => void>
  readonly workspaceRootCount: () => number
  readonly environment?: NodeJS.ProcessEnv
}

export function registerBenchmarkControls(options: BenchmarkControls): void {
  const { connection, semantic, suspendDiagnostics, workspaceRootCount } = options
  const environment = options.environment ?? process.env
  if (environment.ARKTS_BENCHMARK_CONTROL !== "1") return
  connection.onRequest("arkts/benchmark/applyMemoryPressure", (params: unknown) => {
    const level = (params as { level?: unknown } | null)?.level
    if ((level !== "level2" && level !== "level3") || !semantic.applyMemoryPressure) {
      throw new ResponseError(ErrorCodes.InvalidParams, "level2/level3 memory pressure is unavailable")
    }
    semantic.applyMemoryPressure(level)
    return { applied: level }
  })
  if (environment.ARKTS_L01_SEMANTIC_WORKER_RECYCLE !== "1") return
  connection.onRequest("arkts/benchmark/recycleSemanticWorker", async () => {
    if (workspaceRootCount() !== 1 || !semantic.recycleSemanticWorker) {
      throw new ResponseError(ErrorCodes.InvalidRequest,
        "Semantic Worker recycle requires one production workspace root")
    }
    const release = await suspendDiagnostics()
    try {
      return await semantic.recycleSemanticWorker()
    } catch (error) {
      throw new ResponseError(ErrorCodes.InvalidRequest,
        error instanceof Error ? error.message : String(error))
    } finally {
      release()
    }
  })
}
