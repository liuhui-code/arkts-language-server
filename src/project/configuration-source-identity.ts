import fs from "node:fs"
import path from "node:path"
import type { ConfigurationSourcePlan } from "./configuration-source-plan.js"
import { requestValidationDirectory, validationSourceDirectory, takeCompletedRegularSourceObservation, type ConfigurationInputIdentity } from "./request-input-validation.js"

/** Resolution only: no path is invented without the active Native namespace and
 * fresh strong leaves. Callers retain their raw fallback and physical boundary. */
export function resolutionSourcePhysicalPath(file: string, checkpoint: () => void): string | undefined {
  if (!validationSourceDirectory(path.dirname(file), path.basename(file))) return undefined
  const observed = configurationSourceIdentity(file, () => undefined, checkpoint)
  if (!observed?.regularSource) return undefined
  const physical: unknown = JSON.parse(observed.identity)[2]
  return typeof physical === "string" ? physical : undefined
}

/** Validation of a previously loaded regular source, never a replacement for its
 * actual read guards. Unknown namespaces, links and weak identities use raw IO. */
export function configurationSourceIdentity(file: string, raw: () => ConfigurationInputIdentity | undefined,
  checkpoint: () => void, original?: ConfigurationSourcePlan): ConfigurationInputIdentity | undefined {
  checkpoint()
  const plan = original?.file === file ? original : undefined
  const parent = plan?.parent ?? path.dirname(file), name = plan?.name ?? path.basename(file)
  const directory = requestValidationDirectory(parent, () => {
    const original = validationSourceDirectory(parent, name)
    checkpoint()
    return original?.current() ? original : undefined
  })
  if (!directory?.names.has(name)) return raw()
  try {
    let before: SourceStamp
    const borrowed = takeCompletedRegularSourceObservation(file, directory.physicalPath)
    if (borrowed) before = borrowed
    else {
      const observed = fs.lstatSync(file)
      checkpoint()
      if (!strong(observed)) return raw()
      before = observed
    }
    checkpoint()
    const physical = plan?.physicalParent === directory.physicalPath ? plan.physical : path.join(directory.physicalPath, name)
    const after = fs.lstatSync(file)
    checkpoint()
    if (!strong(after) || !sameStamp(before, after)) return undefined
    // A completed same-phase member observation may supply the first stamp.
    // The later raw leaf and independent final observations remain mandatory.
    let identity: string
    if (plan?.physical === physical && matchesPlan(before, plan.stamp)) identity = plan.identity
    else {
      const observed = stamp(before)
      identity = JSON.stringify([file, [], physical, null, observed, observed])
    }
    return { identity, loadGuard: identity, witnessPath: file, regularSource: true }
  } catch { checkpoint(); return undefined }
}

function strong(stat: fs.Stats): boolean {
  return stat.isFile() && Number.isSafeInteger(stat.ino) && stat.ino > 0
    && Number.isSafeInteger(stat.dev) && stat.dev >= 0
}

type SourceStamp = Pick<fs.Stats, "dev" | "ino" | "mode" | "size" | "mtimeMs" | "ctimeMs">

function stamp(stat: SourceStamp): readonly number[] {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs]
}

function sameNumber(left: number, right: number): boolean {
  return left === right || !Number.isFinite(left) && !Number.isFinite(right)
}

function sameStamp(left: SourceStamp, right: SourceStamp): boolean {
  return sameNumber(left.dev, right.dev) && sameNumber(left.ino, right.ino)
    && sameNumber(left.mode, right.mode) && sameNumber(left.size, right.size)
    && sameNumber(left.mtimeMs, right.mtimeMs) && sameNumber(left.ctimeMs, right.ctimeMs)
}

function matchesPlan(stat: SourceStamp, fields: readonly number[]): boolean {
  return stat.dev === fields[0] && stat.ino === fields[1] && stat.mode === fields[2]
    && stat.size === fields[3] && stat.mtimeMs === fields[4] && stat.ctimeMs === fields[5]
}
