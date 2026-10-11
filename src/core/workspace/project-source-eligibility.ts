import fs from "node:fs"
import path from "node:path"

import type { HarmonyProjectModel } from "../../project/harmony-project-model.js"
import { containsResolvedPath } from "../../project/resolved-path-containment.js"
import { canonicalSourcePath } from "./physical-path-identity.js"

export function isActiveProjectSource(
  project: HarmonyProjectModel,
  sourcePath: string,
  directoryTraversal = false,
  resolvedPhysicalPath?: string,
  resolveContainer: (containerPath: string) => string = canonicalSourcePath,
): boolean {
  const { scope, physicalPath } = project.resolveSourceScope(sourcePath, resolvedPhysicalPath)
  if (scope.status === "unconfigured") return true
  if (!scope.moduleRoot || !physicalPath) {
    return directoryTraversal && project.mayContainDeclaredModule(sourcePath)
  }
  const resolvedPath = path.resolve(sourcePath)
  const sourceParent = path.join(scope.moduleRoot, "src")
  const physicalParent = resolveContainer(sourceParent)
  if (physicalParent === physicalPath) return true
  if (!containsResolvedPath(physicalParent, physicalPath)) {
    if (directoryTraversal) return project.mayContainDeclaredModule(sourcePath)
    const moduleRoot = path.resolve(scope.moduleRoot)
    return path.dirname(resolvedPath) === moduleRoot
      && path.dirname(physicalPath) === resolveContainer(moduleRoot)
  }
  const activeLexicalSource = scope.status === "ready" && scope.sourceRoots.some((sourceRoot) => (
    containsResolvedPath(sourceRoot, resolvedPath)
  ))
  const activePhysicalSource = scope.status === "ready"
    && project.physicalSourceRootsFor(scope).some((physicalRoot) => {
      return containsResolvedPath(physicalRoot, physicalPath)
    })
  const activeSource = activeLexicalSource && activePhysicalSource
  return activeSource || (directoryTraversal && project.mayContainDeclaredModule(sourcePath))
}

/** Bounded, single-scan container witnesses; never a cross-query validity cache. */
export function createProjectSourceEligibility(project: HarmonyProjectModel, checkpoint: () => void) {
  const containers = new Map<string, string>()
  let pathBytes = 0
  const resolveContainer = (containerPath: string): string => {
    const cached = containers.get(containerPath)
    if (cached !== undefined) return cached
    let physicalContainer: string
    try { physicalContainer = fs.realpathSync.native(containerPath) }
    catch { return canonicalSourcePath(containerPath) }
    const bytes = Buffer.byteLength(containerPath) + Buffer.byteLength(physicalContainer)
    if (containers.size < 512 && pathBytes + bytes <= 64 * 1024) {
      containers.set(containerPath, physicalContainer)
      pathBytes += bytes
    }
    return physicalContainer
  }
  return {
    includes(sourcePath: string, directoryTraversal = false, physicalPath?: string): boolean {
      return isActiveProjectSource(project, sourcePath, directoryTraversal, physicalPath, resolveContainer)
    },
    validate(): void {
      for (const [containerPath, physicalContainer] of containers) {
        checkpoint()
        if (fs.realpathSync.native(containerPath) !== physicalContainer) {
          throw new Error("project source container changed during membership enumeration")
        }
      }
      checkpoint()
    },
  }
}
