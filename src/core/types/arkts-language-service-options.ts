import ts from "typescript"

import { officialEtsCompilerOptions } from "../../semantic/backends/ohos-typescript/ets-options.js"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"

export function arktsLanguageServiceOptions(sdkRoot: string | null, witness?: LoadedConfigurationWitness): ts.CompilerOptions {
  return {
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts"],
    ...officialEtsCompilerOptions(sdkRoot, witness),
  }
}
