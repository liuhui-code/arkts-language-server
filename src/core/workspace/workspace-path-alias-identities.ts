import fs from "node:fs"
import path from "node:path"
import { canonicalSourcePath } from "./physical-path-identity.js"

const CASE_FOLDED_PATH_IDENTITY_PREFIX = "\0case-folded:"

export function sourcePathIdentities(filePath: string): string[] {
  const resolved = path.resolve(filePath)
  const physical = canonicalSourcePath(resolved)
  return [...new Set([
    resolved,
    physical,
    caseFoldedPathIdentity(resolved),
    caseFoldedPathIdentity(physical),
  ])]
}

export function createdSourcePathIdentities(source: { path: string; physicalPath?: string }): string[] {
  const resolved = path.resolve(source.path)
  const physical = source.physicalPath ?? canonicalSourcePath(resolved)
  const identities = [resolved, physical]
  if (hasCaseInsensitiveAlias(resolved, physical)) {
    identities.push(caseFoldedPathIdentity(resolved), caseFoldedPathIdentity(physical))
  }
  return [...new Set(identities)]
}

function caseFoldedPathIdentity(filePath: string): string {
  return `${CASE_FOLDED_PATH_IDENTITY_PREFIX}${filePath.toLowerCase()}`
}

function hasCaseInsensitiveAlias(filePath: string, physicalPath: string): boolean {
  const basename = path.basename(filePath)
  const alternateBasename = toggleAsciiCase(basename)
  if (alternateBasename === basename) return false
  try {
    return fs.realpathSync.native(path.join(path.dirname(filePath), alternateBasename)) === physicalPath
  } catch {
    return false
  }
}

function toggleAsciiCase(value: string): string {
  const index = value.search(/[A-Za-z]/)
  if (index < 0) return value
  const character = value[index]
  const toggled = character === character.toLowerCase()
    ? character.toUpperCase()
    : character.toLowerCase()
  return `${value.slice(0, index)}${toggled}${value.slice(index + 1)}`
}
