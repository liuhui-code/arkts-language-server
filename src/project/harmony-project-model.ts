import fs from "node:fs"
import path from "node:path"

import { buildSemanticGraph } from "./harmony-semantic-graph.js"
import { readHarmonyProfile } from "./harmony-profile-reader.js"
import { LoadedConfigurationWitness } from "./loaded-configuration-witness.js"

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
  readonly packageRoots?: readonly string[]
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
  private configurationWitness?: LoadedConfigurationWitness

  constructor(rootPath: string, selection?: unknown) {
    this.rootPath = path.resolve(rootPath)
    this.selection = parseSelection(selection)
  }

  enableConfigurationWitness(): void {
    if (this.configurationWitness) return
    this.configurationWitness = new LoadedConfigurationWitness()
    if (this.snapshot || this.graph) this.configurationWitness.markUnprovable()
  }

  configurationFreshness(checkpoint: () => void): (() => boolean) | undefined {
    return this.configurationWitness?.freshness(checkpoint)
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
      filePath => readHarmonyProfile(filePath, this.configurationWitness),
    )
  }

  invalidate(): void {
    this.snapshot = undefined
    this.graph = undefined
    this.configurationWitness?.reset()
  }

  private load(): ProjectSnapshot {
    const invalid = (reason: string): ProjectSnapshot => Object.freeze({
      status: "unavailable", scope: unavailable(reason),
    })
    const selection = this.selection
    if (!selection) return invalid("invalid-project-selection")
    const profile = readHarmonyProfile(path.join(this.rootPath, "build-profile.json5"), this.configurationWitness)
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
        }, [physicalPath(this.rootPath, this.configurationWitness) ?? this.rootPath]),
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
    const physicalRoot = physicalPath(this.rootPath, this.configurationWitness)
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
      const physicalModule = physicalPath(moduleRoot, this.configurationWitness)
      if (!inside(this.rootPath, moduleRoot) || !physicalModule || !inside(physicalRoot, physicalModule)
        || roots.has(physicalModule)) return invalid("invalid-module-root")
      names.add(module.name)
      roots.add(physicalModule)
      const scope = moduleScope(module, moduleRoot, physicalModule, selection, this.configurationWitness)
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


function moduleScope(
  module: Record<string, unknown>,
  moduleRoot: string,
  physicalModule: string,
  selection: ProjectSelection,
  witness?: LoadedConfigurationWitness,
): HarmonyProjectScope {
  const profile = readHarmonyProfile(path.join(moduleRoot, "build-profile.json5"), witness)
  if (!profile || (profile.targets !== undefined && !Array.isArray(profile.targets))) {
    return unavailable("module-profile-unavailable")
  }
  const moduleProfileTargets = profile.targets === undefined
    ? [{ name: "default" }]
    : profile.targets
  if (moduleProfileTargets.length > MAX_MODULES) return unavailable("module-profile-unavailable")
  if (module.targets !== undefined
    && (!Array.isArray(module.targets) || module.targets.length > MAX_MODULES)) {
    return unavailable("module-target-unavailable")
  }
  const implicitTargets = moduleProfileTargets.filter(value => object(value)?.name !== "ohosTest")
  const appliedTargets = module.targets === undefined
    ? implicitTargets.length === 1
      ? implicitTargets
      : []
    : module.targets.filter((value) => {
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
  const targets = moduleProfileTargets.filter((value) => object(value)?.name === targetName)
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
      const physicalSourceParent = physicalPath(sourceParent, witness)
      for (const directory of source.sourceRoots) {
        if (typeof directory !== "string" || !directory || path.isAbsolute(directory)) {
          return unavailable("invalid-source-root")
        }
        const root = path.resolve(moduleRoot, directory)
        const physical = physicalPath(root, witness)
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
  physicalSourceRoots.push(physicalPath(mainSourceRoot, witness) ?? path.resolve(mainSourceRoot))
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
        const physical = physicalPath(root, witness)
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

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function physicalPath(filePath: string, witness?: LoadedConfigurationWitness): string | undefined {
  if (witness) return witness.observe(filePath, () => physicalPath(filePath))
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
