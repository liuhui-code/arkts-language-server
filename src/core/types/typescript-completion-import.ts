import fs from "node:fs"
import path from "node:path"

const fromSpecifier = /(\bfrom\s+)(["'])(?:\\.|(?!\2)[^\\])*\2/u
const replaceSpecifier = (text: string, specifier: string): string => text.replace(fromSpecifier,
  (_match, from: string, quote: string) => from + quote
    + JSON.stringify(specifier).slice(1, -1).replace(/'/g, "\\'") + quote)

/** SDK import routes are supplied only after resolving the compiler source against the selected SDK. */
export function normalizeCompletionEdit(text: string, currentPath: string, sourcePath: string | undefined,
  eol: string, sdkSpecifier?: string): string {
  const normalized = text.replace(/\r\n?|\n/gu, eol)
  if (sdkSpecifier) return replaceSpecifier(normalized, sdkSpecifier)
  if (!sourcePath || !path.isAbsolute(sourcePath)) return normalized
  const sourceWithExtension = path.extname(sourcePath) ? sourcePath
    : [".ets", ".ts", ".d.ets", ".d.ts"].map(extension => sourcePath + extension)
      .find(candidate => fs.existsSync(candidate)) ?? sourcePath
  let specifier = path.relative(path.dirname(currentPath), sourceWithExtension).replace(/\\/gu, "/")
  if (!specifier.startsWith(".")) specifier = `./${specifier}`
  return replaceSpecifier(normalized, specifier)
}
