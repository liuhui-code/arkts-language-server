import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"

import {
  attachNearestRss, maxNullable, readJsonLines, readStructuredLogs,
} from "./reference-replay-evidence.mjs"
import { gitValue, sha256File } from "./reference-replay-input.mjs"
import { consumerFile, declarationFile, position, secondaryFile, secondaryPosition, symbol }
  from "./settings-mixed-input.mjs"

export function postIdleTiming(waitStartedAt, readyAt, queryStartedAt, queryFinishedAt) {
  return { waitMs: readyAt - waitStartedAt, queryMs: queryFinishedAt - queryStartedAt }
}

export function makeMixedReport(options, input, run) {
  const samples = readJsonLines(run.samplesPath)
  const transcript = run.session.transport.diagnosticSnapshot().transcript
  const methods = transcript.entries.filter(entry => entry.direction === "send" && entry.method)
    .map(entry => entry.method)
  const forbiddenSymbolRequests = methods.filter(method => method === "workspace/symbol"
    || method === "textDocument/documentSymbol")
  const sampleIntervalsMs = samples.slice(1).map((sample, index) => (
    sample.timestamp - samples[index].timestamp
  ))
  const events = attachNearestRss(run.events, samples)
  const timeline = events.map(event => {
    const sample = samples.find(value => value.timestamp === event.nearestSampleTimestamp)
    return { ...event, nodeRssBytes: serverRss(sample, run.targetPid) }
  })
  const expectedCheckpoints = run.schedule.schedule.filter(step => step.references).length
  const completed = run.operations.filter(operation => operation.finishedAt !== undefined)
  const references = run.operations.filter(operation => operation.references)
  const secondaryDefinitions = run.operations.filter(operation => operation.secondaryDefinition)
  const pressure = run.operations.filter(operation => operation.pressure)
  const cloneStatusAfter = gitValue(input.clone, ["status", "--porcelain", "--untracked-files=all"])
  const finalText = fs.readFileSync(run.declarationPath, "utf8")
  const finalHash = sha256File(run.declarationPath)
  const finalOperation = run.operations.at(-1)
  const rssCoverage = targetRssCoverage(samples, run.targetPid,
    run.operations[0]?.startedAt, finalOperation?.finishedAt, options.sampleIntervalMs)
  const postIdleRssCoverage = options.postIdleReference ? targetRssCoverage(samples, run.targetPid,
    run.postIdleReference?.startedAt, run.postIdleReference?.finishedAt,
    options.sampleIntervalMs) : null
  const expectedCloneStatus = options.operations % 2 === 0 ? "" : `M ${declarationFile}`
  const checks = {
    noRequestFailure: run.requests.every(request => !request.error && !request.failure),
    noRunFailure: run.failure === null,
    operationsComplete: completed.length === options.operations,
    primaryDefinitionsExact: completed.every(operation => operation.primaryDefinition?.exact === true),
    referenceCheckpointsComplete: references.length === expectedCheckpoints,
    referencesExact: references.every(operation => operation.references.validation.pass
      && operation.references.validation.observedCount === 9),
    moduleCheckpointsComplete: secondaryDefinitions.length === expectedCheckpoints,
    secondaryDefinitionsExact: secondaryDefinitions.every(operation => operation.secondaryDefinition.exact),
    pressureCheckpointComplete: pressure.length === 1 && pressure[0].operation === 50
      && pressure[0].pressure.exact,
    postPressureRecovery: run.operations.find(operation => operation.operation === 51)
      ?.primaryDefinition?.exact === true,
    versionedDiagnostics: run.diagnostic?.version === 1
      && isDeepStrictEqual(run.diagnostic?.diagnostics,
        options.benchmarkManifest.query.expectedDiagnostics),
    secondaryVersionedDiagnostics: run.secondaryDiagnostic?.version === 1
      && isDeepStrictEqual(run.secondaryDiagnostic?.diagnostics,
        options.benchmarkManifest.secondaryQuery.expectedDiagnostics),
    catalogReady: run.catalog?.status === "ready",
    cleanExit: run.closeResult?.exit?.code === 0 && run.closeResult?.exit?.signal === null,
    samplerCleanExit: run.samplerExitCode === 0 && !run.samplerStderr,
    rssSamplesPresent: samples.length > 0,
    rssCoversLastOperation: Boolean(finalOperation?.finishedAt
      && samples.at(-1)?.timestamp >= finalOperation.finishedAt),
    targetRssSamplesPresent: rssCoverage.sampleCount > 0,
    targetRssCoversOperations: rssCoverage.coversOperations,
    targetRssContinuous: rssCoverage.continuous,
    noSymbolRequest: forbiddenSymbolRequests.length === 0,
    cloneOnlyScheduledEdit: cloneStatusAfter !== null && cloneStatusAfter === expectedCloneStatus
      && finalOperation?.afterSha256 === finalHash
      && (options.operations % 2 === 0 ? finalHash === input.beforeSourceHash
        : finalText.startsWith("// S05 mixed watched disk edit ")),
    ...(options.postIdleReference ? {
      postIdleCatalogCaughtUp: run.postIdleReference?.readyGeneration
        > run.postIdleReference?.baselineGeneration,
      postIdleReferenceExact: run.postIdleReference?.validation.pass === true
        && run.postIdleReference?.validation.observedCount === 9,
      postIdleIndexedRoute: run.postIdleReference?.route.cacheMiss === true
        && run.postIdleReference?.route.recovered === true
        && run.postIdleReference?.route.accepted === true
        && run.postIdleReference?.route.indexedPlan === true
        && run.postIdleReference?.route.fallback === false,
      postIdleRssCoversQuery: postIdleRssCoverage?.coversOperations === true
        && postIdleRssCoverage.continuous === true,
    } : {}),
  }
  return {
    schemaVersion: 1,
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    benchmarkId: options.benchmarkManifest.benchmarkId,
    scope: "S05 persistent-session Settings/API24 resource-trend checkpoint",
    checks,
    environment: {
      sourceWorkspace: input.originalRoot, sourceHead: input.originalHead,
      sourceCleanBefore: true, cloneKind: "private-local-no-hardlinks",
      cloneHead: gitValue(input.clone, ["rev-parse", "HEAD"]), cloneStatusAfter,
      sdk: options.sdk, sdkMetadata: input.sdkMetadata, sdkDeclarationDigest: input.sdkDigest,
      node: process.execPath, nodeVersion: process.version,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      server: options.server, serverSha256: sha256File(options.server),
      semanticWorkerSha256: options.semanticWorkerSha256,
      referenceVerifierWorkerSha256: options.referenceVerifierWorkerSha256,
      standardLibrarySha256: options.standardLibrarySha256,
      sidecar: options.sidecar, sidecarSha256: sha256File(options.sidecar),
      oracle: options.oracle, oracleSha256: sha256File(options.oracle),
      manifest: options.manifest, manifestSha256: sha256File(options.manifest),
      launch: { command: process.execPath, args: [options.server, "--stdio"] },
      effectiveArktsEnvironment: Object.fromEntries(Object.entries(run.environment)
        .filter(([name]) => name.startsWith("ARKTS_")).map(([name, value]) => (
          [name, name.endsWith("_DIR") ? "<private>" : value]
        ))),
      sessionReuse: options.sessionReuse, trace: options.trace,
      indexRejectionSnapshot: options.indexRejectionSnapshot,
      postIdleReference: options.postIdleReference,
    },
    target: {
      file: consumerFile, symbol, position, declarationFile,
      declarationSourceSha256: input.beforeSourceHash,
      consumerSourceSha256: input.beforeConsumerHash,
      secondaryFile, secondaryPosition, secondarySourceSha256: input.secondaryHash,
      editedDeclarationSha256: finalHash,
      includeDeclaration: false,
    },
    schedule: { kind: "seeded-comment-payload-fixed-checkpoints",
      seed: run.schedule.seed, digestSha256: run.schedule.digest,
      operationsRequested: options.operations, operations: run.schedule.schedule },
    operationSummary: { completed: completed.length,
      referenceCheckpoints: references.length, moduleCheckpoints: secondaryDefinitions.length,
      pressureCheckpoints: pressure.length },
    targetPid: run.targetPid, samplerPid: run.samplerPid,
    samplerExitCode: run.samplerExitCode, samplerSignal: run.samplerSignal,
    catalog: run.catalog, diagnostic: run.diagnostic,
    secondaryDiagnostic: run.secondaryDiagnostic,
    receivedDiagnostics: run.receivedDiagnostics,
    operations: run.operations, requests: run.requests,
    postIdleReference: run.postIdleReference,
    expectedComparableLocations: {
      original: run.originalOracle.locations, shifted: run.shiftedOracle.locations,
    },
    requestEvidence: { methods, forbiddenSymbolRequests,
      protocolEntryCount: transcript.totalEntries,
      receivedMethodChronology: transcript.entries
        .filter(entry => entry.direction === "receive")
        .map(({ sequence, kind, method }) => ({ sequence, kind, method })) },
    memory: {
      measurementKind: "external-process-tree-rss", sampleIntervalMs: options.sampleIntervalMs,
      observedSampleIntervalsMs: sampleIntervalsMs,
      sampleCount: samples.length,
      targetRssCoverage: rssCoverage,
      postIdleTargetRssCoverage: postIdleRssCoverage,
      peakNodeRssBytes: maxNullable(samples.map(sample => serverRss(sample, run.targetPid))),
      peakTreeRssBytes: maxNullable(samples.map(sample => sample.totalRssBytes)),
      peakSamplerRssBytes: maxNullable(samples.map(sample => sample.samplerRssBytes)),
      peakHarnessRssBytes: maxNullable(run.events.map(event => event.harnessRssBytes)),
      samples,
    },
    timeline, serverEvents: readStructuredLogs(run.logDir),
    indexRejectionSnapshots: run.indexRejectionSnapshots,
    samplerStderr: run.samplerStderr, closeResult: run.closeResult, failure: run.failure,
  }
}

export function targetRssCoverage(samples, pid, firstStartedAt, lastFinishedAt, sampleIntervalMs) {
  const targetSamples = samples.filter(sample => Number.isFinite(sample.timestamp)
    && Number.isFinite(serverRss(sample, pid)) && serverRss(sample, pid) > 0)
  const gaps = targetSamples.slice(1).map((sample, index) => (
    sample.timestamp - targetSamples[index].timestamp
  ))
  const maxAllowedGapMs = Math.max(1000, sampleIntervalMs * 10)
  return {
    sampleCount: targetSamples.length,
    maxGapMs: gaps.length > 0 ? gaps.reduce((max, gap) => Math.max(max, gap), 0) : null,
    maxAllowedGapMs,
    coversOperations: Number.isFinite(firstStartedAt) && Number.isFinite(lastFinishedAt)
      && targetSamples.length > 0 && targetSamples[0].timestamp <= firstStartedAt
      && targetSamples.at(-1).timestamp >= lastFinishedAt,
    continuous: targetSamples.length > 1
      && gaps.every(gap => gap >= 0 && gap <= maxAllowedGapMs),
  }
}

function serverRss(sample, pid) {
  return sample?.processes.find(value => value.role === "server" && value.pid === pid)?.rssBytes ?? null
}
