import path from "node:path"
import ts from "typescript"
import { SemanticInputUnavailableError } from "../../../core/types/typescript-query-inputs.js"
import { initialPreparationActive } from "../../coordinator/initial-preparation.js"
import { prepareSdkDeclarations } from "./sdk-preparation.js"

type Acquisition = Parameters<ts.DocumentRegistry["acquireDocumentWithKey"]>
interface Pin {
  readonly resolvedPath: ts.Path
  readonly key: ts.DocumentRegistryBucketKey
  readonly kind: ts.ScriptKind
  readonly file: ts.SourceFile
}
const initializers = new WeakMap<ts.DocumentRegistry, () => void>()
export function prepareRetainedSdkDocuments(registry: ts.DocumentRegistry): void { initializers.get(registry)?.() }

export function isCompilerLibrary(file: string): boolean {
  return path.dirname(path.resolve(file)) === path.dirname(ts.getDefaultLibFilePath({}))
    && /^lib(?:\..+)?\.d\.ts$/u.test(path.basename(file))
}

/** Used only by the serial verifier isolate. All project leases belong to its current LS. */
export function retainSdkDocuments(registry: ts.DocumentRegistry, sdkPath: string): ts.DocumentRegistry {
  const root = path.resolve(sdkPath)
  const pins = new Map<string, Pin>()
  const retained = { ...registry }
  const acquire = registry.acquireDocumentWithKey.bind(registry)
  const update = registry.updateDocumentWithKey.bind(registry)
  let settingsKey: ts.DocumentRegistryBucketKey | undefined
  let warmedSettingsKey: ts.DocumentRegistryBucketKey | undefined
  let warming = false
  let latestAcquisition: Acquisition | undefined
  const initialize = () => {
    const args = latestAcquisition
    if (!args || warming || !initialPreparationActive() || warmedSettingsKey === args[3]) return
    warming = true
    try { prepareSdkDeclarations(root, args, retained); warmedSettingsKey = args[3] }
    finally { warming = false }
  }
  initializers.set(retained, initialize)
  const release = (pin: Pin) => registry.releaseDocumentWithKey(
    pin.resolvedPath, pin.key, pin.kind, pin.file.impliedNodeFormat,
  )
  const sdkKey = (args: Acquisition): string | undefined => {
    const relative = path.relative(root, path.resolve(args[0]))
    const sdk = relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    const library = isCompilerLibrary(args[0])
    if (!sdk && !library) return
    return JSON.stringify([args[1], args[3], args[6],
      typeof args[7] === "object" ? args[7].impliedNodeFormat : null])
  }
  retained.acquireDocumentWithKey = (...args) => {
    const id = sdkKey(args)
    if (!id) return acquire(...args)
    if (settingsKey !== undefined && settingsKey !== args[3]) {
      for (const pin of pins.values()) release(pin)
      pins.clear()
    }
    settingsKey = args[3]
    latestAcquisition = args
    initialize()
    const previous = pins.get(id)
    // SDK host versions are currently always "0". Compare actual freshly read bytes,
    // not timestamps or host versions; previous job's project LS has already disposed.
    if (previous && previous.file.text !== args[4].getText(0, args[4].getLength())) {
      release(previous)
      pins.delete(id)
    }
    const file = acquire(...args)
    if (!pins.has(id)) {
      acquire(...args) // A second balanced Registry lease keeps only this SDK SourceFile alive.
      pins.set(id, { resolvedPath: args[1], key: args[3], kind: args[6] ?? ts.ScriptKind.TS, file })
    }
    return file
  }
  retained.updateDocumentWithKey = (...args) => {
    const pin = pins.get(sdkKey(args) ?? "")
    if (pin && pin.file.text !== args[4].getText(0, args[4].getLength())) {
      // An SDK mutation during an active job cannot update a previously witnessed load.
      throw new SemanticInputUnavailableError()
    }
    return update(...args)
  }
  return retained
}
