import { once } from "node:events"

import { LspProcess, withTimeout } from "./lsp-process.mjs"

export class LspSession {
  constructor({ command, args, cwd, env, rootUri = null, capabilities = {} } = {}) {
    this.transport = new LspProcess({ command, args, cwd, env })
    this.rootUri = rootUri
    this.capabilities = capabilities
    this.nextRequestId = 1
    this.initialized = false
    this.initialization = undefined
    this.closing = undefined
  }

  initialize({ rootUri = this.rootUri, capabilities = this.capabilities, timeoutMs = 5_000 } = {}) {
    if (this.initialization) return this.initialization

    const id = this.nextRequestId++
    this.transport.send({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: { processId: process.pid, rootUri, capabilities },
    })
    this.initialization = this.transport.response(id, timeoutMs).then((response) => {
      if (response.error) throw new Error(`LSP initialize failed: ${JSON.stringify(response.error)}`)
      this.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
      this.initialized = true
      return response
    })
    return this.initialization
  }

  close({ timeoutMs = 2_000 } = {}) {
    if (!this.closing) this.closing = this.closeOnce(timeoutMs)
    return this.closing
  }

  async closeOnce(timeoutMs) {
    if (this.transport.child.exitCode !== null) {
      return {
        shutdown: null,
        exit: {
          code: this.transport.child.exitCode,
          signal: this.transport.child.signalCode,
        },
      }
    }

    if (!this.initialized) {
      await withTimeout(
        this.transport.close(),
        timeoutMs,
        `LSP process did not terminate within ${timeoutMs}ms`,
      )
      return {
        shutdown: null,
        exit: {
          code: this.transport.child.exitCode,
          signal: this.transport.child.signalCode,
        },
      }
    }

    const id = this.nextRequestId++
    this.transport.send({ jsonrpc: "2.0", id, method: "shutdown", params: null })
    const shutdown = await this.transport.response(id, timeoutMs)
    if (shutdown.error) throw new Error(`LSP shutdown failed: ${JSON.stringify(shutdown.error)}`)

    const exited = once(this.transport.child, "exit")
    this.transport.send({ jsonrpc: "2.0", method: "exit", params: null })
    const [code, signal] = await withTimeout(
      exited,
      timeoutMs,
      `LSP process did not exit within ${timeoutMs}ms after shutdown`,
    )
    return { shutdown, exit: { code, signal } }
  }
}
