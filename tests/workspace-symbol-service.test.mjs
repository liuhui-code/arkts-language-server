import assert from "node:assert/strict"
import test from "node:test"

import { buildWorkspaceServiceDriver } from "./support/build-workspace-service-driver.mjs"

const driver = buildWorkspaceServiceDriver()

test("searches ready roots and overlays without waiting for another root to open", async () => {
  const result = await driver.searchDoesNotWaitForAnUnopenedRoot()
  assert.ok(result.durationMs < 250, `search was blocked for ${result.durationMs}ms`)
  assert.deepEqual(result.names, ["OverlayResult"])
})

test("cancels promptly when an index provider ignores AbortSignal", async () => {
  const result = await driver.cancellationDoesNotWaitForAnIgnoringProvider()
  assert.equal(result.rejected, true)
  assert.equal(result.name, "AbortError")
  assert.ok(result.durationMs < 250, `cancellation took ${result.durationMs}ms`)
})

test("cancels promptly when an overlay provider ignores AbortSignal", async () => {
  const result = await driver.cancellationDoesNotWaitForAnIgnoringOverlayProvider()
  assert.equal(result.rejected, true)
  assert.equal(result.name, "AbortError")
  assert.ok(result.durationMs < 250, `overlay cancellation took ${result.durationMs}ms`)
})

test("closes a workspace again when its delayed open finishes after disposal", async () => {
  const result = await driver.disposeClosesAnIndexThatFinishesOpeningLate()
  assert.equal(result.closeCount, 2)
})

test("disposal waits until the workspace index has actually closed", async () => {
  const result = await driver.disposalWaitsForIndexClose()
  assert.equal(result.disposedBeforeIndexClose, false)
  assert.equal(result.disposedAfterIndexClose, true)
})

test("disposal drains an in-flight open and its late index close", async () => {
  const result = await driver.disposalWaitsForLateOpenAndClose()
  assert.equal(result.disposedBeforeOpen, false)
  assert.equal(result.disposedBeforeLateClose, false)
  assert.equal(result.disposedAfterClose, true)
})

test("closes a workspace that finishes opening after catalog cancellation", async () => {
  const result = await driver.cancellationClosesAnIndexThatFinishesOpeningLate()
  assert.equal(result.closeCount, 1)
})

test("reports partial completeness when any configured workspace failed to open", async () => {
  const result = await driver.failedRootsKeepResultsPartial()
  assert.deepEqual(result.names, ["PersistedResult"])
  assert.equal(result.completeness, "partial")
})

test("reports partial completeness when an open overlay cannot be extracted", async () => {
  const result = await driver.failedOverlayExtractionKeepsResultsPartial()
  assert.deepEqual(result.names, ["PersistedResult"])
  assert.equal(result.completeness, "partial")
})

test("terminates progress immediately for a workspace with no roots", () => {
  assert.deepEqual(driver.anEmptyWorkspaceSetTerminatesProgress(), [{
    phase: "ready",
    discoveredFiles: 0,
    indexedFiles: 0,
    skippedEntries: 0,
    totalFiles: 0,
  }])
})

test("preserves observed counters when cataloging degrades", async () => {
  assert.deepEqual(await driver.catalogFailurePreservesObservedProgress(), {
    phase: "degraded",
    discoveredFiles: 3,
    indexedFiles: 1,
    skippedEntries: 2,
    totalFiles: 3,
  })
})

test("excludes open document URIs inside the index before applying the result limit", async () => {
  const result = await driver.openDocumentUrisAreExcludedBeforeTheIndexLimit()
  assert.deepEqual(result.excludedUris, ["file:///FastRoot/Open.ets"])
  assert.deepEqual(result.names, ["TargetValid"])
})
