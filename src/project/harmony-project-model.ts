import fs from "node:fs"
import path from "node:path"

import JSON5 from "json5"

const MAX_PROFILE_BYTES = 64 * 1024
const MAX_MODULES = 256

export interface HarmonyProjectScope {
  readonly status: "unconfigured" | "ready" | "unavailable"
  readonly moduleRoot?: string
  readonly sourceRoots: readonly string[]
  readonly resourceRoots: readonly string[]
  readonly targetName?: string
  readonly reason?: string
}

export interface HarmonySemanticUnitIdentity {
  readonly workspace: string
  readonly product: string
  readonly module: string
  readonly target: string
}

export interface HarmonySemanticUnit {
  readonly identity: HarmonySemanticUnitIdentity
  readonly moduleRoot: string
  readonly sourceRoots: readonly string[]
  readonly dependencies: readonly HarmonySemanticUnitIdentity[]
  readonly reverseDependencies: readonly HarmonySemanticUnitIdentity[]
}

export interface HarmonySemanticGraph {
  readonly status: "unconfigured" | "ready" | "unavailable"
  readonly complete: boolean
  readonly units: readonly HarmonySemanticUnit[]
  readonly reason?: string
}

const PHYSICAL_SOURCE_ROOTS = new WeakMap<HarmonyProjectScope, readonly string[]>()

interface ModuleScope {
  readonly name: string
  readonly rootPath: string
  readonly physicalRoot: string
  readonly scope: HarmonyProjectScope
}

interface ProjectSelection {
  readonly product: string
  readonly targets: ReadonlyMap<string, string>
}

type ProjectSnapshot =
  | { readonly status: "ready"; readonly physicalRoot: string; readonly modules: readonly ModuleScope[] }
  | { readonly status: "unconfigured" | "unavailable"; readonly scope: HarmonyProjectScope }

export class HarmonyProjectModel {
  private readonly rootPath: string
  private readonly selection: ProjectSelection | undefined
  private snapshot?: ProjectSnapshot
  private graph?: HarmonySemanticGraph

  constructor(rootPath: string, selection?: unknown) {
    this.rootPath = path.resolve(rootPath)
    this.selection = parseSelection(selection)
  }

  scopeFor(sourcePath: string): HarmonyProjectScope {
    const snapshot = this.snapshot ??= this.load()
    if (snapshot.status !== "ready") return snapshot.scope
    const physicalSource = physicalPath(sourcePath)
    if (!physicalSource || !inside(snapshot.physicalRoot, physicalSource)) {
      return unavailable("source-outside-project")
    }
    return snapshot.modules.find((module) => inside(module.physicalRoot, physicalSource))?.scope
      ?? unavailable("source-outside-declared-modules")
  }

  mayContainDeclaredModule(directoryPath: string): boolean {
    const snapshot = this.snapshot ??= this.load()
    if (snapshot.status === "unconfigured") return true
    if (snapshot.status !== "ready") return false
    const physicalDirectory = physicalPath(directoryPath)
    return physicalDirectory !== undefined
      && inside(snapshot.physicalRoot, physicalDirectory)
      && snapshot.modules.some((module) => inside(physicalDirectory, module.physicalRoot))
  }

  physicalSourceRootsFor(scope: HarmonyProjectScope): readonly string[] {
    return PHYSICAL_SOURCE_ROOTS.get(scope) ?? []
  }

  semanticGraph(): HarmonySemanticGraph {
    if (this.graph) return this.graph
    const snapshot = this.snapshot ??= this.load()
    if (snapshot.status !== "ready") {
      return this.graph = Object.freeze({
        status: snapshot.status,
        complete: false,
        units: Object.freeze([]),
        ...(snapshot.scope.reason ? { reason: snapshot.scope.reason } : {}),
      })
    }
    return this.graph = buildSemanticGraph(
      this.rootPath,
      this.selection!.product,
      snapshot.modules,
    )
  }

  invalidate(): void {
    this.snapshot = undefined
    this.graph = undefined
  }

  private load(): ProjectSnapshot {
    const invalid = (reason: string): ProjectSnapshot => Object.freeze({
      status: "unavailable", scope: unavailable(reason),
    })
    const selection = this.selection
    if (!selection) return invalid("invalid-project-selection")
    const profile = readProfile(path.join(this.rootPath, "build-profile.json5"))
    if (profile === undefined) {
      if (selection.product !== "default" || selection.targets.size > 0) {
        return invalid("selected-project-profile-unavailable")
      }
      return Object.freeze({
        status: "unconfigured",
        scope: projectScope({
          status: "unconfigured",
          sourceRoots: Object.freeze([this.rootPath]),
          resourceRoots: Object.freeze([this.rootPath]),
        }, [physicalPath(this.rootPath) ?? this.rootPath]),
      })
    }
    if (!profile) return invalid("invalid-project-profile")
    const app = object(profile.app)
    const products = app?.products
    if (!Array.isArray(products) || products.length > MAX_MODULES
      || products.filter((product) => object(product)?.name === "default").length !== 1) {
      return invalid("default-product-unavailable")
    }
    if (products.filter((product) => object(product)?.name === selection.product).length !== 1) {
      return invalid("selected-product-unavailable")
    }
    if (!Array.isArray(profile.modules) || profile.modules.length > MAX_MODULES) {
      return invalid("invalid-module-list")
    }
    const physicalRoot = physicalPath(this.rootPath)
    if (!physicalRoot) return invalid("project-root-unavailable")
    const names = new Set<string>()
    const roots = new Set<string>()
    const modules: ModuleScope[] = []
    for (const value of profile.modules) {
      const module = object(value)
      if (!module || typeof module.name !== "string" || !module.name || names.has(module.name)
        || typeof module.srcPath !== "string" || !module.srcPath || path.isAbsolute(module.srcPath)) {
        return invalid("invalid-module-declaration")
      }
      const moduleRoot = path.resolve(this.rootPath, module.srcPath)
      const physicalModule = physicalPath(moduleRoot)
      if (!inside(this.rootPath, moduleRoot) || !physicalModule || !inside(physicalRoot, physicalModule)
        || roots.has(physicalModule)) return invalid("invalid-module-root")
      names.add(module.name)
      roots.add(physicalModule)
      const scope = moduleScope(module, moduleRoot, physicalModule, selection)
      modules.push(Object.freeze({
        name: module.name,
        rootPath: moduleRoot,
        physicalRoot: physicalModule,
        scope: scope.status === "unavailable" ? Object.freeze({ ...scope, moduleRoot }) : scope,
      }))
    }
    if ([...selection.targets.keys()].some((name) => !names.has(name))) {
      return invalid("selected-module-unavailable")
    }
    modules.sort((left, right) => right.physicalRoot.length - left.physicalRoot.length)
    return Object.freeze({ status: "ready", physicalRoot, modules: Object.freeze(modules) })
  }
}

function buildSemanticGraph(
  workspace: string,
  product: string,
  modules: readonly ModuleScope[],
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
  const manifests = new Map<ModuleScope, Record<string, unknown> | null | undefined>()
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
  for (const module of modules) {
    dependencies.set(module.name, new Set())
    reverseDependencies.set(module.name, new Set())
  }
  for (const module of modules) {
    const manifest = manifests.get(module)
    if (!manifest) continue
    const declared = manifest.dependencies
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
      let target: ModuleScope | undefined
      if (relative !== undefined) {
        if (!relative || path.isAbsolute(relative)) {
          complete = false
          continue
        }
        const dependencyRoot = physicalPath(path.resolve(module.rootPath, relative))
        if (dependencyRoot && inside(module.physicalRoot, dependencyRoot)) continue
        target = dependencyRoot
          ? modules.find(candidate => candidate.physicalRoot === dependencyRoot)
          : undefined
        if (!target) {
          complete = false
          continue
        }
      }
      // Versioned packages resolve through oh_modules and are not project-module edges.
      if (!target || target.name === module.name) continue
      dependencies.get(module.name)!.add(target.name)
      reverseDependencies.get(target.name)!.add(module.name)
    }
  }
  const units = modules.map((module): HarmonySemanticUnit => Object.freeze({
    identity: identities.get(module.name)!,
    moduleRoot: module.rootPath,
    sourceRoots: module.scope.sourceRoots,
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

function moduleScope(
  module: Record<string, unknown>,
  moduleRoot: string,
  physicalModule: string,
  selection: ProjectSelection,
): HarmonyProjectScope {
  if (!Array.isArray(module.targets) || module.targets.length > MAX_MODULES) {
    return unavailable("module-target-unavailable")
  }
  const appliedTargets = module.targets.filter((value) => {
    const target = object(value)
    if (!target) return false
    if (!Object.hasOwn(target, "applyToProducts")) {
      return target.name !== "ohosTest" && selection.product === "default"
    }
    return Array.isArray(target.applyToProducts) && target.applyToProducts.includes(selection.product)
  })
  const selectedTarget = selection.targets.get(module.name as string)
  const selectedTargets = selectedTarget === undefined ? appliedTargets
    : appliedTargets.filter((value) => object(value)?.name === selectedTarget)
  if (selectedTargets.length !== 1) return unavailable("ambiguous-product-target")
  const targetName = object(selectedTargets[0])?.name
  if (typeof targetName !== "string" || !targetName) return unavailable("invalid-target-name")
  const profile = readProfile(path.join(moduleRoot, "build-profile.json5"))
  if (!profile || !Array.isArray(profile.targets) || profile.targets.length > MAX_MODULES) {
    return unavailable("module-profile-unavailable")
  }
  const targets = profile.targets.filter((value) => object(value)?.name === targetName)
  if (targets.length !== 1) return unavailable("module-target-unavailable")
  const target = object(targets[0])!
  const mainSourceRoot = path.join(moduleRoot, "src", "main")
  const sourceRoots: string[] = []
  const physicalSourceRoots: string[] = []
  if (target.source !== undefined) {
    const source = object(target.source)
    if (!source) return unavailable("invalid-target-source")
    if (source.sourceRoots !== undefined) {
      if (!Array.isArray(source.sourceRoots) || source.sourceRoots.length > MAX_MODULES) {
        return unavailable("invalid-source-roots")
      }
      const sourceParent = path.join(moduleRoot, "src")
      const physicalSourceParent = physicalPath(sourceParent)
      for (const directory of source.sourceRoots) {
        if (typeof directory !== "string" || !directory || path.isAbsolute(directory)) {
          return unavailable("invalid-source-root")
        }
        const root = path.resolve(moduleRoot, directory)
        const physical = physicalPath(root)
        if (path.dirname(root) !== sourceParent || !physical || !physicalSourceParent
          || path.dirname(physical) !== physicalSourceParent || !inside(physicalModule, physical)) {
          return unavailable("source-root-not-main-sibling")
        }
        try {
          if (!fs.statSync(root).isDirectory()) return unavailable("source-root-unavailable")
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            return unavailable("source-root-unavailable")
          }
          try {
            // A dangling link is not a prospective source root and must fail closed.
            fs.lstatSync(root)
            return unavailable("source-root-unavailable")
          } catch (linkError) {
            if ((linkError as NodeJS.ErrnoException).code !== "ENOENT") {
              return unavailable("source-root-unavailable")
            }
          }
        }
        if (root !== mainSourceRoot && !sourceRoots.includes(root)) {
          sourceRoots.push(root)
          physicalSourceRoots.push(physical)
        }
      }
    }
  }
  sourceRoots.push(mainSourceRoot)
  physicalSourceRoots.push(physicalPath(mainSourceRoot) ?? path.resolve(mainSourceRoot))
  let resourceRoots = [path.join(moduleRoot, "src", "main", "resources")]
  if (target.resource !== undefined) {
    const resource = object(target.resource)
    if (!resource) return unavailable("invalid-target-resources")
    if (resource.directories !== undefined) {
      if (!Array.isArray(resource.directories)
        || resource.directories.length > MAX_MODULES) return unavailable("invalid-resource-directories")
      if (resource.directories.length > 0) resourceRoots = []
      for (const directory of resource.directories) {
        if (typeof directory !== "string" || !directory || path.isAbsolute(directory)) {
          return unavailable("invalid-resource-directory")
        }
        const root = path.resolve(moduleRoot, directory)
        const physical = physicalPath(root)
        if (!inside(moduleRoot, root) || !physical || !inside(physicalModule, physical)) {
          return unavailable("resource-directory-outside-module")
        }
        try {
          if (!fs.statSync(root).isDirectory()) return unavailable("resource-directory-unavailable")
        } catch { return unavailable("resource-directory-unavailable") }
        if (!resourceRoots.includes(root)) resourceRoots.push(root)
      }
    }
  }
  return projectScope({
    status: "ready", moduleRoot, targetName,
    sourceRoots: Object.freeze(sourceRoots),
    resourceRoots: Object.freeze(resourceRoots),
  }, physicalSourceRoots)
}

function parseSelection(value: unknown): ProjectSelection | undefined {
  if (value === undefined) return { product: "default", targets: new Map() }
  if (!plainRecord(value) || Reflect.ownKeys(value).some((key) => key !== "product" && key !== "targets")) {
    return undefined
  }
  const product = Object.hasOwn(value, "product") ? value.product : "default"
  if (typeof product !== "string" || !product.trim()) return undefined
  const targets = new Map<string, string>()
  if (Object.hasOwn(value, "targets")) {
    if (!plainRecord(value.targets)) return undefined
    const keys = Reflect.ownKeys(value.targets)
    if (keys.length > MAX_MODULES) return undefined
    for (const key of keys) {
      if (typeof key !== "string" || !key.trim()) return undefined
      const target = value.targets[key]
      if (typeof target !== "string" || !target.trim()) return undefined
      targets.set(key, target)
    }
  }
  return { product, targets }
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!object(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function unavailable(reason: string): HarmonyProjectScope {
  return projectScope({
    status: "unavailable", reason,
    sourceRoots: Object.freeze([]), resourceRoots: Object.freeze([]),
  }, [])
}

function projectScope(
  scope: HarmonyProjectScope,
  physicalSourceRoots: readonly string[],
): HarmonyProjectScope {
  const frozen = Object.freeze(scope)
  PHYSICAL_SOURCE_ROOTS.set(frozen, Object.freeze([...physicalSourceRoots]))
  return frozen
}

function readProfile(filePath: string): Record<string, unknown> | null | undefined {
  let descriptor: number | undefined
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.size > MAX_PROFILE_BYTES) return null
    const buffer = Buffer.alloc(MAX_PROFILE_BYTES + 1)
    let length = 0
    while (length <= MAX_PROFILE_BYTES) {
      const read = fs.readSync(descriptor, buffer, length, buffer.length - length, null)
      if (read === 0) break
      length += read
    }
    if (length > MAX_PROFILE_BYTES) return null
    return object(JSON5.parse(buffer.toString("utf8", 0, length))) ?? null
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? undefined : null
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function physicalPath(filePath: string): string | undefined {
  const resolved = path.resolve(filePath)
  try { return fs.realpathSync.native(resolved) }
  catch {
    try {
      // A new, unsaved source may not exist yet; its existing parent owns it.
      return path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved))
    } catch { return undefined }
  }
}

function inside(rootPath: string, candidate: string): boolean {
  const relative = path.relative(rootPath, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".."
    && !relative.startsWith(`..${path.sep}`))
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
