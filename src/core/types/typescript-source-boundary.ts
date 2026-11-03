import fs from "node:fs"
import path from "node:path"
import type { SemanticCallHierarchyFailureReason } from "../protocol.js"

export interface ModuleBoundary {
  rootPath: string
  workspacePhysicalRoot: string | undefined
  sdkRoot: string | null
  sdkPhysicalRoot: string | undefined
  sdkComponents?: readonly import("../sdk/environment.js").SdkComponent[]
}

/** Lexical and physical roots remain separate; unsaved overlays may lack a disk leaf. */
export function relativeModuleBoundary(containingFile: string, hasScript: boolean,
  { rootPath, workspacePhysicalRoot, sdkRoot, sdkPhysicalRoot, sdkComponents }: ModuleBoundary): string | undefined {
  let physicalContainingFile: string
  try {
    physicalContainingFile = hasScript ? prospectiveRealPathSync(containingFile) : fs.realpathSync.native(containingFile)
  } catch { return undefined }
  const workspaceOwns = !!workspacePhysicalRoot && isWithinRoot(workspacePhysicalRoot, physicalContainingFile)
  if (isWithinRoot(rootPath, containingFile) && !workspaceOwns) return undefined
  const narrowerWorkspace = (sdkPhysical: string) => workspaceOwns && workspacePhysicalRoot
    && isWithinRoot(sdkPhysical, workspacePhysicalRoot)
  // The narrower physical owner wins; lexical escapes never acquire another root's authority.
  for (const component of sdkComponents ?? []) {
    const physical = isWithinRoot(component.physicalRoot, physicalContainingFile)
    if (isWithinRoot(component.root, containingFile) || physical) {
      if (narrowerWorkspace(component.physicalRoot)) return rootPath
      return !component.issue && physical ? component.root : undefined
    }
  }
  if (sdkRoot && sdkPhysicalRoot && (isWithinRoot(sdkRoot, containingFile)
    || isWithinRoot(sdkPhysicalRoot, physicalContainingFile))) {
    if (narrowerWorkspace(sdkPhysicalRoot)) return rootPath
    return isWithinRoot(sdkPhysicalRoot, physicalContainingFile) ? sdkRoot : undefined
  }
  if (isWithinRoot(rootPath, containingFile)) {
    return workspacePhysicalRoot && isWithinRoot(workspacePhysicalRoot, physicalContainingFile) ? rootPath : undefined
  }
  if (workspacePhysicalRoot && isWithinRoot(workspacePhysicalRoot, physicalContainingFile)) return rootPath
  return undefined
}

export function isWithinRoot(rootPath: string, filePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function canonicalExistingPath(filePath: string): string | undefined {
  try { return fs.realpathSync.native(filePath) }
  catch { return undefined }
}

export function callHierarchyPathFailure(rootPath: string, filePath: string,
  allowMissingSource: boolean): SemanticCallHierarchyFailureReason | undefined {
  if (!isWithinRoot(rootPath, filePath)) return "source-outside-workspace"
  try {
    const realRoot = fs.realpathSync.native(rootPath)
    const realSource = allowMissingSource ? prospectiveRealPathSync(filePath) : fs.realpathSync.native(filePath)
    return isWithinRoot(realRoot, realSource) ? undefined : "source-outside-workspace"
  } catch { return "source-unavailable" }
}

export function prospectiveRealPathSync(filePath: string): string {
  let cursor = filePath
  const suffix: string[] = []
  while (true) {
    try { return path.join(fs.realpathSync.native(cursor), ...suffix) }
    catch {
      const parent = path.dirname(cursor)
      if (parent === cursor) throw new Error(`No existing ancestor for ${filePath}`)
      suffix.unshift(path.basename(cursor))
      cursor = parent
    }
  }
}
