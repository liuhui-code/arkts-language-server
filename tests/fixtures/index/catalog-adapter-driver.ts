import { createInterface } from "node:readline"

import type { WorkspaceDescriptor } from "../../../src/contracts/document.js"
import type { WorkspaceIndexProgress } from "../../../src/contracts/workspace-symbol-service.js"
import { SidecarWorkspaceIndex } from "../../../src/index/sidecar-workspace-index.js"

interface DriverCommand {
  id: number
  method: "open" | "catalog" | "abort" | "search" | "status" | "close" | "exit"
  workspace?: WorkspaceDescriptor
  workspaceId?: string
  cacheDir?: string
  requestKey?: string
  query?: string
}

const index = new SidecarWorkspaceIndex({
  requestTimeoutMs: 8_000,
  initializeTimeoutMs: 15_000,
  catalogCancelTimeoutMs: 250,
  catalogStallTimeoutMs: 250,
})
const controllers = new Map<string, AbortController>()
const input = createInterface({ input: process.stdin })

input.on("line", (line) => {
  void dispatch(JSON.parse(line) as DriverCommand)
})

async function dispatch(command: DriverCommand): Promise<void> {
  try {
    let result: unknown
    switch (command.method) {
      case "open":
        result = await index.open(
          required(command.workspace, "workspace"),
          required(command.cacheDir, "cacheDir"),
        )
        break
      case "catalog": {
        const requestKey = required(command.requestKey, "requestKey")
        const controller = new AbortController()
        controllers.set(requestKey, controller)
        const reports: WorkspaceIndexProgress[] = []
        try {
          await index.start(
            required(command.workspace, "workspace"),
            (progress) => reports.push(progress),
            controller.signal,
          )
          result = reports
        } finally {
          controllers.delete(requestKey)
        }
        break
      }
      case "abort":
        controllers.get(required(command.requestKey, "requestKey"))?.abort()
        result = null
        break
      case "search":
        result = await index.searchSymbols(
          required(command.workspaceId, "workspaceId"),
          command.query ?? "",
          20,
        )
        break
      case "status":
        result = await index.status(required(command.workspaceId, "workspaceId"))
        break
      case "close":
        result = await index.close(required(command.workspaceId, "workspaceId"))
        break
      case "exit":
        input.close()
        result = null
        break
    }
    respond({ id: command.id, ok: true, result })
  } catch (error) {
    const value = error instanceof Error ? error : new Error(String(error))
    respond({ id: command.id, ok: false, error: { name: value.name, message: value.message } })
  }
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`missing ${name}`)
  return value
}

function respond(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}
