import path from "node:path"

export const ARKUI_STRING_RESOURCE_GLOB = "**/resources/*/element/string.json"
export const ARKUI_CONFIGURED_STRING_RESOURCE_GLOB = "**/*/element/string.json"

export function isArkUIStringResourceCandidate(filePath: string): boolean {
  const segments = path.normalize(filePath).split(path.sep)
  return segments.at(-1) === "string.json" && segments.at(-2) === "element"
    && Boolean(segments.at(-3))
}

export function isArkUIStringResourcePath(filePath: string): boolean {
  const segments = path.normalize(filePath).split(path.sep)
  const fileIndex = segments.length - 1
  return segments[fileIndex] === "string.json"
    && segments[fileIndex - 1] === "element"
    && Boolean(segments[fileIndex - 2])
    && segments[fileIndex - 3] === "resources"
}
