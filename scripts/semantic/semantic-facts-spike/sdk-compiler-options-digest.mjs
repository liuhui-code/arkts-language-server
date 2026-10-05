import { createHash } from "node:crypto"
import fs, { constants } from "node:fs/promises"
import path from "node:path"

// These are the two SDK files read by officialEtsCompilerOptions(). Keep
// this list explicit so declaration and compiler-option identities stay distinct.
const optionFiles = [
  ["ets/oh-uni-package.json", 64 * 1024],
  ["ets/build-tools/ets-loader/tsconfig.json", 256 * 1024],
]

export async function digestSdkCompilerOptions(sdkRoot) {
  const hash = createHash("sha256")
  for (const [relative, maxBytes] of optionFiles) {
    hash.update(relative).update("\0")
    const absolute = path.join(sdkRoot, ...relative.split("/"))
    let handle
    try {
      handle = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      hash.update("absent\0")
      continue
    }
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > maxBytes) {
        throw new Error(`SDK compiler-options input is not a bounded regular file: ${absolute}`)
      }
      const contents = await handle.readFile()
      if (contents.length > maxBytes) throw new Error(`SDK compiler-options input exceeds budget: ${absolute}`)
      hash.update("present\0").update(String(contents.length)).update("\0").update(contents)
    } finally {
      await handle.close()
    }
  }
  return hash.digest("hex")
}
