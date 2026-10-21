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
interface FileIdentityPhase { readonly values: Map<string, FileIdentity>; bytes: number }
let fileIdentities: FileIdentityPhase | undefined

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

/** Share only successful checks inside one synchronous compiler query, never across requests. */
export function validateRequestInput(owner: object, epoch: number, revision: number,
  validate: () => boolean): boolean {
  if (!active) return validate()
  const known = active.get(owner)
  if (known && known.epoch !== epoch) return false
  if (known?.revision === revision) return true
  if (!validate()) return false
  active.set(owner, { epoch, revision, validate: known?.validate ?? validate })
  return true
}

/** The final union starts with fresh identities before the caller can publish a result. */
export function withRequestInputValidation<Result>(run: () => Result, unavailable: () => never): Result {
  if (active) return run()
  const inputs = new Map<object, ValidatedInput>()
  const identities: FileIdentityPhase = { values: new Map(), bytes: 0 }
  active = inputs
  fileIdentities = identities
  try {
    const result = run()
    active = undefined
    identities.values.clear()
    identities.bytes = 0
    for (const input of inputs.values()) if (!input.validate()) unavailable()
    return result
  } finally {
    active = undefined
    fileIdentities = undefined
    identities.values.clear()
    identities.bytes = 0
    inputs.clear()
  }
}
