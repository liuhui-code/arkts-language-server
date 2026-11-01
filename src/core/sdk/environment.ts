import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { harmonyCompilerResources } from "./compiler-resources.js"
import { readSdkConfiguration } from "./configuration-reader.js"

export interface SdkComponent {
  readonly root: string
  readonly physicalRoot: string
  readonly apiPaths: readonly string[]
  readonly prefix: string
  readonly metadataPath: string
  readonly versionMapPath?: string
  readonly configurationSha256?: string
  readonly metadataSha256?: string
  readonly metadata?: unknown
  readonly issue?: "invalid-component"
}

export interface SdkEnvironment {
  readonly components: readonly SdkComponent[]
  sourceRoot(file: string): string | undefined
}

export interface SdkProvider {
  open(root: string, inputs?: LoadedConfigurationWitness, constraints?: { readonly baseApiVersion?: string }): SdkEnvironment
}

function within(root: string, file: string): boolean {
  const relative = path.relative(root, path.resolve(file))
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
}

/** Configuration is load-owned. No AST, watcher, worker or Registry is owned here. */
export const harmonySdkProvider: SdkProvider = {
  open(root, inputs, constraints) {
    const physical = (file: string) => inputs
      ? inputs.observe(file, () => fs.realpathSync.native(file)) : fs.realpathSync.native(file)
    const components: SdkComponent[] = [{ root, physicalRoot: physical(root), prefix: "@ohos",
      apiPaths: harmonyCompilerResources(root).declarationDirectories,
      metadataPath: harmonyCompilerResources(root).apiMetadata }]
    // Only the documented sibling of a selected OpenHarmony distribution is admitted.
    if (path.basename(root).toLowerCase() === "openharmony") {
      const extension = path.join(path.dirname(root), "hms")
      const configPath = path.join(extension, "ets", "sdkConfig.json")
      let configLoaded = false
      let issuePath = configPath
      let componentPrefix = "@hms"
      try {
        const configSource = readSdkConfiguration(configPath, inputs)
        configLoaded = true
        const config = JSON.parse(configSource) as { apiPath?: unknown; prefix?: unknown }
        const physicalRoot = physical(extension)
        const apiPaths = typeof config.apiPath === "string" ? [config.apiPath] : config.apiPath
        if (!Array.isArray(apiPaths) || apiPaths.length === 0 || apiPaths.length > 32
          || typeof config.prefix !== "string" || !/^@[\w]+$/.test(config.prefix)) throw new Error("Invalid SDK component")
        componentPrefix = config.prefix
        const roots = apiPaths.map(value => {
          if (typeof value !== "string") throw new Error("Invalid SDK API path")
          const candidate = path.resolve(extension, "ets", value)
          if (!within(extension, candidate) || !within(physicalRoot, physical(candidate))) throw new Error("SDK API path escapes component")
          return candidate
        })
        const metadataPath = path.join(extension, "ets", "uni-package.json")
        issuePath = metadataPath
        const metadataSource = readSdkConfiguration(metadataPath, inputs)
        const metadata: unknown = JSON.parse(metadataSource)
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)
          || (metadata as Record<string, unknown>).path !== "ets"
          || typeof (metadata as Record<string, unknown>).apiVersion !== "string"
          || !/^[1-9]\d*$/.test(String((metadata as Record<string, unknown>).apiVersion))
          || typeof (metadata as Record<string, unknown>).version !== "string"
          || !(metadata as { version: string }).version.trim()
          || constraints?.baseApiVersion !== undefined && (metadata as Record<string, unknown>).apiVersion !== constraints.baseApiVersion) {
          throw new Error("Invalid or incompatible SDK metadata")
        }
        const identity = Object.freeze(Object.fromEntries(["path", "apiVersion", "version", "platformVersion", "releaseType"]
          .flatMap(key => typeof (metadata as Record<string, unknown>)[key] === "string"
            ? [[key, (metadata as Record<string, unknown>)[key]]] : [])))
        components.push({ root: extension, physicalRoot, apiPaths: roots, prefix: config.prefix, metadataPath, metadata: identity,
          metadataSha256: createHash("sha256").update(metadataSource).digest("hex"),
          versionMapPath: path.join(extension, "ets", "build-tools", "ts-checker-hooks", "sdkApiVersionMap.json"),
          configurationSha256: createHash("sha256").update(configSource).digest("hex") })
      } catch (error) {
        if (configLoaded || (error as NodeJS.ErrnoException).code !== "ENOENT") components.push({ root: extension,
          physicalRoot: extension, apiPaths: [], prefix: componentPrefix, metadataPath: issuePath, issue: "invalid-component" })
      }
    }
    const snapshot = Object.freeze(components.map(component => Object.freeze({ ...component,
      apiPaths: Object.freeze([...component.apiPaths]) })))
    return Object.freeze({ components: snapshot, sourceRoot(file: string) {
      const component = snapshot.find(component => within(component.root, file))
      if (!component || component.issue) return undefined
      try { return within(component.physicalRoot, physical(file)) ? component.root : undefined }
      catch { return undefined }
    } })
  },
}

/** Classification only; actual reads retain their own load and physical-boundary guards. */
export function sdkContains(sdk: { path: string | null; components?: readonly SdkComponent[] }, file: string): boolean {
  return sdk.components ? sdk.components.some(component => !component.issue && within(component.root, file))
    : !!sdk.path && within(sdk.path, file)
}
