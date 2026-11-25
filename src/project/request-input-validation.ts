import path from "node:path"

type InputValidationKind = "membership" | "membership-consumer"
interface InputVersion { readonly epoch: number; readonly revision: number }
interface ValidatedInput {
  readonly epoch: number
  readonly revision: number
  /** Captures the original epoch and scans all currently loaded facts, including additions. */
  readonly validate: () => boolean
  readonly kind?: InputValidationKind
  readonly requiredMemberships?: ReadonlyMap<object, InputVersion>
}

let active: Map<object, ValidatedInput> | undefined
let finalizing = false
let completedFinalMemberships: Map<object, InputVersion> | undefined
let membershipCapture: Map<object, InputVersion> | undefined
let finalMembershipConsumer: object | undefined
let finalMemberships: Map<object, InputVersion & { readonly consumers: Set<object> }> | undefined

function consumedMembership(owner: object, epoch: number, revision: number, kind?: InputValidationKind): void {
  if (kind !== "membership") return
  if (!finalizing) { membershipCapture?.set(owner, { epoch, revision }); return }
  completeFinalMembership(owner, epoch, revision)
  const obligation = finalMemberships?.get(owner)
  if (finalMembershipConsumer && obligation?.epoch === epoch && obligation.revision === revision) {
    obligation.consumers.delete(finalMembershipConsumer)
  }
}

function completeFinalMembership(owner: object, epoch: number, revision: number): void {
  const phase = fileIdentities, completed = completedFinalMemberships
  if (!phase || !completed) return
  const known = completed.has(owner)
  if (!known && !reservePhaseBytes(phase, 96)) return
  completed.set(owner, { epoch, revision })
  if (!known) phase.bytes += 96
}

/** Only a registered mandatory consumer may replace a duplicate top-level scan.
 * Exact original ownership/version must be consumed again before publication. */
function requiredFinalMemberships(inputs: ReadonlyMap<object, ValidatedInput>) {
  const obligations = new Map<object, InputVersion & { readonly consumers: Set<object> }>()
  for (const [consumer, input] of inputs) if (input.kind === "membership-consumer") {
    for (const [owner, expected] of input.requiredMemberships ?? []) {
      const producer = inputs.get(owner)
      if (producer?.kind !== "membership" || producer.epoch !== expected.epoch
        || producer.revision !== expected.revision) continue
      const obligation = obligations.get(owner) ?? { ...expected, consumers: new Set<object>() }
      obligation.consumers.add(consumer); obligations.set(owner, obligation)
    }
  }
  return obligations
}
// Bound request-local metadata by its retained strings, rather than starving all
// paths after an arbitrary file count. This accounting budget is not an RSS cap.
const MAX_PHASE_FILE_IDENTITY_BYTES = 32 * 1024 * 1024
interface FileIdentity { readonly physicalPath: string; readonly stamp: string }
interface PendingFileIdentity {
  readonly identity?: FileIdentity
  readonly regular?: { readonly parent: string; readonly token: string; readonly mode?: number }
  readonly owner: object
  readonly epoch: number
  readonly revision: number
  readonly bytes: number
}
export interface ConfigurationInputIdentity {
  readonly identity: string
  readonly loadGuard: string
  readonly witnessPath: string
  readonly regularSource: boolean
  readonly absenceOwner?: readonly [string, string]
}
export type ConfigurationValidationIdentity = Pick<ConfigurationInputIdentity, "identity" | "regularSource">
export interface ValidationDirectoryProof {
  readonly physicalPath: string
  readonly names: ReadonlySet<string>
  readonly bytes: number
  current(): boolean
}
interface FileIdentityPhase {
  readonly compositions: Map<object, { readonly epoch: number; readonly revision: number }>
  readonly configurationFacts: Map<object, { readonly epoch: number; readonly revision: number }>
  readonly sourceDirectories: Map<object, (directory: string) => ValidationDirectoryProof | undefined>
  readonly pending: Map<string, PendingFileIdentity>
  readonly directories: Map<string, ValidationDirectoryProof>
  directoriesExhausted: boolean
  readonly values: Map<string, FileIdentity>
  readonly configurations: Map<string, [ConfigurationValidationIdentity | undefined, ConfigurationValidationIdentity | undefined]>
  bytes: number
}
let fileIdentities: FileIdentityPhase | undefined
interface PreparationValidation {
  readonly inputs: Map<object, ValidatedInput>
  readonly identities: FileIdentityPhase
}
let preparation: PreparationValidation | undefined
let configurationFactCapture: { complete: boolean; observed: boolean } | undefined

/** Reuse only comparisons against immutable observations retained in THIS final
 * phase. Live owner/epoch/cancellation guards stay with the caller. Missing or
 * over-budget observations require the original full traversal on every call. */
export function compareRetainedConfigurationFacts(owner: object, epoch: number, revision: number,
  compare: () => boolean): boolean {
  const phase = fileIdentities
  const parent = configurationFactCapture
  if (parent) parent.complete = false // A nested witness is not a declared fact dependency.
  if (!phase || !finalizing) return compare()
  const known = phase.configurationFacts.get(owner)
  if (known?.epoch === epoch && known.revision === revision) return true
  const capture = { complete: true, observed: false }
  configurationFactCapture = capture
  try {
    const valid = compare()
    if (valid && capture.complete && capture.observed && phase === fileIdentities && finalizing
      && (known || reservePhaseBytes(phase, 128))) {
      phase.configurationFacts.set(owner, { epoch, revision })
      if (!known) phase.bytes += 128
    }
    return valid
  } finally { configurationFactCapture = parent }
}

/** Share only a composition of already registered child inputs. It adds no final
 * owner: those children and their enclosing scope still validate independently.
 * Callers version every topology/fact-set change; physical changes reach the final union. */
export function memoizeRequestInputComposition(owner: object, epoch: number, revision: number,
  validate: () => boolean): boolean {
  const phase = fileIdentities
  if (!phase || finalizing || !(active ?? preparation?.inputs)) return validate()
  const known = phase.compositions.get(owner)
  if (known?.epoch === epoch && known.revision === revision) return true
  if (!validate()) return false
  if (phase === fileIdentities && !finalizing && (known || reservePhaseBytes(phase, 128))) {
    phase.compositions.set(owner, { epoch, revision })
    if (!known) phase.bytes += 128
  }
  return true
}

/** Original namespace evidence only. Every query/final observation rechecks it;
 * registration follows successful native ownership and ends with this request. */
export function retainValidationSourceDirectories(owner: object,
  directory: (path: string) => ValidationDirectoryProof | undefined): void {
  const phase = fileIdentities
  if (!phase || finalizing || !(active ?? preparation?.inputs)?.has(owner)
    || phase.sourceDirectories.has(owner) || !reservePhaseBytes(phase, 256)) return
  phase.sourceDirectories.set(owner, directory)
  phase.bytes += 256
}

export function validationSourceDirectory(directory: string, name: string): ValidationDirectoryProof | undefined {
  for (const provider of fileIdentities?.sourceDirectories.values() ?? []) {
    const proof = provider(directory)
    if (proof?.names.has(name)) return proof
  }
  return undefined
}

/** Synchronous preparation hands its original proofs to the query's existing leased final fence. */
export function withSynchronousInputPreparation<Result>(run: () => Result): Result {
  if (active || preparation || finalizing) return run()
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

/** Only a completed native validator may lend its exact first-phase metadata.
 * Failed/cancelled validators leave no authority, and final owners always scan fresh. */
export function retainPendingFileIdentity(filePath: string, capture: () => FileIdentity | undefined,
  owner: object, epoch: number, revision: number): void {
  const phase = fileIdentities
  if (!phase || finalizing || phase.values.has(filePath) || phase.pending.has(filePath)
    || phase.bytes >= MAX_PHASE_FILE_IDENTITY_BYTES) return
  const identity = capture()
  if (!identity) return
  const bytes = 192 + 2 * (filePath.length + identity.physicalPath.length + identity.stamp.length)
  if (phase.bytes + bytes > MAX_PHASE_FILE_IDENTITY_BYTES) return
  phase.pending.set(filePath, { identity, owner, epoch, revision, bytes })
  phase.bytes += bytes
}

/** Primitive strings remain owned by the original validator. Final records are
 * provisional until that exact membership validator completes successfully.
 * No Stats object or JSON stamp is retained for unused source files. */
export function retainPendingRegularSourceObservation(file: string, parent: string, token: string,
  owner: object, epoch: number, revision: number, mode?: number): void {
  const phase = fileIdentities, bytes = 208
  if (!phase || phase.values.has(file) || phase.pending.has(file)
    || phase.bytes + bytes > MAX_PHASE_FILE_IDENTITY_BYTES) return
  phase.pending.set(file, { regular: { parent, token, mode }, owner, epoch, revision, bytes })
  phase.bytes += bytes
}

export interface RegularSourceObservation {
  readonly dev: number
  readonly ino: number
  readonly mode: number
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

/** Consume complete metadata from a successful same-phase native observer.
 * Never lends a final observation or authority for an actual byte-load guard. */
export function takeCompletedRegularSourceObservation(file: string, physicalParent: string): RegularSourceObservation | undefined {
  const phase = fileIdentities, pending = phase?.pending.get(file), observed = pending?.regular
  if (finalizing || !phase || !pending || !observed || observed.parent !== physicalParent) return undefined
  const proof = (active ?? preparation?.inputs)?.get(pending.owner)
  if (proof?.epoch !== pending.epoch || proof.revision !== pending.revision) return undefined
  return consumeRegularObservation(file, phase, pending, observed)
}

/** Only the first side of a final validation window may borrow a completed final
 * member scan. The caller must still perform its own later raw leaf observation. */
export function takeCompletedFinalRegularSourceObservation(file: string, physicalParent: string): RegularSourceObservation | undefined {
  const phase = fileIdentities, pending = phase?.pending.get(file), observed = pending?.regular
  if (!finalizing || !phase || !pending || !observed || observed.parent !== physicalParent) return undefined
  const proof = completedFinalMemberships?.get(pending.owner)
  if (proof?.epoch !== pending.epoch || proof.revision !== pending.revision) return undefined
  return consumeRegularObservation(file, phase, pending, observed)
}

function consumeRegularObservation(file: string, phase: FileIdentityPhase, pending: PendingFileIdentity,
  observed: NonNullable<PendingFileIdentity["regular"]>): RegularSourceObservation | undefined {
  const fields = observed.token.split(":").map(Number), mode = observed.mode
  if (fields.length !== 5 || !Number.isSafeInteger(fields[0]) || fields[0] < 0
    || !Number.isSafeInteger(fields[1]) || fields[1] <= 0 || !Number.isSafeInteger(fields[2]) || fields[2] < 0
    || !Number.isFinite(fields[3]) || !Number.isFinite(fields[4])
    || mode === undefined || !Number.isSafeInteger(mode) || mode < 0) return undefined
  phase.pending.delete(file)
  phase.bytes -= pending.bytes
  return { dev: fields[0], ino: fields[1], mode, size: fields[2], mtimeMs: fields[3], ctimeMs: fields[4] }
}

function regularObservation(file: string, observed: { readonly parent: string; readonly token: string }): FileIdentity | undefined {
  const fields = observed.token.split(":").map(Number)
  if (fields.length !== 5 || !Number.isSafeInteger(fields[0]) || fields[0] < 0
    || !Number.isSafeInteger(fields[1]) || fields[1] <= 0 || !Number.isSafeInteger(fields[2]) || fields[2] < 0
    || !Number.isFinite(fields[3]) || !Number.isFinite(fields[4])) return undefined
  const physicalPath = path.join(observed.parent, path.basename(file))
  return { physicalPath, stamp: JSON.stringify([physicalPath, ...fields]) }
}

/** Physical metadata only; query and final publication always start separate fresh scans. */
export function requestFileIdentity(filePath: string,
  read: () => FileIdentity | undefined): FileIdentity | undefined {
  const known = fileIdentities?.values.get(filePath)
  if (known) return known
  const pending = fileIdentities?.pending.get(filePath)
  const proof = pending && (active ?? preparation?.inputs)?.get(pending.owner)
  let current: FileIdentity | undefined
  if (!finalizing && pending && proof?.epoch === pending.epoch && proof.revision === pending.revision) {
    fileIdentities!.pending.delete(filePath)
    fileIdentities!.bytes -= pending.bytes
    current = pending.identity ?? (pending.regular && regularObservation(filePath, pending.regular))
  }
  current ??= read()
  // UTF-16 string storage plus an allowance for the entry, identity and Map
  // bookkeeping. Overflow keeps the ordinary uncached read, never a stale fact.
  if (current && fileIdentities) {
    const bytes = 128 + 2 * (filePath.length + current.physicalPath.length + current.stamp.length)
    if (reservePhaseBytes(fileIdentities, bytes)) {
      fileIdentities.values.set(filePath, current)
      fileIdentities.bytes += bytes
    }
  }
  return current
}

/** Share validation observations, never the uncached guards surrounding an actual load. */
export function requestConfigurationIdentity(filePath: string, directoryOnly: boolean, expected: string,
  read: () => ConfigurationInputIdentity | undefined): ConfigurationValidationIdentity | undefined {
  if (configurationFactCapture) configurationFactCapture.observed = true
  const slot = directoryOnly ? 1 : 0
  const entries = fileIdentities?.configurations.get(filePath)
  // Both modes use the same full identity for a direct regular file. Directory
  // namespace and directory-only identities must retain separate observations.
  const counterpart = entries?.[1 - slot]
  const known = entries?.[slot] ?? (counterpart?.regularSource ? counterpart : undefined)
  if (known) return known
  const current = read()
  const value = current && { identity: current.identity === expected ? expected : current.identity,
    regularSource: current.regularSource }
  let observationRetained = false
  if (current && fileIdentities) {
    // Active inputs already own filePath and the expected loaded fact. Reuse
    // those strings; retain no duplicate load guard, absent-owner or path DTO.
    // A mismatching observation owns its new identity and is charged in full.
    const bytes = 128 + (entries ? 0 : 128) + (current.identity === expected ? 0 : 2 * current.identity.length)
    if (reservePhaseBytes(fileIdentities, bytes)) {
      const retained = entries ?? [undefined, undefined]
      retained[slot] = value
      fileIdentities.configurations.set(filePath, retained)
      fileIdentities.bytes += bytes
      observationRetained = true
    }
  }
  if (!observationRetained && configurationFactCapture) configurationFactCapture.complete = false
  return value
}

/** Request-local physical namespace evidence, never authority for an actual source read. */
export function requestValidationDirectory(filePath: string,
  capture: (remainingBytes: number) => ValidationDirectoryProof | undefined): ValidationDirectoryProof | undefined {
  const phase = fileIdentities
  if (!phase) return undefined
  const known = phase.directories.get(filePath)
  if (known) return known
  if (phase.directoriesExhausted) return undefined
  const proof = capture(MAX_PHASE_FILE_IDENTITY_BYTES - phase.bytes)
  if (!proof) return undefined
  if (!reservePhaseBytes(phase, proof.bytes)) {
    // An over-budget directory must not be repeatedly materialized per leaf.
    phase.directoriesExhausted = true
    return undefined
  }
  phase.directories.set(filePath, proof)
  phase.bytes += proof.bytes
  return proof
}

function validateDirectories(phase: FileIdentityPhase, unavailable: () => never): void {
  for (const proof of phase.directories.values()) if (!proof.current()) unavailable()
}

/** Share only successful checks inside one synchronous compiler query, never across requests. */
export function validateRequestInput(owner: object, epoch: number, revision: number,
  validate: () => boolean, kind?: InputValidationKind): boolean {
  const inputs = active ?? preparation?.inputs
  if (!inputs) {
    const previous = finalMembershipConsumer
    if (finalizing && kind === "membership-consumer") finalMembershipConsumer = owner
    try {
      const valid = validate()
      if (valid) consumedMembership(owner, epoch, revision, kind)
      return valid
    } finally { finalMembershipConsumer = previous }
  }
  const known = inputs.get(owner)
  if (known && known.epoch !== epoch) return false
  // Mixed/legacy registrations retain their original top-level final observer.
  const trustedKind = known && known.kind !== kind ? undefined : kind
  if (known?.revision === revision) {
    if (known.kind !== trustedKind) inputs.set(owner, { ...known, kind: undefined, requiredMemberships: undefined })
    consumedMembership(owner, epoch, revision, trustedKind)
    return true
  }
  const previous = membershipCapture
  const required = trustedKind === "membership-consumer" ? new Map<object, InputVersion>() : undefined
  if (required) membershipCapture = required
  let valid: boolean
  try { valid = validate() } finally { membershipCapture = previous }
  if (!valid) return false
  inputs.set(owner, { epoch, revision, validate: known?.validate ?? validate,
    kind: trustedKind, requiredMemberships: required })
  consumedMembership(owner, epoch, revision, trustedKind)
  return true
}

/** Preparation contributes to the query's final union, including nested lookups. */
export function withPreparationInputValidation<Result>(run: () => Result, unavailable: () => never): Result {
  // A synchronous preparation already hands its owners to the actual query.
  // Standalone initialization has no later query and must keep its own fence.
  if (active || finalizing) return run()
  if (!preparation) return withRequestInputValidation(run, unavailable)
  active = preparation.inputs
  try { return run() }
  finally { active = undefined }
}

/** The final union starts with fresh identities before the caller can publish a result. */
export function withRequestInputValidation<Result>(run: () => Result, unavailable: () => never): Result {
  if (active || finalizing) return run()
  const prepared = preparation
  const inputs = prepared?.inputs ?? new Map<object, ValidatedInput>()
  const identities = prepared?.identities ?? newIdentityPhase()
  active = inputs
  fileIdentities = identities
  try {
    const result = run()
    validateDirectories(identities, unavailable)
    active = undefined
    preparation = undefined
    resetIdentityObservations(identities)
    finalizing = true
    completedFinalMemberships = new Map()
    finalMemberships = requiredFinalMemberships(inputs)
    for (const [owner, input] of inputs) {
      if (finalMemberships.has(owner)) continue
      const previous = finalMembershipConsumer
      finalMembershipConsumer = input.kind === "membership-consumer" ? owner : undefined
      try {
        if (!input.validate()) unavailable()
        if (input.kind === "membership") completeFinalMembership(owner, input.epoch, input.revision)
      }
      finally { finalMembershipConsumer = previous }
    }
    for (const obligation of finalMemberships.values()) if (obligation.consumers.size) unavailable()
    validateDirectories(identities, unavailable)
    return result
  } finally {
    finalizing = false
    completedFinalMemberships = undefined
    finalMemberships = undefined
    finalMembershipConsumer = undefined
    active = undefined
    preparation = prepared
    fileIdentities = prepared?.identities
    clearIdentityPhase(identities)
    inputs.clear()
  }
}

function newIdentityPhase(): FileIdentityPhase {
  return { compositions: new Map(), configurationFacts: new Map(), sourceDirectories: new Map(), values: new Map(), pending: new Map(), configurations: new Map(), directories: new Map(), directoriesExhausted: false, bytes: 0 }
}

/** Unconsumed native receipts are optional speculation. Actual observations own
 * the existing budget first; evicting speculation only restores the raw path. */
function reservePhaseBytes(phase: FileIdentityPhase, bytes: number): boolean {
  if (bytes > MAX_PHASE_FILE_IDENTITY_BYTES) return false
  if (phase.bytes + bytes <= MAX_PHASE_FILE_IDENTITY_BYTES) return true
  for (const [filePath, pending] of phase.pending) {
    phase.pending.delete(filePath)
    phase.bytes -= pending.bytes
    if (phase.bytes + bytes <= MAX_PHASE_FILE_IDENTITY_BYTES) return true
  }
  return false
}

function resetIdentityObservations(phase: FileIdentityPhase): void {
  phase.compositions.clear()
  phase.configurationFacts.clear()
  phase.values.clear()
  phase.pending.clear()
  phase.configurations.clear()
  phase.directories.clear()
  phase.directoriesExhausted = false
  phase.bytes = phase.sourceDirectories.size * 256
}

function clearIdentityPhase(phase: FileIdentityPhase): void {
  phase.sourceDirectories.clear()
  resetIdentityObservations(phase)
}
