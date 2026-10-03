import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export function readJson(file) {
  if (fs.statSync(file).size > 32 * 1024 * 1024) throw new Error("spike JSON exceeds 32 MiB")
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

export function readSources(file) {
  const input = readJson(file)
  if (input.schemaVersion !== 1 || !input.files || typeof input.files !== "object"
    || Array.isArray(input.files) || !Object.keys(input.files).length) {
    throw new Error("input requires schemaVersion 1 and nonempty files")
  }
  for (const [name, text] of Object.entries(input.files)) {
    if (!validFile(name) || typeof text !== "string") throw new Error("invalid source file")
  }
  return input
}

export function readQueries(file) {
  const input = readJson(file)
  if (input.schemaVersion !== 1 || !Array.isArray(input.queries) || !input.queries.length) {
    throw new Error("queries requires schemaVersion 1 and nonempty queries")
  }
  const ids = new Set()
  for (const query of input.queries) {
    if (!query || typeof query.id !== "string" || !query.id || ids.has(query.id)
      || !validFile(query.file) || !Number.isSafeInteger(query.line) || query.line < 0
      || !Number.isSafeInteger(query.character) || query.character < 0
      || typeof query.includeDeclaration !== "boolean") throw new Error("invalid or duplicate query")
    ids.add(query.id)
  }
  return input.queries
}

export function validFile(file) {
  return typeof file === "string" && !path.posix.isAbsolute(file) && !file.includes("\\")
    && file.split("/").every((segment) => segment && segment !== "." && segment !== "..")
    && /\.(ets|ts)$/u.test(file)
}

export function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

export function inputIdentity(files) {
  return digest(JSON.stringify(Object.keys(files).sort().map((file) => [file, digest(files[file])])))
}

export function ordinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

export function locationKey(location) {
  return JSON.stringify([location.file, location.start.line, location.start.character,
    location.end.line, location.end.character])
}

export function normalizeLocations(locations) {
  return [...new Map(locations.map((location) => [locationKey(location), location])).values()]
    .sort((left, right) => ordinal(left.file, right.file)
      || left.start.line - right.start.line || left.start.character - right.start.character
      || left.end.line - right.end.line || left.end.character - right.end.character)
}

export function queryOffset(file, query) {
  const start = file?.lineStarts[query.line]
  const end = file?.lineEnds[query.line]
  if (start === undefined || start + query.character >= end) {
    throw new Error(`query ${query.id} is outside its source line`)
  }
  return start + query.character
}
