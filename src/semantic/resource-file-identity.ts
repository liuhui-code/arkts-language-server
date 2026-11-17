import fs from "node:fs"
import path from "node:path"

import { createProjectSourceEligibility } from "../core/workspace/project-source-eligibility.js"
import { relativePathWithinRoot } from "../project/path-identity.js"
import { isArkUIStringResourcePath } from "../core/arkui/resource-path.js"
import type { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import { resourceEventPath, toFilePath } from "./semantic-worker-file-identity.js"

/** Classifies resources using the existing project and physical-path authority. */
export function isProjectResourceFile(resolver: LocalPackageResolver, rootUri: string, fileUri: string): boolean {
  const root = toFilePath(rootUri)
  const candidate = toFilePath(fileUri)
  if (!root || !candidate) return false
  const scope = resolver.projectFor(root).scopeFor(candidate)
  if (scope.status === "unconfigured") return isArkUIStringResourcePath(candidate)
  if (scope.status !== "ready") return false
  const physicalCandidate = resourceEventPath(candidate)
  return scope.resourceRoots.some((resourceRoot) => {
    const segments = path.relative(resourceEventPath(resourceRoot), physicalCandidate).split(path.sep)
    return segments.length === 3 && segments[0] !== ".."
      && segments[1] === "element" && segments[2] === "string.json"
  })
}

/** False is a proven configured namespace exclusion, never a filename guess.
 * Unknown/legacy scope, changed configuration or a physical alias is relevant.
 * This only classifies input domains; it cannot certify query freshness. */
export function isProjectSourceNamespace(resolver: LocalPackageResolver, rootUri: string, fileUri: string): boolean {
  const root = toFilePath(rootUri), candidate = toFilePath(fileUri)
  if (!root || !candidate) return true
  try {
    if (resolver.refreshInputGeneration(root, () => {})) return true
    const current = resolver.configurationFreshness(root, () => {}, "capture")
    const project = resolver.projectFor(root)
    if (project.scopeFor(candidate).status !== "ready") return true
    const relative = relativePathWithinRoot(root, candidate)
    if (relative === undefined) return true
    const actualRoot = fs.realpathSync.native(root), actual = fs.realpathSync.native(candidate)
    const entry = fs.statSync(candidate, { bigint: true })
    if (!entry.isFile() || entry.nlink !== 1n) return true
    if (relativePathWithinRoot(path.join(actualRoot, relative), actual) !== "") return true
    const scope = project.scopeFor(candidate)
    const physicalRoots = scope.sourceRoots.map(source => fs.realpathSync.native(source))
    const physicalOverlap = physicalRoots.some(source => relativePathWithinRoot(source, actual) !== undefined
      || relativePathWithinRoot(actual, source) !== undefined)
    const eligibility = createProjectSourceEligibility(project, () => {})
    const relevant = physicalOverlap || eligibility.includes(candidate, true, actual)
    eligibility.validate()
    if (scope.sourceRoots.some((source, index) => fs.realpathSync.native(source) !== physicalRoots[index])) return true
    const final = fs.statSync(candidate, { bigint: true })
    if (!final.isFile() || final.nlink !== 1n || final.dev !== entry.dev || final.ino !== entry.ino
      || final.birthtimeNs !== entry.birthtimeNs || fs.realpathSync.native(candidate) !== actual
      || fs.realpathSync.native(root) !== actualRoot) return true
    return current?.() === true ? relevant : true
  } catch { return true }
}
