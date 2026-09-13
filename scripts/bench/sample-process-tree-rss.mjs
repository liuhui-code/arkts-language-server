#!/usr/bin/env node

import { execFile } from "node:child_process"
import fs from "node:fs"
import { promisify } from "node:util"

import { createProcessResourceProbe } from "../../tests/support/process-resource-probe.mjs"

const exec = promisify(execFile)

try {
  const [pidText, outputPath, intervalText = "50"] = process.argv.slice(2)
  const pid = positiveInteger(pidText, "pid")
  const intervalMs = positiveInteger(intervalText, "sample interval")
  if (!outputPath) throw new Error("output path is required")
  if (fs.existsSync(outputPath)) throw new Error(`output already exists: ${outputPath}`)

  const probe = await systemProbe()
  const identity = await probe.identify(pid)
  const output = fs.createWriteStream(outputPath, { flags: "wx" })
  let stopped = false
  process.once("SIGINT", () => { stopped = true })
  process.once("SIGTERM", () => { stopped = true })

  try {
    while (!stopped) {
      let sample
      try {
        sample = await probe.sample(identity)
      } catch (error) {
        if (error?.code === "EPROCESS_NOT_FOUND") break
        throw error
      }
      const totalRssBytes = sample.processes.reduce(
        (total, current) => total + current.rssBytes,
        0,
      )
      output.write(`${JSON.stringify({
        timestamp: sample.timestamp,
        totalRssBytes,
        samplerRssBytes: process.memoryUsage().rss,
        processes: sample.processes.map(({ role, pid: processId, rssBytes }) => ({
          role,
          pid: processId,
          rssBytes,
        })),
      })}\n`)
      await delay(intervalMs)
    }
  } finally {
    await new Promise((resolve, reject) => output.end((error) => (
      error ? reject(error) : resolve()
    )))
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

async function systemProbe() {
  if (process.platform === "darwin") {
    return createProcessResourceProbe({
      platform: "darwin",
      now: () => Date.now(),
      runPs: async ({ command, args, maxBuffer, env }) => (
        await exec(command, args, { maxBuffer, env: { ...process.env, ...env } })
      ).stdout,
    })
  }
  if (process.platform === "linux") {
    const clockTicks = Number((await exec("getconf", ["CLK_TCK"])).stdout.trim())
    return createProcessResourceProbe({
      platform: "linux",
      now: () => Date.now(),
      readFile: fs.promises.readFile,
      clockTicksPerSecond: clockTicks,
    })
  }
  throw new Error(`external RSS sampling is unsupported on ${process.platform}`)
}

function positiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
