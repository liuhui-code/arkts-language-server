import fs from "node:fs"

const MAX_CONFIGURATION_BYTES = 64 * 1024

/** Bound allocations even if a configuration file grows after fstat. */
export function readSdkConfiguration(filePath: string): string {
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
  try {
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.size > MAX_CONFIGURATION_BYTES) throw new Error("Invalid SDK configuration size or type")
    const buffer = Buffer.alloc(MAX_CONFIGURATION_BYTES + 1)
    let bytes = 0
    while (bytes < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytes, buffer.length - bytes, bytes)
      if (count === 0) break
      bytes += count
    }
    if (bytes > MAX_CONFIGURATION_BYTES) throw new Error("SDK configuration exceeds size limit")
    return buffer.subarray(0, bytes).toString("utf8")
  } finally {
    fs.closeSync(descriptor)
  }
}
