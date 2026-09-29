export function readOwnDataRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  maxNodes: number,
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object") return undefined
  try {
    if (Array.isArray(value)) return undefined
  } catch {
    return undefined
  }
  let prototype: object | null
  try {
    prototype = Object.getPrototypeOf(value)
  } catch {
    return undefined
  }
  if (prototype !== Object.prototype && prototype !== null) return undefined
  let keys: readonly PropertyKey[]
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    return undefined
  }
  const allowedKeys = [...requiredKeys, ...optionalKeys]
  const maxKeys = Math.min(allowedKeys.length, maxNodes)
  if (
    keys.length > maxKeys
    || requiredKeys.length > keys.length
    || keys.some(key => typeof key !== "string" || !allowedKeys.includes(key))
    || requiredKeys.some(key => !keys.includes(key))
  ) return undefined
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of keys as readonly string[]) {
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      return undefined
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined
    copy[key] = descriptor.value
  }
  return copy
}
