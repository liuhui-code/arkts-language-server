interface ValidatedInput {
  readonly epoch: number
  readonly revision: number
  /** Captures the original epoch and scans all currently loaded facts, including additions. */
  readonly validate: () => boolean
}

let active: Map<object, ValidatedInput> | undefined
// Bound request-local metadata by its retained strings, rather than starving all
// paths after an arbitrary file count. This accounting budget is not an RSS cap.
const MAX_PHASE_FILE_IDENTITY_BYTES = 32 * 1024 * 1024
interface FileIdentity { readonly physicalPath: string; readonly stamp: string }
export interface ConfigurationInputIdentity {
  readonly identity: string
  readonly loadGuard: string
  readonly witnessPath: string
  readonly regularSource: boolean
  readonly absenceOwner?: readonly [string, string]
}
interface FileIdentityPhase {
  readonly values: Map<string, FileIdentity>
  readonly configurations: Map<string, ConfigurationInputIdentity>
  bytes: number
}
let fileIdentities: FileIdentityPhase | undefined
interface PreparationValidation {
  readonly inputs: Map<object, ValidatedInput>
  readonly identities: FileIdentityPhase
}
let preparation: PreparationValidation | undefined

/** Synchronous preparation hands its original proofs to the query's existing leased final fence. */
export function withSynchronousInputPreparation<Result>(run: () => Result): Result {
  if (active || preparation) return run()
  const previousIdentities = fileIdentities
  const scope = { inputs: new Map<object, ValidatedInput>(), identities: newIdentityPhase() }
  preparation = scope
  fileIdentities = scope.identities
  try { return run() }
  finally {
    preparation = undefined
    fileIdentities = previousIdentities
    scope.inputs.clear()
    clearIdentityPhase(scope.identities)
  }
}

/** Physical metadata only; query and final publication always start separate fresh scans. */
export function requestFileIdentity(filePath: string,
  read: () => FileIdentity | undefined): FileIdentity | undefined {
  const known = fileIdentities?.values.get(filePath)
  if (known) return known
  const current = read()
  // UTF-16 string storage plus an allowance for the entry, identity and Map
  // bookkeeping. Overflow keeps the ordinary uncached read, never a stale fact.
  if (current && fileIdentities) {
    const bytes = 128 + 2 * (filePath.length + current.physicalPath.length + current.stamp.length)
    if (fileIdentities.bytes + bytes <= MAX_PHASE_FILE_IDENTITY_BYTES) {
      fileIdentities.values.set(filePath, current)
      fileIdentities.bytes += bytes
    }
  }
  return current
}

/** Share validation observations, never the uncached guards surrounding an actual load. */
export function requestConfigurationIdentity(filePath: string, directoryOnly: boolean,
  read: () => ConfigurationInputIdentity | undefined): ConfigurationInputIdentity | undefined {
  const key = `${directoryOnly ? 1 : 0}\0${filePath}`
  const known = fileIdentities?.configurations.get(key)
  if (known) return known
  const current = read()
  if (current && fileIdentities) {
    const strings = key.length + current.identity.length + current.loadGuard.length + current.witnessPath.length
      + (current.absenceOwner?.[0].length ?? 0) + (current.absenceOwner?.[1].length ?? 0)
    const bytes = 256 + 2 * strings
    if (fileIdentities.bytes + bytes <= MAX_PHASE_FILE_IDENTITY_BYTES) {
      fileIdentities.configurations.set(key, current)
      fileIdentities.bytes += bytes
    }
  }
  return current
}

/** Share only successful checks inside one synchronous compiler query, never across requests. */
export function validateRequestInput(owner: object, epoch: number, revision: number,
  validate: () => boolean): boolean {
  const inputs = active ?? preparation?.inputs
  if (!inputs) return validate()
  const known = inputs.get(owner)
  if (known && known.epoch !== epoch) return false
  if (known?.revision === revision) return true
  if (!validate()) return false
  inputs.set(owner, { epoch, revision, validate: known?.validate ?? validate })
  return true
}

/** The final union starts with fresh identities before the caller can publish a result. */
export function withRequestInputValidation<Result>(run: () => Result, unavailable: () => never): Result {
  if (active) return run()
  const prepared = preparation
  const inputs = prepared?.inputs ?? new Map<object, ValidatedInput>()
  const identities = prepared?.identities ?? newIdentityPhase()
  active = inputs
  fileIdentities = identities
  try {
    const result = run()
    active = undefined
    preparation = undefined
    clearIdentityPhase(identities)
    for (const input of inputs.values()) if (!input.validate()) unavailable()
    return result
  } finally {
    active = undefined
    preparation = prepared
    fileIdentities = prepared?.identities
    clearIdentityPhase(identities)
    inputs.clear()
  }
}

function newIdentityPhase(): FileIdentityPhase {
  return { values: new Map(), configurations: new Map(), bytes: 0 }
}

function clearIdentityPhase(phase: FileIdentityPhase): void {
  phase.values.clear()
  phase.configurations.clear()
  phase.bytes = 0
}
