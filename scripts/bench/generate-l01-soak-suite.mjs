#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

import { digestJson } from "./prepared-suite-input.mjs"

try {
  const options = parseOptions(process.argv.slice(2))
  const base = JSON.parse(fs.readFileSync(options.base, "utf8"))
  const suite = makeSuite(base, options)
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(suite, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`L01_SOAK_SUITE=${options.out}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    if (!["--base", "--out", "--cycles", "--pressure-every", "--idle-ms", "--mode", "--trace", "--metrics-out", "--strategy", "--registry-probe-out"].includes(name)
      || values.has(name) || args[index + 1] === undefined) throw new Error("L01_SOAK_INVALID=OPTIONS")
    values.set(name, args[index + 1])
  }
  const integer = (name, minimum, maximum) => {
    const value = Number(values.get(name))
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new Error(`L01_SOAK_INVALID=${name.slice(2).toUpperCase()}`)
    }
    return value
  }
  if (!values.get("--base") || !values.get("--out")) throw new Error("L01_SOAK_INVALID=OPTIONS")
  const mode = values.get("--mode") ?? "soak"
  if (mode !== "soak" && mode !== "diagnostic") throw new Error("L01_SOAK_INVALID=MODE")
  if (values.has("--metrics-out") && mode !== "diagnostic") throw new Error("L01_SOAK_INVALID=MODE")
  if (values.has("--registry-probe-out") && mode !== "diagnostic") throw new Error("L01_SOAK_INVALID=MODE")
  const strategy = values.get("--strategy") ?? "legacy"
  if (strategy !== "legacy" && strategy !== "indexed-batched") throw new Error("L01_SOAK_INVALID=STRATEGY")
  if (strategy !== "legacy" && mode !== "diagnostic") throw new Error("L01_SOAK_INVALID=MODE")
  const cycles = integer("--cycles", mode === "diagnostic" ? 2 : 100, 1000)
  if (cycles % 2 !== 0) throw new Error("L01_SOAK_INVALID=EVEN_CYCLES_REQUIRED")
  const pressureEvery = integer("--pressure-every", 0, cycles)
  return { base: path.resolve(values.get("--base")), out: path.resolve(values.get("--out")), cycles, mode, strategy,
    pressureEvery, trace: values.has("--trace") ? integer("--trace", 0, 1) === 1 : pressureEvery > 0,
    metricsOut: values.has("--metrics-out") ? path.resolve(values.get("--metrics-out")) : undefined,
    registryProbeOut: values.has("--registry-probe-out")
      ? path.resolve(values.get("--registry-probe-out")) : undefined,
    idleMs: integer("--idle-ms", 0, 60_000) }
}

function makeSuite(base, options) {
  const env = base.runtime?.env ?? {}
  if (env.ARKTS_REFERENCES_STRATEGY !== "legacy"
    || env.ARKTS_REFERENCES_SDK_AMBIENT_PROFILE !== "full"
    || env.ARKTS_SEMANTIC_SESSION_REUSE !== "off") {
    throw new Error("L01_SOAK_INVALID=NON_RESIDENT_BASELINE")
  }
  const target = base.targets?.find(item => item.id === "home-class" && item.kind === "references")
  const seed = base.scenarios?.find(item => item.id === "home-new-unsaved-reference"
    && item.bucket === "edit-reference" && item.targetId === "home-class")
  const insertion = seed?.edit?.changes?.[0]
  const inserted = insertion?.newText?.match(/^\n([^\n]+)$/u)?.[1]
  if (!target?.oracle || !seed?.edit?.oracle || !inserted || seed.edit.changes.length !== 1
    || insertion.range.start.line !== insertion.range.end.line
    || insertion.range.start.character !== insertion.range.end.character
    || seed.edit.file !== target.file) throw new Error("L01_SOAK_INVALID=REFERENCE_EDIT_SEED")
  const removal = [{ range: { start: insertion.range.start,
    end: { line: insertion.range.start.line + 1, character: inserted.length } }, newText: "" }]
  const scenarios = base.scenarios.filter(item => item.bucket === "first-unseen-symbol")
  if (!scenarios.some(item => item.targetId === "home-class")) throw new Error("L01_SOAK_INVALID=BASELINE")
  for (let cycle = 1; cycle <= options.cycles; cycle++) {
    const add = cycle % 2 === 1
    const changes = add ? [insertion] : removal
    scenarios.push({ id: `soak-edit-${String(cycle).padStart(3, "0")}`, bucket: "edit-reference",
      targetId: "home-class", edit: { file: target.file, changes, sha256: digestJson(changes),
        oracle: add ? seed.edit.oracle : target.oracle } })
    if (options.pressureEvery && cycle % options.pressureEvery === 0) {
      scenarios.push({ id: `soak-l3-${String(cycle).padStart(3, "0")}`,
        bucket: "pressure-recovery-repeat", targetId: "home-class" })
    }
  }
  return { ...base, benchmarkId: `${base.benchmarkId}-${options.mode}-${options.cycles}${options.strategy === "legacy" ? "" : `-${options.strategy}`}`,
    runtime: { ...base.runtime, postIdleMs: options.idleMs,
      env: { ...env, ARKTS_REFERENCES_STRATEGY: options.strategy,
        ARKTS_REFERENCES_TRACE: options.trace ? "1" : "0",
        ...(options.metricsOut ? { ARKTS_MEMORY_METRICS_FILE: options.metricsOut } : {}),
        ...(options.registryProbeOut ? { ARKTS_L01_REGISTRY_PROBE_FILE: options.registryProbeOut } : {}),
        ...(options.pressureEvery || options.registryProbeOut ? { ARKTS_BENCHMARK_CONTROL: "1" } : {}) } }, scenarios }
}
