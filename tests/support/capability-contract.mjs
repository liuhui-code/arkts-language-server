import { isDeepStrictEqual } from "node:util"

export const CURRENT_LSP_CAPABILITY_CONTRACT = Object.freeze({
  allowedTopLevel: Object.freeze([
    "completionProvider",
    "definitionProvider",
    "documentSymbolProvider",
    "hoverProvider",
    "positionEncoding",
    "signatureHelpProvider",
    "textDocumentSync",
    "workspaceSymbolProvider",
  ]),
  required: Object.freeze([
    { path: "positionEncoding", expected: "utf-16" },
    { path: "textDocumentSync.openClose", expected: true },
    { path: "textDocumentSync.change", expected: 2 },
    { path: "completionProvider.triggerCharacters", expected: ["."] },
    { path: "completionProvider.resolveProvider", expected: true },
    { path: "definitionProvider", expected: true },
    { path: "hoverProvider", expected: true },
    { path: "signatureHelpProvider.triggerCharacters", expected: ["(", ","] },
    { path: "documentSymbolProvider", expected: true },
    { path: "workspaceSymbolProvider", expected: true },
  ]),
  absent: Object.freeze([
    "referencesProvider",
    "renameProvider",
    "codeActionProvider",
  ]),
})

export function assertLspCapabilityContract(capabilities, contract) {
  const differences = capabilityContractDifferences(capabilities, contract)
  if (differences.length === 0) return

  throw new Error([
    "LSP capability contract mismatch:",
    ...differences.map(formatDifference),
  ].join("\n"))
}

export function capabilityContractDifferences(capabilities, contract) {
  const differences = []

  for (const { path, expected } of contract.required) {
    const actual = valueAtPath(capabilities, path)
    if (!actual.found) {
      differences.push({ kind: "missing", path, expected })
    } else if (!isDeepStrictEqual(actual.value, expected)) {
      differences.push({ kind: "mismatch", path, expected, actual: actual.value })
    }
  }

  for (const path of contract.absent) {
    const actual = valueAtPath(capabilities, path)
    if (actual.found) differences.push({ kind: "unexpected", path, actual: actual.value })
  }

  const allowedTopLevel = new Set(contract.allowedTopLevel)
  const reportedPaths = new Set(differences.map(({ path }) => path))
  for (const path of Object.keys(capabilities).sort()) {
    if (!allowedTopLevel.has(path) && !reportedPaths.has(path)) {
      differences.push({ kind: "unexpected", path, actual: capabilities[path] })
    }
  }

  return differences
}

function valueAtPath(root, path) {
  let value = root
  for (const segment of path.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) {
      return { found: false }
    }
    value = value[segment]
  }
  return { found: true, value }
}

function formatDifference(difference) {
  if (difference.kind === "missing") {
    return `- ${difference.path}: missing; expected ${display(difference.expected)}`
  }
  if (difference.kind === "mismatch") {
    return `- ${difference.path}: expected ${display(difference.expected)}, received ${display(difference.actual)}`
  }
  return `- ${difference.path}: must be absent, received ${display(difference.actual)}`
}

function display(value) {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? String(value) : serialized
}
