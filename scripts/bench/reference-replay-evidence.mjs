import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { ordinalCompare } from "./reference-location-oracle.mjs"
import {
  gitValue,
  projectRoot,
  readSdkMetadata,
  sha256File,
} from "./reference-replay-input.mjs"

export function serverEnvironment(options, cacheDir, logDir) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("ARKTS_"))),
    ARKTS_INDEX_CACHE_DIR: cacheDir,
    ARKTS_INDEX_SIDECAR_PATH: options.sidecar,
    ARKTS_LSP_LOG_DIR: logDir,
    ...(options.strategy ? { ARKTS_REFERENCES_STRATEGY: options.strategy } : {}),
    ...(options.batchRoots ? { ARKTS_REFERENCES_BATCH_ROOTS: String(options.batchRoots) } : {}),
    ...(options.trace ? { ARKTS_REFERENCES_TRACE: "1" } : {}),
    ...(options.sdkProfile
      ? { ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: options.sdkProfile }
      : {}),
    ...(options.dependencyProfile
      ? { ARKTS_REFERENCES_DEPENDENCY_PROFILE: options.dependencyProfile }
      : {}),
  }
}

export function environmentEvidence(options) {
  return {
    repo: projectRoot,
    head: gitValue(projectRoot, ["rev-parse", "HEAD"]),
    worktreeStatus: gitValue(projectRoot, ["status", "--porcelain"]),
    workspace: options.workspace,
    workspaceRevision: gitValue(options.workspace, ["rev-parse", "HEAD"]),
    workspaceStatus: gitValue(options.workspace, ["status", "--porcelain"]),
    sdk: options.sdk,
    sdkMetadata: readSdkMetadata(options.sdk),
    sdkDeclarationDigest: options.sdkDeclarationDigest ?? null,
    node: process.execPath,
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    server: options.server,
    serverSha256: sha256File(options.server),
    standardLibrarySha256: options.standardLibrarySha256,
    semanticWorkerSha256: options.semanticWorkerSha256,
    referenceVerifierWorkerSha256: options.referenceVerifierWorkerSha256,
    sidecar: options.sidecar,
    sidecarSha256: sha256File(options.sidecar),
    launch: { command: process.execPath, args: [options.server, "--stdio"] },
    benchmarkManifest: options.manifest ?? null,
    benchmarkId: options.benchmarkManifest?.benchmarkId ?? null,
    serverEnvironment: serverEnvironment(options, "<private-index-cache>", "<private-log-dir>"),
    strategy: options.strategy ?? "server-default",
    sdkProfile: options.sdkProfile ?? "server-default",
    dependencyProfile: options.dependencyProfile ?? "server-default",
  }
}

export async function waitForCatalog(session, timeoutMs) {
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create",
    () => true,
    timeoutMs,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  const token = create.params.token
  await session.transport.progress(
    token,
    (message) => message.params.value.kind === "begin",
    timeoutMs,
  )
  let latestMessage = null
  const deadline = Date.now() + timeoutMs
  while (true) {
    const progress = await session.transport.progress(token, (message) => (
      message.params.value.kind === "report" || message.params.value.kind === "end"
    ), Math.max(1, deadline - Date.now()))
    if (progress.params.value.message) latestMessage = progress.params.value.message
    if (progress.params.value.kind === "end") return latestMessage
  }
}

export function readStructuredLogs(root) {
  if (!fs.existsSync(root)) return []
  const events = []
  for (const fileName of walkFiles(root)) {
    for (const line of fs.readFileSync(fileName, "utf8").split(/\r?\n/u)) {
      if (!line) continue
      try { events.push(JSON.parse(line)) } catch { /* preserve protocol output purity */ }
    }
  }
  return events
}

export function walkFiles(root) {
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(target))
    else if (entry.isFile()) files.push(target)
  }
  return files.sort(ordinalCompare)
}

export function readJsonLines(fileName) {
  if (!fs.existsSync(fileName)) return []
  return fs.readFileSync(fileName, "utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse)
}

export function attachNearestRss(events, samples) {
  return events.map((event) => {
    const nearest = samples.reduce((best, sample) => (
      !best || Math.abs(sample.timestamp - event.timestamp) < Math.abs(best.timestamp - event.timestamp)
        ? sample
        : best
    ), null)
    return {
      ...event,
      nearestSampleTimestamp: nearest?.timestamp ?? null,
      productRssBytes: nearest?.totalRssBytes ?? null,
    }
  })
}

export async function waitForSample(fileName, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(fileName) && fs.statSync(fileName).size > 0) return
    await delay(25)
  }
  throw new Error("external RSS sampler did not produce its first sample")
}

export function childExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => child.once("exit", resolve))
}

export function maxNullable(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length > 0 ? Math.max(...finite) : null
}

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
