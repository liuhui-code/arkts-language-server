import path from "node:path"

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
