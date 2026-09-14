import fs from "node:fs"
import path from "node:path"

import JSON5 from "json5"
import type ts from "typescript"

const MAX_ETS_CONFIG_BYTES = 256 * 1024
const MAX_SDK_METADATA_BYTES = 64 * 1024
const ETS_ANNOTATIONS_API_LEVEL = 24

export function officialEtsCompilerOptions(sdkRoot: string | null): ts.CompilerOptions {
  if (!sdkRoot) return {}
  const sdkOptions = sdkFeatureOptions(sdkRoot)
  const loaderRoot = path.join(sdkRoot, "ets", "build-tools", "ets-loader")
  const configPath = path.join(loaderRoot, "tsconfig.json")
  let source: string
  try {
    const stat = fs.statSync(configPath)
    if (!stat.isFile() || stat.size > MAX_ETS_CONFIG_BYTES) return sdkOptions
    source = fs.readFileSync(configPath, "utf8")
  } catch {
    return sdkOptions
  }
  try {
    const parsed = JSON5.parse(source) as { compilerOptions?: { ets?: unknown } }
    const ets = parsed.compilerOptions?.ets
    if (!ets || typeof ets !== "object" || Array.isArray(ets)) return sdkOptions
    return { ...sdkOptions, ets: ets as ts.EtsOptions, etsLoaderPath: loaderRoot }
  } catch {
    return sdkOptions
  }
}

function sdkFeatureOptions(sdkRoot: string): ts.CompilerOptions {
  const metadataPath = path.join(sdkRoot, "ets", "oh-uni-package.json")
  try {
    const stat = fs.statSync(metadataPath)
    if (!stat.isFile() || stat.size > MAX_SDK_METADATA_BYTES) return {}
    const metadata = JSON5.parse(fs.readFileSync(metadataPath, "utf8")) as {
      apiVersion?: unknown
    }
    const apiLevel = Number(metadata.apiVersion)
    return Number.isInteger(apiLevel) && apiLevel >= ETS_ANNOTATIONS_API_LEVEL
      ? { etsAnnotationsEnable: true }
      : {}
  } catch {
    return {}
  }
}
