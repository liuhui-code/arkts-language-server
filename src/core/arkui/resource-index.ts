import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

import type { SemanticTextRange } from "../protocol.js"
import { spanToRange } from "../types/text-position.js"

const MAX_VISITED_ENTRIES = 20_000
const MAX_DIRECTORY_ENTRIES = 4_096
const MAX_RESOURCE_FILES = 256
const MAX_RESOURCE_FILE_BYTES = 1 * 1_024 * 1_024
const MAX_RESOURCE_BYTES = 8 * 1_024 * 1_024
const MAX_RESOURCE_ENTRIES = 10_000
const EXCLUDED_DIRECTORIES = new Set([
  ".arkline",
  ".git",
  "build",
  "node_modules",
  "oh_modules",
])
const RESOURCE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/u

export interface ArkUIStringResource {
  reference: string
  name: string
  value?: string
  path: string
  range: SemanticTextRange
}

export interface ArkUIResourceIndexOptions {
  maxVisitedEntries?: number
  maxDirectoryEntries?: number
  maxResourceFiles?: number
  maxResourceFileBytes?: number
  maxResourceBytes?: number
  maxResourceEntries?: number
}

interface ResourceIndexLimits {
  maxVisitedEntries: number
  maxDirectoryEntries: number
  maxResourceFiles: number
  maxResourceFileBytes: number
  maxResourceBytes: number
  maxResourceEntries: number
}

export class ArkUIResourceIndex {
  private readonly rootPath: string
  private readonly canonicalRoot: string
  private readonly limits: ResourceIndexLimits
  private snapshot: ArkUIStringResource[] | undefined

  constructor(workspaceRoot: string, options: ArkUIResourceIndexOptions = {}) {
    this.rootPath = path.resolve(workspaceRoot)
    this.canonicalRoot = canonicalPath(this.rootPath)
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

  findByPrefix(referencePrefix: string): ArkUIStringResource[] {
    const resources = this.load()
    const seen = new Set<string>()
    return resources.filter((resource) => {
      if (!resource.reference.startsWith(referencePrefix) || seen.has(resource.reference)) return false
      seen.add(resource.reference)
      return true
    })
  }

  findExact(reference: string): ArkUIStringResource[] {
    return this.load().filter((resource) => resource.reference === reference)
  }

  invalidate(): void {
    this.snapshot = undefined
  }

  dispose(): void {
    this.snapshot = undefined
  }

  private load(): ArkUIStringResource[] {
    if (this.snapshot) return this.snapshot
    const files = discoverStringResourceFiles(
      this.rootPath,
      this.canonicalRoot,
      this.limits,
    )
    if (!files) return (this.snapshot = [])

    let totalBytes = 0
    const resources: ArkUIStringResource[] = []
    for (const filePath of files) {
      const stat = safeStat(filePath)
      if (!stat || !stat.isFile() || stat.size > this.limits.maxResourceFileBytes) {
        return (this.snapshot = [])
      }
      totalBytes += stat.size
      if (totalBytes > this.limits.maxResourceBytes) return (this.snapshot = [])
      const content = safeRead(filePath)
      if (content === null) continue
      const parsed = parseStringResources(filePath, content)
      if (resources.length + parsed.length > this.limits.maxResourceEntries) {
        return (this.snapshot = [])
      }
      resources.push(...parsed)
    }
    resources.sort(compareResources)
    this.snapshot = resources
    return resources
  }
}

function discoverStringResourceFiles(
  rootPath: string,
  canonicalRoot: string,
  limits: ResourceIndexLimits,
): string[] | null {
  const pending = [rootPath]
  const files: string[] = []
  let visitedEntries = 0
  while (pending.length > 0) {
    const directoryPath = pending.pop()
    if (!directoryPath) break
    const entries = safeReadDirectory(directoryPath)
    if (!entries || entries.length > limits.maxDirectoryEntries) return null
    entries.sort((left, right) => ordinalCompare(left.name, right.name))
    const directories: string[] = []
    for (const entry of entries) {
      visitedEntries += 1
      if (visitedEntries > limits.maxVisitedEntries) return null
      if (entry.isSymbolicLink()) continue
      const candidatePath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) directories.push(candidatePath)
        continue
      }
      if (!entry.isFile() || !isStringResourcePath(candidatePath)) continue
      const canonicalCandidate = canonicalPath(candidatePath)
      if (!isInside(canonicalRoot, canonicalCandidate)) continue
      files.push(candidatePath)
      if (files.length > limits.maxResourceFiles) return null
    }
    for (let index = directories.length - 1; index >= 0; index -= 1) {
      pending.push(directories[index])
    }
  }
  files.sort(ordinalCompare)
  return files
}

function isStringResourcePath(filePath: string): boolean {
  if (path.basename(filePath) !== "string.json") return false
  if (path.basename(path.dirname(filePath)) !== "element") return false
  let current = path.dirname(path.dirname(filePath))
  while (current !== path.dirname(current)) {
    if (path.basename(current) === "resources") return true
    current = path.dirname(current)
  }
  return false
}

function parseStringResources(filePath: string, content: string): ArkUIStringResource[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.string)) return []
  const declarations = parsed.string
  if (!declarations.every((entry) => (
    isRecord(entry)
    && typeof entry.name === "string"
    && RESOURCE_NAME.test(entry.name)
    && (entry.value === undefined || typeof entry.value === "string")
  ))) return []

  const locations = resourceNameLocations(content)
  if (locations.length !== declarations.length) return []
  const resources: ArkUIStringResource[] = []
  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index]
    if (!isRecord(declaration) || typeof declaration.name !== "string") return []
    const location = locations[index]
    if (!location || location.name !== declaration.name) return []
    resources.push({
      reference: `app.string.${declaration.name}`,
      name: declaration.name,
      ...(typeof declaration.value === "string" ? { value: declaration.value } : {}),
      path: filePath,
      range: spanToRange(content, location.start, location.length),
    })
  }
  return resources
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

function ordinalCompare(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
