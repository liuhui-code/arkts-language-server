import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"

import { validPosition } from "./reference-location-oracle.mjs"

/** Frozen fixture facts are supplied independently, never queried from the candidate. */
export function readWorkflowOracle(file, input) {
  if (!file) return null
  const bytes = fs.readFileSync(file)
  const oracle = JSON.parse(bytes)
  const invalid = reason => { throw new Error(`WORKFLOW_ORACLE_INVALID=${reason}`) }
  if (oracle.schemaVersion !== 1 || oracle.verified !== true) invalid("UNVERIFIED")
  if (oracle.inputIdentity?.sdkDeclarationDigest !== input.sdkDeclarationDigest
    || oracle.inputIdentity?.workspaceFilesSha256 !== digestFixtureFiles(input.workspace)) invalid("INPUT_IDENTITY")
  if (!isDeepStrictEqual(oracle.query, input.query)) invalid("QUERY_IDENTITY")
  for (const kind of ["definition", "references"]) {
    if (!Array.isArray(oracle[kind]?.locations)) invalid("LOCATION_SET")
    const keys = new Set()
    const locations = []
    for (const location of oracle[kind].locations) {
      const relative = location?.file
      if (typeof relative !== "string" || !relative || path.isAbsolute(relative)
        || relative.includes("\\") || relative.split("/").includes("..")) invalid("LOCATION_PATH")
      const text = relative === input.query.file ? input.source
        : fs.readFileSync(path.join(input.workspace, relative), "utf8")
      const lines = text.split(/\r?\n/u)
      const { start, end } = location.range ?? {}
      if (!validPosition(start, lines) || !validPosition(end, lines)
        || end.line < start.line || end.line === start.line && end.character < start.character) invalid("LOCATION_RANGE")
      const key = JSON.stringify([relative, start.line, start.character, end.line, end.character])
      if (keys.has(key)) invalid("DUPLICATE_LOCATION")
      keys.add(key)
      locations.push({ file: relative, range: {
        start: { line: start.line, character: start.character },
        end: { line: end.line, character: end.character },
      } })
    }
    oracle[kind] = { locations }
  }
  if (oracle.completion !== undefined) {
    const snapshots = oracle.completion?.snapshots
    if (!Array.isArray(snapshots) || snapshots.length !== 3) invalid("COMPLETION_SNAPSHOTS")
    const dotted = input.source.replace("return this.stableMember", "return this.")
    const texts = new Map([[1, dotted], [3, dotted.replace("// benchmark-edit", "// benchmark-edit changed")], [4, dotted]])
    const versions = new Set()
    for (const snapshot of snapshots) {
      const version = snapshot?.query?.documentVersion
      if (!texts.has(version) || versions.has(version)) invalid("COMPLETION_VERSION")
      versions.add(version)
      if (!isDeepStrictEqual(snapshot.query, { file: input.query.file, documentVersion: version,
        position: input.query.position, context: { triggerKind: 1 } })) invalid("COMPLETION_QUERY")
      if (snapshot.sourceSha256 !== createHash("sha256").update(texts.get(version)).digest("hex")) invalid("COMPLETION_SOURCE")
      const result = snapshot.result
      if (result?.isIncomplete !== false || !Array.isArray(result.items)
        || result.items.some(item => !item || typeof item !== "object" || typeof item.label !== "string"
          || !item.label || Object.hasOwn(item, "data"))) invalid("COMPLETION_PAYLOAD")
    }
  }
  return { ...oracle, file, sha256: createHash("sha256").update(bytes).digest("hex") }
}

/** Include every actual fixture path and byte; unrelated growth is not silently dropped. */
function digestFixtureFiles(root) {
  const files = []
  const directories = [""]
  while (directories.length) {
    const directory = directories.pop()
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name)
      if (entry.isDirectory()) directories.push(relative)
      else if (entry.isFile()) files.push(relative)
      else throw new Error(`WORKFLOW_ORACLE_INVALID=NON_REGULAR_INPUT:${relative}`)
    }
  }
  const digest = createHash("sha256")
  for (const file of files.sort()) {
    digest.update(file).update("\0").update(fs.readFileSync(path.join(root, file))).update("\0")
  }
  return digest.digest("hex")
}
