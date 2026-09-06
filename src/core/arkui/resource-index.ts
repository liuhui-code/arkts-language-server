import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

import type { SemanticTextRange } from "../protocol.js"
import { spanToRange } from "../types/text-position.js"
import { isArkUIStringResourcePath } from "./resource-path.js"

const MAX_VISITED_ENTRIES = 20_000
const MAX_DIRECTORY_ENTRIES = 4_096
const MAX_RESOURCE_FILES = 256
const MAX_RESOURCE_FILE_BYTES = 1 * 1_024 * 1_024
const MAX_RESOURCE_BYTES = 8 * 1_024 * 1_024
const MAX_RESOURCE_ENTRIES = 10_000
const MAX_PREFIX_QUERY_RESOURCES = 128
const EXCLUDED_DIRECTORIES = new Set([
  ".arkline",
  ".git",
  "build",
  "node_modules",
  "oh_modules",
])
const RESOURCE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const EMPTY_RESOURCES: readonly ArkUIStringResource[] = Object.freeze([])

export interface ArkUIStringResource {
  reference: string
  name: string
  value?: string
  path: string
  range: SemanticTextRange
}

export type ArkUIResourceIndexStatus = "ready" | "partial" | "unavailable"

export interface ArkUIResourceQueryResult {
  status: ArkUIResourceIndexStatus
  resources: readonly ArkUIStringResource[]
}

export interface ArkUIResourcePrefixQueryResult extends ArkUIResourceQueryResult {
  isIncomplete: boolean
}

export interface ArkUIResourceIndexOptions {
  maxVisitedEntries?: number
  maxDirectoryEntries?: number
  maxResourceFiles?: number
  maxResourceFileBytes?: number
  maxResourceBytes?: number
  maxResourceEntries?: number
  readResourceFile?: (filePath: string) => string | null
}

interface ResourceIndexLimits {
  maxVisitedEntries: number
  maxDirectoryEntries: number
  maxResourceFiles: number
  maxResourceFileBytes: number
  maxResourceBytes: number
  maxResourceEntries: number
}

interface ArkUIResourceSnapshot {
  status: ArkUIResourceIndexStatus
  resources: readonly ArkUIStringResource[]
  uniqueResources: readonly ArkUIStringResource[]
  byReference: ReadonlyMap<string, readonly ArkUIStringResource[]>
}

interface ResourceFileDiscovery {
  status: ArkUIResourceIndexStatus
  files: string[]
}

interface ParsedStringResources {
  status: "ready" | "unavailable"
  resources: ArkUIStringResource[]
}

export class ArkUIResourceIndex {
  private readonly rootPath: string
  private readonly canonicalRoot: string
  private readonly limits: ResourceIndexLimits
  private readonly readResourceFile: (filePath: string) => string | null
  private snapshot: ArkUIResourceSnapshot | undefined

  constructor(workspaceRoot: string, options: ArkUIResourceIndexOptions = {}) {
    this.rootPath = path.resolve(workspaceRoot)
    this.canonicalRoot = canonicalPath(this.rootPath)
    this.readResourceFile = options.readResourceFile ?? safeRead
    this.limits = {
      maxVisitedEntries: boundedLimit(
        options.maxVisitedEntries,
        MAX_VISITED_ENTRIES,
        "visited resource paths",
      ),
      maxDirectoryEntries: boundedLimit(
        options.maxDirectoryEntries,
        MAX_DIRECTORY_ENTRIES,
        "resource directory entries",
      ),
      maxResourceFiles: boundedLimit(
        options.maxResourceFiles,
        MAX_RESOURCE_FILES,
        "resource files",
      ),
      maxResourceFileBytes: boundedLimit(
        options.maxResourceFileBytes,
        MAX_RESOURCE_FILE_BYTES,
        "resource file bytes",
      ),
      maxResourceBytes: boundedLimit(
        options.maxResourceBytes,
        MAX_RESOURCE_BYTES,
        "resource bytes",
      ),
      maxResourceEntries: boundedLimit(
        options.maxResourceEntries,
        MAX_RESOURCE_ENTRIES,
        "resource entries",
      ),
    }
  }

  findByPrefix(referencePrefix: string, requestedLimit: number): ArkUIResourcePrefixQueryResult {
    const snapshot = this.load()
    const limit = boundedLimit(
      requestedLimit,
      MAX_PREFIX_QUERY_RESOURCES,
      "resource prefix query entries",
    )
    const start = lowerBound(snapshot.uniqueResources, referencePrefix)
    const resources: ArkUIStringResource[] = []
    let end = start
    while (
      resources.length < limit
      && end < snapshot.uniqueResources.length
      && snapshot.uniqueResources[end]?.reference.startsWith(referencePrefix)
    ) {
      const resource = snapshot.uniqueResources[end]
      if (resource) resources.push(resource)
      end += 1
    }
    const next = snapshot.uniqueResources[end]
    return Object.freeze({
      status: snapshot.status,
      isIncomplete: snapshot.status !== "ready"
        || next?.reference.startsWith(referencePrefix) === true,
      resources: Object.freeze(resources),
    })
  }

  findExact(reference: string): ArkUIResourceQueryResult {
    const snapshot = this.load()
    return Object.freeze({
      status: snapshot.status,
      resources: snapshot.byReference.get(reference) ?? EMPTY_RESOURCES,
    })
  }

  invalidate(): void {
    this.snapshot = undefined
  }

  dispose(): void {
    this.snapshot = undefined
  }

  private load(): ArkUIResourceSnapshot {
    if (this.snapshot) return this.snapshot
    const discovery = discoverStringResourceFiles(
      this.rootPath,
      this.canonicalRoot,
      this.limits,
    )
    if (discovery.status !== "ready") {
      return (this.snapshot = createSnapshot(discovery.status, []))
    }

    let totalBytes = 0
    let status: ArkUIResourceIndexStatus = "ready"
    const resources: ArkUIStringResource[] = []
    for (const filePath of discovery.files) {
      const stat = safeStat(filePath)
      if (!stat || !stat.isFile()) {
        status = "unavailable"
        continue
      }
      if (stat.size > this.limits.maxResourceFileBytes) {
        return (this.snapshot = createSnapshot("partial", []))
      }
      totalBytes += stat.size
      if (totalBytes > this.limits.maxResourceBytes) {
        return (this.snapshot = createSnapshot("partial", []))
      }
      const content = this.readResourceFile(filePath)
      if (content === null) {
        status = "unavailable"
        continue
      }
      const parsed = parseStringResources(filePath, content)
      if (parsed.status === "unavailable") status = "unavailable"
      if (resources.length + parsed.resources.length > this.limits.maxResourceEntries) {
        return (this.snapshot = createSnapshot("partial", []))
      }
      resources.push(...parsed.resources)
    }
    resources.sort(compareResources)
    return (this.snapshot = createSnapshot(status, resources))
  }
}

function discoverStringResourceFiles(
  rootPath: string,
  canonicalRoot: string,
  limits: ResourceIndexLimits,
): ResourceFileDiscovery {
  const pending = [rootPath]
  const files: string[] = []
  let visitedEntries = 0
  while (pending.length > 0) {
    const directoryPath = pending.pop()
    if (!directoryPath) break
    const entries = safeReadDirectory(directoryPath)
    if (!entries) return { status: "unavailable", files: [] }
    if (entries.length > limits.maxDirectoryEntries) return { status: "partial", files: [] }
    entries.sort((left, right) => ordinalCompare(left.name, right.name))
    const directories: string[] = []
    for (const entry of entries) {
      visitedEntries += 1
      if (visitedEntries > limits.maxVisitedEntries) return { status: "partial", files: [] }
      if (entry.isSymbolicLink()) continue
      const candidatePath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) directories.push(candidatePath)
        continue
      }
      if (!entry.isFile() || !isArkUIStringResourcePath(candidatePath)) continue
      const canonicalCandidate = canonicalPath(candidatePath)
      if (!isInside(canonicalRoot, canonicalCandidate)) continue
      files.push(candidatePath)
      if (files.length > limits.maxResourceFiles) return { status: "partial", files: [] }
    }
    for (let index = directories.length - 1; index >= 0; index -= 1) {
      pending.push(directories[index])
    }
  }
  files.sort(ordinalCompare)
  return { status: "ready", files }
}

function parseStringResources(filePath: string, content: string): ParsedStringResources {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { status: "unavailable", resources: [] }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.string)) {
    return { status: "unavailable", resources: [] }
  }
  const declarations = parsed.string
  if (!declarations.every((entry) => (
    isRecord(entry)
    && typeof entry.name === "string"
    && RESOURCE_NAME.test(entry.name)
    && (entry.value === undefined || typeof entry.value === "string")
  ))) return { status: "unavailable", resources: [] }

  const locations = resourceNameLocations(content)
  if (locations.length !== declarations.length) return { status: "unavailable", resources: [] }
  const resources: ArkUIStringResource[] = []
  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index]
    if (!isRecord(declaration) || typeof declaration.name !== "string") {
      return { status: "unavailable", resources: [] }
    }
    const location = locations[index]
    if (!location || location.name !== declaration.name) {
      return { status: "unavailable", resources: [] }
    }
    resources.push({
      reference: `app.string.${declaration.name}`,
      name: declaration.name,
      ...(typeof declaration.value === "string" ? { value: declaration.value } : {}),
      path: filePath,
      range: spanToRange(content, location.start, location.length),
    })
  }
  return { status: "ready", resources }
}

function resourceNameLocations(content: string): Array<{ name: string; start: number; length: number }> {
  const sourceFile = ts.parseJsonText("string.json", content)
  const statement = sourceFile.statements[0]
  if (!statement || !ts.isExpressionStatement(statement)) return []
  const document = statement.expression
  if (!ts.isObjectLiteralExpression(document)) return []
  const stringProperty = document.properties.find((property) => (
    ts.isPropertyAssignment(property) && propertyName(property.name) === "string"
  ))
  if (!stringProperty || !ts.isPropertyAssignment(stringProperty)) return []
  if (!ts.isArrayLiteralExpression(stringProperty.initializer)) return []
  return stringProperty.initializer.elements.flatMap((element) => {
    if (!ts.isObjectLiteralExpression(element)) return []
    const nameProperty = element.properties.find((property) => (
      ts.isPropertyAssignment(property) && propertyName(property.name) === "name"
    ))
    if (!nameProperty || !ts.isPropertyAssignment(nameProperty)) return []
    const value = nameProperty.initializer
    if (!ts.isStringLiteral(value)) return []
    const tokenStart = value.getStart(sourceFile)
    return [{
      name: value.text,
      start: tokenStart + 1,
      length: Math.max(0, value.end - tokenStart - 2),
    }]
  })
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  return undefined
}

function safeReadDirectory(directoryPath: string): fs.Dirent[] | null {
  try {
    return fs.readdirSync(directoryPath, { withFileTypes: true })
  } catch {
    return null
  }
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath)
  } catch {
    return null
  }
}

function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return null
  }
}

function canonicalPath(candidatePath: string): string {
  const resolved = path.resolve(candidatePath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function boundedLimit(value: number | undefined, hardMaximum: number, label: string): number {
  if (value === undefined) return hardMaximum
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} limit must be a positive safe integer`)
  }
  return Math.min(value, hardMaximum)
}

function compareResources(left: ArkUIStringResource, right: ArkUIStringResource): number {
  return ordinalCompare(left.reference, right.reference)
    || ordinalCompare(left.path, right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
}

function createSnapshot(
  status: ArkUIResourceIndexStatus,
  resources: ArkUIStringResource[],
): ArkUIResourceSnapshot {
  const immutableResources = Object.freeze(resources.map((resource) => Object.freeze({
    ...resource,
    range: Object.freeze({ ...resource.range }),
  })))
  const byReference = new Map<string, ArkUIStringResource[]>()
  for (const resource of immutableResources) {
    const matches = byReference.get(resource.reference)
    if (matches) matches.push(resource)
    else byReference.set(resource.reference, [resource])
  }
  const immutableByReference = new Map<string, readonly ArkUIStringResource[]>()
  for (const [reference, matches] of byReference) {
    immutableByReference.set(reference, Object.freeze(matches))
  }
  return Object.freeze({
    status,
    resources: immutableResources,
    uniqueResources: Object.freeze(
      [...immutableByReference.values()].flatMap((matches) => matches[0] ?? []),
    ),
    byReference: immutableByReference,
  })
}

function lowerBound(resources: readonly ArkUIStringResource[], reference: string): number {
  let low = 0
  let high = resources.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if ((resources[middle]?.reference ?? "") < reference) low = middle + 1
    else high = middle
  }
  return low
}

function ordinalCompare(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
