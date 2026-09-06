import path from "node:path"

export const ARKUI_STRING_RESOURCE_GLOB = "**/resources/*/element/string.json"

export function isArkUIStringResourcePath(filePath: string): boolean {
  const segments = path.normalize(filePath).split(path.sep)
  const fileIndex = segments.length - 1
  return segments[fileIndex] === "string.json"
    && segments[fileIndex - 1] === "element"
    && Boolean(segments[fileIndex - 2])
    && segments[fileIndex - 3] === "resources"
}
