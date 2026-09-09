#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import { createSpikeProject } from "./backend-host.mjs"
import { evaluateLifecycleEvidence } from "./lifecycle-report.mjs"

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function run() {
  const options = parseArguments(process.argv.slice(2))
  if (typeof global.gc !== "function") throw new Error("lifecycle-run requires node --expose-gc")

  const lock = readJson(path.join(projectRoot, "docs", "toolchains", "arkts-toolchain.lock.json"))
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: options.upstream,
    encoding: "utf8",
    maxBuffer: 16 * 1024,
  }).trim()
  if (revision !== lock.semanticBackendRevision) throw new Error("backend revision mismatch")

  const packageJson = readJson(path.join(options.upstream, "package.json"))
  const compiler = require(path.join(options.upstream, packageJson.main.replace(/^\.\//, "")))
  const inputs = loadSdkDeclarations(options.sdk)
  const mainPath = "lifecycle/workspace/Main.ets"
  const initialMain = mainFixture("")
  inputs[mainPath] = initialMain.text

  const registry = compiler.createDocumentRegistry(compiler.sys.useCaseSensitiveFileNames, projectRoot)
  const snapshotPool = new Map()
  let disposeCalls = 0
  let trimCalls = 0
  const stable = createSpikeProject(compiler, projectRoot, inputs, { registry, snapshotPool })
  const firstCompletion = stable.completions(mainPath, initialMain.position)
  requireCompletion(firstCompletion)
  const statsAfterWarm = stable.stats()
  for (let index = 0; index < 10; index += 1) {
    requireCompletion(stable.completions(mainPath, initialMain.position))
  }
  const statsAfterStable = stable.stats()

  const editedMain = mainFixture("// ordinary comment edit\n")
  stable.update(mainPath, editedMain.text)
  const statsBeforeEdit = stable.stats()
  requireCompletion(stable.completions(mainPath, editedMain.position))
  const statsAfterEdit = stable.stats()

  stable.trim()
  trimCalls += 1
  requireCompletion(stable.completions(mainPath, editedMain.position))

  const samples = []
  for (let iteration = 1; iteration <= 20; iteration += 1) {
    const context = createSpikeProject(compiler, projectRoot, inputs, { registry, snapshotPool })
    requireCompletion(context.completions(mainPath, initialMain.position))
    context.dispose()
    disposeCalls += 1
    collectGarbage()
    samples.push({ iteration, ...memorySample() })
  }
  stable.dispose()
  disposeCalls += 1
  collectGarbage()

  const first = samples[0]
  const last = samples.at(-1)
  const evidence = {
    schemaVersion: 1,
    backendRevision: lock.semanticBackendRevision,
    backendPackage: packageJson.name,
    backendPackageVersion: packageJson.version,
    sdkApiLevel: lock.sdkApiLevel,
    sdkDeclarationDigest: lock.sdkDeclarationDigest,
    sdkDeclarationFiles: Object.keys(inputs).length - 1,
    exposedGc: true,
    stableReuse: {
      repeatedQueries: 10,
      readsAfterWarm: statsAfterWarm.snapshotReadCount,
      readsAfterStable: statsAfterStable.snapshotReadCount,
      additionalSnapshotReads: statsAfterStable.snapshotReadCount - statsAfterWarm.snapshotReadCount,
      materializationsAfterWarm: statsAfterWarm.snapshotMaterializationCount,
      materializationsAfterStable: statsAfterStable.snapshotMaterializationCount,
      additionalSnapshotMaterializations:
        statsAfterStable.snapshotMaterializationCount - statsAfterWarm.snapshotMaterializationCount,
    },
    commentEdit: {
      readsBeforeEdit: statsBeforeEdit.snapshotReadCount,
      readsAfterEdit: statsAfterEdit.snapshotReadCount,
      additionalSnapshotReads: statsAfterEdit.snapshotReadCount - statsBeforeEdit.snapshotReadCount,
      materializationsBeforeEdit: statsBeforeEdit.snapshotMaterializationCount,
      materializationsAfterEdit: statsAfterEdit.snapshotMaterializationCount,
      additionalSnapshotMaterializations:
        statsAfterEdit.snapshotMaterializationCount - statsBeforeEdit.snapshotMaterializationCount,
      maximumSnapshotMaterializations: 1,
    },
    lifecycle: { trimCalls, disposeCalls, sharedRegistry: true },
    churn: {
      runs: samples.length,
      rssGrowthBytes: Math.max(0, last.rss - first.rss),
      heapGrowthBytes: Math.max(0, last.heapUsed - first.heapUsed),
      samples,
    },
    gates: {
      rssGrowthMaxBytes: 96 * 1024 * 1024,
      heapGrowthMaxBytes: 32 * 1024 * 1024,
    },
  }
  const verdict = evaluateLifecycleEvidence(evidence)
  evidence.status = verdict.status
  evidence.failures = verdict.failures
  writeJsonAtomically(options.out, evidence)
  process.stdout.write("OHOS_TYPESCRIPT_LIFECYCLE=" + evidence.status + "\n")
  process.stdout.write(
    "CHURN=" + evidence.churn.runs
      + " RSS_GROWTH=" + evidence.churn.rssGrowthBytes
      + " HEAP_GROWTH=" + evidence.churn.heapGrowthBytes + "\n",
  )
  if (evidence.status !== "PASS") process.exitCode = 43
}

function loadSdkDeclarations(sdkRoot) {
  const etsRoot = path.join(sdkRoot, "ets")
  const files = {}
  for (const fileName of walk(etsRoot).sort()) {
    const relative = path.relative(etsRoot, fileName).split(path.sep).join("/")
    files["lifecycle/sdk/ets/" + relative] = fs.readFileSync(fileName, "utf8")
  }
  if (Object.keys(files).length === 0) throw new Error("SDK has no declaration files")
  return files
}

function walk(root) {
  const output = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) pending.push(candidate)
      if (entry.isFile() && (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.ets"))) {
        output.push(candidate)
      }
    }
  }
  return output
}

function mainFixture(prefix) {
  const marker = "/*@query*/"
  const markedText = prefix + "class Probe { value: number = 1; run(): void { this." + marker + " } }\n"
  const position = markedText.indexOf(marker)
  return {
    text: markedText.slice(0, position) + markedText.slice(position + marker.length),
    position,
  }
}

function requireCompletion(completion) {
  if (!completion?.entries.some(({ name }) => name === "value")) {
    throw new Error("lifecycle completion probe failed")
  }
}

function collectGarbage() {
  global.gc()
  global.gc()
}

function memorySample() {
  const memory = process.memoryUsage()
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  }
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    if (!["--upstream", "--sdk", "--out"].includes(name) || argv[index + 1] === undefined) {
      throw new Error("invalid lifecycle argument: " + name)
    }
    if (values.has(name)) throw new Error("duplicate lifecycle argument: " + name)
    values.set(name, argv[index + 1])
  }
  return {
    upstream: requiredAbsolute(values.get("--upstream"), "--upstream"),
    sdk: requiredAbsolute(values.get("--sdk"), "--sdk"),
    out: path.resolve(values.get("--out") ?? "docs/reports/ohos-typescript-lifecycle.json"),
  }
}

function requiredAbsolute(value, name) {
  if (!value || !path.isAbsolute(value)) throw new Error(name + " must be absolute")
  return path.resolve(value)
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(fileName, "utf8"))
}

function writeJsonAtomically(fileName, value) {
  fs.mkdirSync(path.dirname(fileName), { recursive: true })
  const temporary = fileName + "." + process.pid + ".tmp"
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
    fs.renameSync(temporary, fileName)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
}

try {
  run()
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)).slice(0, 512) + "\n")
  process.exitCode = 1
}
