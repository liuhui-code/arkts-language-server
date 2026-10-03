import fs from "node:fs"
import path from "node:path"

import JSON5 from "json5"
import type ts from "typescript"
import type { LoadedConfigurationWitness } from "../../../project/loaded-configuration-witness.js"

const MAX_ETS_CONFIG_BYTES = 256 * 1024
const MAX_SDK_METADATA_BYTES = 64 * 1024
const ETS_ANNOTATIONS_API_LEVEL = 24

export function officialEtsCompilerOptions(sdkRoot: string | null, witness?: LoadedConfigurationWitness): ts.CompilerOptions {
  if (!sdkRoot) return {}
  const sdkOptions = sdkFeatureOptions(sdkRoot, witness)
  const loaderRoot = path.join(sdkRoot, "ets", "build-tools", "ets-loader")
  const configPath = path.join(loaderRoot, "tsconfig.json")
  let source: string
  try {
    const contents = readOptionsFile(configPath, MAX_ETS_CONFIG_BYTES, witness)
    if (contents === undefined) return sdkOptions
    source = contents
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

function sdkFeatureOptions(sdkRoot: string, witness?: LoadedConfigurationWitness): ts.CompilerOptions {
  const metadataPath = path.join(sdkRoot, "ets", "oh-uni-package.json")
  try {
    const contents = readOptionsFile(metadataPath, MAX_SDK_METADATA_BYTES, witness)
    if (contents === undefined) return {}
    const metadata = JSON5.parse(contents) as {
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

function readOptionsFile(filePath: string, maxBytes: number, witness?: LoadedConfigurationWitness): string | undefined {
  const read = (): string | undefined => {
    const stat = fs.statSync(filePath)
    return stat.isFile() && stat.size <= maxBytes ? fs.readFileSync(filePath, "utf8") : undefined
  }
  return witness ? witness.observe(filePath, read) : read()
}
