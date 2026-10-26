import { fileURLToPath, pathToFileURL } from "node:url"

import { stringByteMetrics } from "./semantic-worker-string-bytes.js"
import { relativeResourcePath } from "../project/path-identity.js"

/** URI canonicalization is shared by transport bounds and physical source authority. */
export function canonicalWorkerFileUri(value: unknown, maxUriBytes: number, maxMessageBytes: number): value is string {
  if (typeof value !== "string" || /%(?:2f|5c)/i.test(value)) return false
  try {
    const invalid = () => new Error("Invalid semantic worker URI")
    stringByteMetrics(value, maxUriBytes, maxMessageBytes, invalid, invalid)
    const uri = new URL(value)
    const filePath = fileURLToPath(uri)
    return uri.protocol === "file:"
      && uri.host === ""
      && uri.username === ""
      && uri.password === ""
      && uri.search === ""
      && uri.hash === ""
      && uri.pathname.length > 0
      && !filePath.includes("\0")
      && uri.href === value
      && pathToFileURL(filePath).href === value
  } catch {
    return false
  }
}

export function workerUriWithinRoot(uriValue: string, rootValue: string): boolean {
  try {
    return relativeResourcePath(fileURLToPath(rootValue), fileURLToPath(uriValue)) !== undefined
  } catch { return false }
}
