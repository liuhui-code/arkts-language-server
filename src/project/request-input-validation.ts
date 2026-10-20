interface ValidatedInput {
  readonly epoch: number
  readonly revision: number
  /** Captures the original epoch and scans all currently loaded facts, including additions. */
  readonly validate: () => boolean
}

let active: Map<object, ValidatedInput> | undefined
const MAX_PHASE_FILE_IDENTITIES = 8192
interface FileIdentity { readonly physicalPath: string; readonly stamp: string }
let fileIdentities: Map<string, FileIdentity> | undefined

/** Physical metadata only; query and final publication always start separate fresh scans. */
export function requestFileIdentity(filePath: string,
  read: () => FileIdentity | undefined): FileIdentity | undefined {
  const known = fileIdentities?.get(filePath)
  if (known) return known
  const current = read()
  if (current && fileIdentities && fileIdentities.size < MAX_PHASE_FILE_IDENTITIES) {
    fileIdentities.set(filePath, current)
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
  const identities = new Map<string, FileIdentity>()
  active = inputs
  fileIdentities = identities
  try {
    const result = run()
    active = undefined
    identities.clear()
    for (const input of inputs.values()) if (!input.validate()) unavailable()
    return result
  } finally {
    active = undefined
    fileIdentities = undefined
    identities.clear()
    inputs.clear()
  }
}
