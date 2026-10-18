import fs from "node:fs"

const workflow = JSON.parse(fs.readFileSync(new URL("../../config/product-benchmark-workflow.json", import.meta.url)))
const metrics = {
  server: ["steadyPssBytes", "peakPssBytes", "pss10kBytes", "pss100kBytes", "initialWarmPssBytes", "postEvictionPssBytes"],
  deveco: ["steadyPssBytes", "peakPssBytes"],
}

/** Reaudit complete declared records. This alone never proves product/run coverage. */
export function productPssRecordObservation(data, artifact) {
  if (data?.schema !== "arkts-language-server.product-pss-observations" || data.schemaVersion !== 1
    || data.measurementKind !== "linux-smaps-rollup" || data.platform !== "linux"
    || !Array.isArray(data.samples) || data.samples.length === 0) throw new Error("PRODUCT_PSS_RECORD_SCHEMA_INVALID")
  const metricSamples = {}
  const identities = new Map()
  let previousMonotonicMs = -Infinity
  for (const sample of data.samples) {
    if (!metrics[sample?.product]?.includes(sample.metric)
      || !safeBytes(sample.timestamp) || !safeBytes(sample.completedTimestamp)
      || !finiteClock(sample.monotonicMs) || sample.monotonicMs <= previousMonotonicMs
      || !finiteClock(sample.completedMonotonicMs) || sample.completedMonotonicMs < sample.monotonicMs
      || !Array.isArray(sample.processes) || !safeBytes(sample.totalPssBytes)) {
      throw new Error("PRODUCT_PSS_SAMPLE_INVALID")
    }
    previousMonotonicMs = sample.monotonicMs
    const requiredRoles = sample.product === "server" ? workflow.processAccounting.productPssRoles
      : workflow.processAccounting.devecoPssRoles
    const pids = new Set(), roles = new Set()
    let totalPssBytes = 0
    for (const process of sample.processes) {
      if (!Number.isSafeInteger(process?.pid) || process.pid <= 0 || pids.has(process.pid)
        || !requiredRoles.includes(process.role)
        || typeof process.startIdentity !== "string" || !/^linux:\d+$/u.test(process.startIdentity)) {
        throw new Error("PRODUCT_PSS_PROCESS_ACCOUNTING_INVALID")
      }
      pids.add(process.pid)
      roles.add(process.role)
      const identity = `${process.pid}:${process.startIdentity}`
      const owner = `${sample.product}:${process.role}`
      if (identities.has(identity) && identities.get(identity) !== owner) {
        throw new Error("PRODUCT_PSS_PROCESS_IDENTITY_CONTRADICTION")
      }
      identities.set(identity, owner)
      const rssBytes = kernelBytes(process.procStatus, "VmRSS")
      const pssBytes = kernelBytes(process.smapsRollup, "Pss")
      if (process.rssBytes !== rssBytes || process.pssBytes !== pssBytes) {
        throw new Error("PRODUCT_PSS_KERNEL_VALUE_MISMATCH")
      }
      totalPssBytes += pssBytes
    }
    if (requiredRoles.some(role => !roles.has(role)) || !safeBytes(totalPssBytes)
      || totalPssBytes !== sample.totalPssBytes) throw new Error("PRODUCT_PSS_PRODUCT_TOTAL_INVALID")
    const key = `${sample.product}.${sample.metric}`
    ;(metricSamples[key] ??= []).push(totalPssBytes)
  }
  return { status: "PASS", artifact, sampleCount: data.samples.length,
    measurementKind: data.measurementKind, platform: data.platform,
    summaryBinding: "NOT_VERIFIED", productCoverage: "NOT_VERIFIED", metricSamples,
    samples: data.samples }
}

function kernelBytes(text, name) {
  if (typeof text !== "string") throw new Error("PRODUCT_PSS_KERNEL_TEXT_MISSING")
  const lines = text.split(/\r?\n/u).filter(line => line.startsWith(`${name}:`))
  const match = lines.length === 1 && new RegExp(`^${name}:[ \\t]*(\\d+)[ \\t]+kB[ \\t]*$`, "u").exec(lines[0])
  if (!match) throw new Error(`PRODUCT_PSS_KERNEL_${name.toUpperCase()}_INVALID`)
  const bytes = Number(match[1]) * 1024
  if (!safeBytes(bytes)) throw new Error("PRODUCT_PSS_KERNEL_BYTES_UNSAFE")
  return bytes
}

function safeBytes(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function finiteClock(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}
