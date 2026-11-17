import fs from "node:fs"
import path from "node:path"
import { requestValidationDirectory, validationSourceDirectory, type ConfigurationInputIdentity } from "./request-input-validation.js"

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
  checkpoint: () => void): ConfigurationInputIdentity | undefined {
  checkpoint()
  const parent = path.dirname(file), name = path.basename(file)
  const directory = requestValidationDirectory(parent, () => {
    const original = validationSourceDirectory(parent, name)
    checkpoint()
    return original?.current() ? original : undefined
  })
  if (!directory?.names.has(name)) return raw()
  try {
    const before = fs.lstatSync(file)
    checkpoint()
    if (!strong(before)) return raw()
    const physical = path.join(directory.physicalPath, name)
    const observed = stamp(before)
    const after = fs.lstatSync(file)
    checkpoint()
    const checked = stamp(after)
    if (!strong(after) || !observed.every((value, index) => value === checked[index]
      || !Number.isFinite(value) && !Number.isFinite(checked[index]))) return undefined
    // Keep JSON's original number equivalence (including non-finite values),
    // but allocate the published identity once, after both raw leaf checks.
    const identity = JSON.stringify([file, [], physical, null, observed, observed])
    return { identity, loadGuard: identity, witnessPath: file, regularSource: true }
  } catch { checkpoint(); return undefined }
}

function strong(stat: fs.Stats): boolean {
  return stat.isFile() && Number.isSafeInteger(stat.ino) && stat.ino > 0
    && Number.isSafeInteger(stat.dev) && stat.dev >= 0
}

function stamp(stat: fs.Stats): readonly number[] {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs]
}
