import { createInterface } from "node:readline"

import type { DocumentSnapshot, WorkspaceDescriptor } from "../../../src/contracts/document.js"
import {
  resolveIndexCacheDirectory,
  type CacheDirectoryOptions,
} from "../../../src/index/cache-directory.js"
import {
  resolveIndexSidecarPath,
  type SidecarPathOptions,
} from "../../../src/index/sidecar-path.js"
import { SidecarWorkspaceIndex } from "../../../src/index/sidecar-workspace-index.js"

interface DriverCommand {
  id: number
  method: "open" | "refresh" | "search" | "exportsSearch" | "status" | "close" | "abort" | "events" | "resolveCache" | "resolveSidecar" | "exit"
  workspace?: WorkspaceDescriptor
  workspaceId?: string
  cacheDir?: string
  generation?: number
  changed?: DocumentSnapshot[]
  removedUris?: string[]
  excludedUris?: string[]
  query?: string
  limit?: number
  requestKey?: string
  options?: Record<string, unknown>
}

const sidecarEvents: unknown[] = []
const configuredTimeout = Number(process.env.ARKTS_INDEX_TEST_REQUEST_TIMEOUT_MS)
const configuredInitializeTimeout = Number(process.env.ARKTS_INDEX_TEST_INITIALIZE_TIMEOUT_MS)
const configuredTerminationTimeout = Number(process.env.ARKTS_INDEX_TEST_TERMINATION_TIMEOUT_MS)
const index = new SidecarWorkspaceIndex({
  onEvent: (event) => sidecarEvents.push(event),
  ...(Number.isFinite(configuredTimeout) ? { requestTimeoutMs: configuredTimeout } : {}),
  ...(Number.isFinite(configuredInitializeTimeout)
    ? { initializeTimeoutMs: configuredInitializeTimeout }
    : {}),
  ...(Number.isFinite(configuredTerminationTimeout)
    ? { terminationTimeoutMs: configuredTerminationTimeout }
    : {}),
})
const input = createInterface({ input: process.stdin })
const controllers = new Map<string, AbortController>()

input.on("line", (line) => {
  void dispatch(JSON.parse(line) as DriverCommand)
})

async function dispatch(command: DriverCommand): Promise<void> {
  const controller = command.requestKey && (command.method === "refresh" || command.method === "search")
    ? new AbortController()
    : undefined
  if (command.requestKey && controller) controllers.set(command.requestKey, controller)
  try {
    let result: unknown
    switch (command.method) {
      case "open":
        result = await index.open(required(command.workspace, "workspace"), required(command.cacheDir, "cacheDir"))
        break
      case "refresh":
        result = await index.refresh(
          required(command.workspaceId, "workspaceId"),
          required(command.generation, "generation"),
          command.changed ?? [],
          command.removedUris ?? [],
          controller?.signal,
        )
        break
      case "search":
        result = await index.searchSymbols(
          required(command.workspaceId, "workspaceId"),
          command.query ?? "",
          required(command.limit, "limit"),
          controller?.signal,
          command.excludedUris,
        )
        break
      case "exportsSearch":
        result = await index.searchExports(
          required(command.workspaceId, "workspaceId"),
          command.query ?? "",
          required(command.limit, "limit"),
          controller?.signal,
        )
        break
      case "status":
        result = await index.status(required(command.workspaceId, "workspaceId"))
        break
      case "close":
        result = await index.close(required(command.workspaceId, "workspaceId"))
        break
      case "abort":
        controllers.get(required(command.requestKey, "requestKey"))?.abort()
        result = null
        break
      case "events":
        result = [...sidecarEvents]
        break
      case "resolveCache":
        result = resolveIndexCacheDirectory(command.options as CacheDirectoryOptions | undefined)
        break
      case "resolveSidecar":
        result = resolveIndexSidecarPath(command.options as SidecarPathOptions | undefined)
        break
      case "exit":
        input.close()
        result = null
        break
    }
    respond({ id: command.id, ok: true, result })
  } catch (error) {
    const value = error instanceof Error ? error : new Error(String(error))
    respond({
      id: command.id,
      ok: false,
      error: {
        name: value.name,
        message: value.message,
        code: "code" in value ? value.code : undefined,
      },
    })
  } finally {
    if (controller && command.requestKey) controllers.delete(command.requestKey)
  }
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`missing ${name}`)
  return value
}

function respond(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}
