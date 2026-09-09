import fs from "node:fs"
import path from "node:path"

import JSON5 from "json5"
import type ts from "typescript"

const MAX_ETS_CONFIG_BYTES = 256 * 1024

export function officialEtsCompilerOptions(sdkRoot: string | null): ts.CompilerOptions {
  if (!sdkRoot) return {}
  const loaderRoot = path.join(sdkRoot, "ets", "build-tools", "ets-loader")
  const configPath = path.join(loaderRoot, "tsconfig.json")
  let source: string
  try {
    const stat = fs.statSync(configPath)
    if (!stat.isFile() || stat.size > MAX_ETS_CONFIG_BYTES) return {}
    source = fs.readFileSync(configPath, "utf8")
  } catch {
    return {}
  }
  try {
    const parsed = JSON5.parse(source) as { compilerOptions?: { ets?: unknown } }
    const ets = parsed.compilerOptions?.ets
    if (!ets || typeof ets !== "object" || Array.isArray(ets)) return {}
    return { ets: ets as ts.EtsOptions, etsLoaderPath: loaderRoot }
  } catch {
    return {}
  }
}
