import fs from "node:fs"
import path from "node:path"

import type {
  HarmonyProjectScope, HarmonySemanticGraph, HarmonySemanticUnit, HarmonySemanticUnitIdentity,
} from "./harmony-project-model.js"

const MAX_MODULES = 256
interface SemanticModuleScope {
  readonly name: string
  readonly rootPath: string
  readonly physicalRoot: string
  readonly scope: HarmonyProjectScope
}

export function buildSemanticGraph(
  workspace: string,
  product: string,
  modules: readonly SemanticModuleScope[],
  readProfile: (filePath: string) => Record<string, unknown> | null | undefined,
): HarmonySemanticGraph {
  if (modules.some(module => module.scope.status !== "ready" || !module.scope.targetName)) {
    return Object.freeze({
      status: "unavailable",
      complete: false,
      units: Object.freeze([]),
      reason: "semantic-unit-unavailable",
    })
  }
  let complete = true
  const identities = new Map<string, HarmonySemanticUnitIdentity>()
  const manifests = new Map<SemanticModuleScope, Record<string, unknown> | null | undefined>()
  for (const module of modules) {
    const identity = Object.freeze({
      workspace,
      product,
      module: module.name,
      target: module.scope.targetName!,
    })
    identities.set(module.name, identity)
    const manifest = readProfile(path.join(module.rootPath, "oh-package.json5"))
    manifests.set(module, manifest)
    if (!manifest) {
      complete = false
      continue
    }
    if (manifest.dynamicDependencies !== undefined && (
      !plainRecord(manifest.dynamicDependencies)
      || Reflect.ownKeys(manifest.dynamicDependencies).length > 0
    )) complete = false
  }
  const dependencies = new Map<string, Set<string>>()
  const reverseDependencies = new Map<string, Set<string>>()
  const packageRoots = new Map<string, Set<string>>()
  for (const module of modules) {
    dependencies.set(module.name, new Set())
    reverseDependencies.set(module.name, new Set())
    packageRoots.set(module.name, new Set())
  }
  for (const module of modules) {
    const manifest = manifests.get(module)
    if (!manifest) continue
    const pending = [{ rootPath: module.rootPath, manifest }]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const current = pending.pop()!
      const physicalRoot = physicalPath(current.rootPath)
      if (!physicalRoot) { complete = false; continue }
      if (visited.has(physicalRoot)) continue
      if (visited.size >= MAX_MODULES) { complete = false; break }
      visited.add(physicalRoot)
      if (current.manifest.dynamicDependencies !== undefined && (
        !plainRecord(current.manifest.dynamicDependencies)
        || Reflect.ownKeys(current.manifest.dynamicDependencies).length > 0
      )) complete = false
      const declared = current.manifest.dependencies
      if (declared === undefined) continue
      if (!plainRecord(declared) || Reflect.ownKeys(declared).length > MAX_MODULES) {
        complete = false
        continue
      }
      for (const dependencyName of Reflect.ownKeys(declared)) {
        if (typeof dependencyName !== "string") {
          complete = false
          continue
        }
        const version = declared[dependencyName]
        if (typeof version !== "string" || !version) {
          complete = false
          continue
        }
        const relative = version.startsWith("file:")
          ? version.slice(5)
          : version.startsWith("./") || version.startsWith("../") ? version : undefined
        let target: SemanticModuleScope | undefined
        if (relative !== undefined) {
          if (!relative || path.isAbsolute(relative)) {
            complete = false
            continue
          }
          const dependencyPath = path.resolve(current.rootPath, relative)
          const dependencyRoot = physicalPath(dependencyPath)
          if (dependencyRoot && inside(module.physicalRoot, dependencyRoot)) continue
          target = dependencyRoot
            ? modules.find(candidate => candidate.physicalRoot === dependencyRoot)
            : undefined
          if (!target) {
            const physicalWorkspace = physicalPath(workspace)
            const local = dependencyRoot && physicalWorkspace
              && inside(workspace, dependencyPath) && inside(physicalWorkspace, dependencyRoot)
              ? readProfile(path.join(dependencyPath, "oh-package.json5")) : undefined
            if (!local || local.name !== dependencyName || typeof local.main !== "string"
              || path.isAbsolute(local.main) || !/\.(?:ets|ts)$/.test(local.main)) {
              complete = false
              continue
            }
            const entry = path.resolve(dependencyPath, local.main)
            const physicalEntry = physicalPath(entry)
            try {
              const stat = physicalEntry ? fs.statSync(physicalEntry) : undefined
              if (!inside(dependencyPath, entry) || !physicalEntry
                || !inside(dependencyRoot!, physicalEntry) || !stat?.isFile()
                || stat.size > 4 * 1024 * 1024) { complete = false; continue }
            } catch { complete = false; continue }
            packageRoots.get(module.name)!.add(dependencyPath)
            pending.push({ rootPath: dependencyPath, manifest: local })
            continue
          }
        }
        // Versioned packages resolve through oh_modules and are not project-module edges.
        if (!target || target.name === module.name) continue
        dependencies.get(module.name)!.add(target.name)
        reverseDependencies.get(target.name)!.add(module.name)
      }
    }
  }
  const units = modules.map((module): HarmonySemanticUnit => Object.freeze({
    identity: identities.get(module.name)!,
    moduleRoot: module.rootPath,
    sourceRoots: module.scope.sourceRoots,
    ...(packageRoots.get(module.name)!.size > 0 ? {
      packageRoots: Object.freeze([...packageRoots.get(module.name)!].sort(ordinalCompare)),
    } : {}),
    dependencies: Object.freeze([...dependencies.get(module.name)!]
      .sort(ordinalCompare)
      .map(name => identities.get(name)!)),
    reverseDependencies: Object.freeze([...reverseDependencies.get(module.name)!]
      .sort(ordinalCompare)
      .map(name => identities.get(name)!)),
  })).sort((left, right) => ordinalCompare(left.identity.module, right.identity.module))
  return Object.freeze({
    status: "ready",
    complete,
    units: Object.freeze(units),
  })
}

function physicalPath(filePath: string): string | undefined {
  try { return fs.realpathSync.native(filePath) } catch { return undefined }
}
function inside(rootPath: string, candidate: string): boolean {
  const relative = path.relative(rootPath, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".."
    && !relative.startsWith(`..${path.sep}`))
}
function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
