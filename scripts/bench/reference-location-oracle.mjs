import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export function loadOracle(fileName, currentWorkspace) {
  const value = JSON.parse(fs.readFileSync(fileName, "utf8"))
  if (value?.schemaVersion === 1 && Array.isArray(value.locations)) {
    const locations = value.locations.map(({ file, range }) => {
      if (typeof file !== "string" || !file || path.isAbsolute(file) || file.includes("\\")) {
        throw new Error("oracle location must have a workspace-relative POSIX file")
      }
      const target = path.resolve(currentWorkspace, file)
      const relative = path.relative(currentWorkspace, target)
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("oracle location escapes workspace")
      }
      validateRange(fs.readFileSync(target, "utf8"), range)
      return { uri: pathToFileURL(target).href, range }
    })
    return { locations: comparableLocations(locations, currentWorkspace) }
  }
  const locations = Array.isArray(value) ? value : value.normalizedReferences
  if (!Array.isArray(locations)) {
    throw new Error("oracle must be a Location array or a replay report with normalizedReferences")
  }
  const oracleWorkspace = Array.isArray(value) ? currentWorkspace : value.environment?.workspace
  if (!oracleWorkspace) throw new Error("oracle report does not identify its workspace")
  return { locations: comparableLocations(normalizeReferences(locations), oracleWorkspace) }
}

export function validateLocations(locations, comparable, expected, workspace) {
  const errors = []
  for (const location of locations) {
    try {
      const fileName = fileURLToPath(location.uri)
      const relative = path.relative(workspace, fileName)
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        errors.push(`reference outside workspace: ${location.uri}`)
        continue
      }
      validateRange(fs.readFileSync(fileName, "utf8"), location.range)
    } catch (error) {
      errors.push(error.message)
    }
  }
  if (!same(comparable, expected.locations)) errors.push("normalized Location set differs from oracle")
  return {
    pass: errors.length === 0,
    expectedCount: expected.locations.length,
    observedCount: locations.length,
    errors,
  }
}

function validateRange(text, range) {
  const lines = text.split(/\r?\n/u)
  const { start, end } = range ?? {}
  if (!validPosition(start, lines) || !validPosition(end, lines)) {
    throw new Error("reference has an invalid UTF-16 range")
  }
  if (end.line < start.line || (end.line === start.line && end.character < start.character)) {
    throw new Error("reference range ends before it starts")
  }
}

export function validPosition(position, lines) {
  return Number.isSafeInteger(position?.line)
    && position.line >= 0
    && position.line < lines.length
    && Number.isSafeInteger(position.character)
    && position.character >= 0
    && position.character <= lines[position.line].length
}

export function comparableLocations(locations, workspace) {
  return locations.map(({ uri, range }) => {
    const fileName = fileURLToPath(uri)
    const relative = path.relative(workspace, fileName).split(path.sep).join("/")
    return { file: relative, range }
  }).sort((left, right) => (
    ordinalCompare(left.file, right.file)
    || left.range.start.line - right.range.start.line
    || left.range.start.character - right.range.start.character
    || left.range.end.line - right.range.end.line
    || left.range.end.character - right.range.end.character
  ))
}

export function normalizeReferences(value) {
  if (!Array.isArray(value)) return []
  return value.map(({ uri, range }) => ({ uri, range })).sort((left, right) => (
    ordinalCompare(left.uri, right.uri)
    || left.range.start.line - right.range.start.line
    || left.range.start.character - right.range.start.character
    || left.range.end.line - right.range.end.line
    || left.range.end.character - right.range.end.character
  ))
}

export function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
