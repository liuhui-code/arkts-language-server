import fs from "node:fs/promises"
import path from "node:path"

const METADATA_KEYS = ["commit", "platform", "target"]
const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "AggregateError",
])

export async function withTestEvidence({ root, caseId, metadata = {}, captureFailure }, run) {
  await fs.mkdir(root, { recursive: true })
  const evidenceDirectory = await fs.mkdtemp(path.join(root, `${directoryPrefix(caseId)}-`))

  let result
  try {
    result = await run({ evidenceDirectory })
  } catch (error) {
    let captureError
    try {
      if (captureFailure) await captureFailure({ evidenceDirectory })
    } catch (providerError) {
      captureError = providerError
    }
    const failure = {
      schema: "arkts-language-server.test-failure",
      schemaVersion: 1,
      caseId,
      error: errorSummary(error),
      metadata: allowlistedMetadata(metadata),
    }
    if (captureError) failure.captureFailure = captureFailureSummary(captureError)
    await fs.writeFile(
      path.join(evidenceDirectory, "failure.json"),
      `${JSON.stringify(failure, null, 2)}\n`,
    )
    throw error
  }

  await fs.rm(evidenceDirectory, { recursive: true, force: true })
  return result
}

function captureFailureSummary(error) {
  return {
    name: SAFE_ERROR_NAMES.has(error?.name) ? error.name : "Error",
    message: "Failure evidence provider did not complete",
  }
}

function directoryPrefix(caseId) {
  const safe = caseId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return safe || "case"
}

function allowlistedMetadata(metadata) {
  const allowed = {}
  for (const key of METADATA_KEYS) {
    if (isJsonScalar(metadata[key])) allowed[key] = metadata[key]
  }
  return allowed
}

function errorSummary(error) {
  const summary = {
    name: SAFE_ERROR_NAMES.has(error?.name) ? error.name : "Error",
    message: "Test case failed",
  }
  if (isJsonScalar(error?.code)) summary.code = error.code
  if (isJsonScalar(error?.signal)) summary.signal = error.signal
  return summary
}

function isJsonScalar(value) {
  return value === null || ["boolean", "number", "string"].includes(typeof value)
}
