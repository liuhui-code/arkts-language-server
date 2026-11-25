import path from "node:path"

/** Immutable decoding of an original load receipt, never a filesystem observation. */
export interface ConfigurationSourcePlan {
  readonly identity: string
  readonly file: string
  readonly parent: string
  readonly name: string
  readonly physical: string
  readonly physicalParent: string
  readonly stamp: readonly number[]
}

export function configurationSourcePlan(identity: string): ConfigurationSourcePlan | undefined {
  let value: unknown
  try { value = JSON.parse(identity) } catch { return undefined }
  if (!Array.isArray(value) || value.length !== 6 || typeof value[0] !== "string"
    || !Array.isArray(value[1]) || value[1].length !== 0 || typeof value[2] !== "string"
    || value[3] !== null || !Array.isArray(value[4]) || !Array.isArray(value[5])) return undefined
  const [file, , physical, , before, after] = value
  if (!path.isAbsolute(file) || !path.isAbsolute(physical) || before.length !== 6 || after.length !== 6
    || !before.every((n: unknown, i: number) => typeof n === "number" && Number.isFinite(n) && n === after[i])
    || !Number.isSafeInteger(before[0]) || before[0] < 0 || !Number.isSafeInteger(before[1]) || before[1] <= 0
    || path.basename(file) !== path.basename(physical)) return undefined
  return Object.freeze({ identity, file, parent: path.dirname(file), name: path.basename(file),
    physical, physicalParent: path.dirname(physical), stamp: Object.freeze(before) })
}
