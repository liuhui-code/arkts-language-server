import fs from "node:fs"
import path from "node:path"
import { diskIdentity, regularSourceIdentity } from "./source-file-identity.js"
import { requestFileIdentity, requestValidationDirectory, takeCompletedFinalRegularSourceObservation, type ValidationDirectoryProof } from "./request-input-validation.js"

/** Only previously load-proven regular sources may use this validation path.
 * Actual reads and symlink leaves keep the original full physical guards. */
export function observedSourceIdentity(file: string, expectedStamp?: string, checkpoint: () => void = () => {},
  sourceDirectories?: (directory: string) => ValidationDirectoryProof | undefined) {
  return requestFileIdentity(file, () => {
    checkpoint()
    if (!expectedStamp) return diskIdentity(file)
    try {
      const expected = JSON.parse(expectedStamp) as unknown[]
      if (!Array.isArray(expected) || expected.length !== 6 || typeof expected[0] !== "string"
        || path.basename(expected[0]) !== path.basename(file)) return diskIdentity(file)
      const borrowed = takeCompletedFinalRegularSourceObservation(file, path.dirname(expected[0]))
      const before = borrowed ?? fs.lstatSync(file)
      if (borrowed ? (borrowed.mode & 0o170000) !== 0o100000 : !strongFile(before as fs.Stats)) return diskIdentity(file)
      const directory = requestValidationDirectory(path.dirname(file), () => {
        const captured = sourceDirectories?.(path.dirname(file))
        checkpoint()
        if (!captured?.current()) return undefined
        return { ...captured, current: () => { checkpoint(); return captured.current() } }
      })
      if (!directory || directory.physicalPath !== path.dirname(expected[0])
        || !directory.names.has(path.basename(file))) return diskIdentity(file)
      const identity = regularSourceIdentity(expected[0], before)
      const after = fs.lstatSync(file)
      return strongFile(after) && regularSourceIdentity(expected[0], after).stamp === identity.stamp ? identity : undefined
    } catch { checkpoint(); return undefined }
  })
}

function strongFile(stat: fs.Stats): boolean {
  return stat.isFile() && Number.isSafeInteger(stat.ino) && stat.ino > 0
    && Number.isSafeInteger(stat.dev) && stat.dev >= 0
}
