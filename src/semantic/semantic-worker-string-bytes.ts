/** Exact raw UTF-8 and JSON wire byte accounting, including lone UTF-16 surrogates. */
export function jsonStringWireBytes(value: string, maxBytes: number, onByteLimit: () => Error): number {
  return stringByteMetrics(value, Number.MAX_SAFE_INTEGER, maxBytes, onByteLimit, onByteLimit).wireBytes
}

export function stringByteMetrics(
  value: string,
  maxRawBytes: number,
  maxWireBytes: number,
  onRawLimit: () => Error,
  onWireLimit: () => Error,
): { readonly rawBytes: number; readonly wireBytes: number } {
  let rawBytes = 0
  let wireBytes = 2
  if (wireBytes > maxWireBytes) throw onWireLimit()
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09
      || code === 0x0a || code === 0x0c || code === 0x0d) {
      rawBytes += 1
      wireBytes += 2
    } else if (code < 0x20) {
      rawBytes += 1
      wireBytes += 6
    } else if (code < 0x80) {
      rawBytes += 1
      wireBytes += 1
    } else if (code < 0x800) {
      rawBytes += 2
      wireBytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        rawBytes += 4
        wireBytes += 4
        index += 1
      } else {
        rawBytes += 3
        wireBytes += 6
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      rawBytes += 3
      wireBytes += 6
    } else {
      rawBytes += 3
      wireBytes += 3
    }
    if (rawBytes > maxRawBytes) throw onRawLimit()
    if (wireBytes > maxWireBytes) throw onWireLimit()
  }
  return Object.freeze({ rawBytes, wireBytes })
}
