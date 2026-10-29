import assert from "node:assert/strict"
import fs from "node:fs/promises"

let nextShutdownId = 0

/** A parent SIGTERM is not proof that its native index connection has closed. */
export async function shutdownProductionSession(server) {
  try {
    assert.equal(server.child.exitCode, null, "production session exited before orderly disposal")
    assert.equal(server.child.signalCode, null, "production session was killed before orderly disposal")
    const id = `test-lifecycle-shutdown-${++nextShutdownId}`
    server.send({ jsonrpc: "2.0", id, method: "shutdown", params: null })
    const response = await server.response(id)
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.equal(response.result, null)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("production session did not exit after shutdown")), 1_000)
      server.child.once("close", (code, signal) => {
        clearTimeout(timeout)
        if (code === 0 && signal === null) resolve()
        else reject(new Error(`production session exit was ${code}/${signal}`))
      })
      server.send({ jsonrpc: "2.0", method: "exit" })
    })
  } catch (error) {
    await server.close()
    throw error
  }
}

/** Retain failed fixtures for evidence; never race deletion against forced native cleanup. */
export async function closeProductionFixture(servers, directory) {
  const failures = []
  for (const server of [...servers].reverse()) {
    try { await shutdownProductionSession(server) }
    catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, `fixture preserved: ${directory}`)
  await fs.rm(directory, { recursive: true, force: true })
}
