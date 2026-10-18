import path from "node:path"
import { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"
import { witnessedFileExists } from "./typescript-resolution-witness.js"
import { isRegularBoundedFile } from "./typescript-safe-source-read.js"

let enabled = false
export function enableVerifierSdkLookups(): void { enabled = true }

interface SdkLookups {
  readonly root: string
  readonly witness: LoadedConfigurationWitness
  readonly entries: Map<string, boolean>
}
let current: SdkLookups | undefined
const leases = new WeakMap<LoadedConfigurationWitness, SdkLookups>()
const checkpoint = (): void => {}
const valid = (cache: SdkLookups): boolean => cache.witness.freshness(checkpoint, "capture")?.() === true

/** Only the serial verifier uses this cache; project and overlay lookups stay job-owned. */
export function verifierSdkFileExists(filePath: string, sdkRoot: string | null,
  witness: LoadedConfigurationWitness | undefined): boolean {
  const file = path.resolve(filePath)
  const root = sdkRoot && path.resolve(sdkRoot)
  const relative = root && path.relative(root, file)
  if (!enabled || !root || !relative || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || !witness) return witnessedFileExists(file, witness)
  let cache = leases.get(witness)
  if (!cache) {
    if (!current || current.root !== root || !valid(current)) {
      current = { root, witness: new LoadedConfigurationWitness(), entries: new Map() }
    }
    cache = current
    leases.set(witness, cache)
  }
  if (cache.entries.has(file)) return cache.entries.get(file)!
  // Capture original before/after load identities. A cache hit never restamps them.
  const present = cache.witness.observe(file, () => isRegularBoundedFile(file))
  cache.entries.set(file, present)
  return present
}

/** Check the same retained facts again after the job, including negative namespace facts. */
export function assertVerifierSdkLookupsCurrent(witness: LoadedConfigurationWitness | undefined): void {
  const lease = witness && leases.get(witness)
  if (lease && !valid(lease)) throw new SemanticInputUnavailableError()
}
