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
  const fallback = () => ({ ...sdkOptions, ...sdkComponentOptions(sdkRoot, witness) })
  const loaderRoot = path.join(sdkRoot, "ets", "build-tools", "ets-loader")
  const configPath = path.join(loaderRoot, "tsconfig.json")
  let source: string
  try {
    const contents = readOptionsFile(configPath, MAX_ETS_CONFIG_BYTES, witness)
    if (contents === undefined) return fallback()
    source = contents
  } catch {
    return fallback()
  }
  try {
    const parsed = JSON5.parse(source) as { compilerOptions?: { ets?: unknown } }
    const ets = parsed.compilerOptions?.ets
    if (!ets || typeof ets !== "object" || Array.isArray(ets)) return fallback()
    return { ...sdkOptions, ets: withEtsDefaults(ets as Partial<ts.EtsOptions>), etsLoaderPath: loaderRoot }
  } catch {
    return fallback()
  }
}

/** Declaration-only SDKs still own the names that select the fork's UI grammar. */
function sdkComponentOptions(sdkRoot: string, witness?: LoadedConfigurationWitness): ts.CompilerOptions {
  try {
    const contents = readOptionsFile(path.join(sdkRoot, "ets", "component", "component_config.json"),
      MAX_ETS_CONFIG_BYTES, witness)
    if (contents === undefined) return {}
    const parsed: unknown = JSON.parse(contents)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const components = Object.keys(parsed)
    if (!components.length || components.length > 4096
      || components.some(name => !/^[A-Za-z_$][\w$]*$/.test(name))) return {}
    return { ets: withEtsDefaults({ components }) }
  } catch { return {} }
}

/** The fork dereferences required records even in a partial loader config. */
function withEtsDefaults(ets: Partial<ts.EtsOptions>): ts.EtsOptions {
  // Empty feature sets do not invent SDK decorator names or signatures.
  const empty: ts.EtsOptions = {
    components: [], libs: [], render: { method: [], decorator: [] },
    extend: { decorator: [], components: [] },
    styles: { decorator: "", component: { name: "", type: "", instance: "" }, property: "" },
    concurrent: { decorator: "" }, propertyDecorators: [], emitDecorators: [],
    syntaxComponents: { paramsUICallback: [], attrUICallback: [] },
  }
  return { ...empty, ...ets, render: { ...empty.render, ...ets.render },
    extend: { ...empty.extend, ...ets.extend }, concurrent: { ...empty.concurrent, ...ets.concurrent },
    styles: { ...empty.styles, ...ets.styles,
      component: { ...empty.styles.component, ...ets.styles?.component } },
    syntaxComponents: { ...empty.syntaxComponents, ...ets.syntaxComponents } }
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
