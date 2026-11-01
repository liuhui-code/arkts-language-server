import path from "node:path"

/** Resource locations only; interpreting compiler options and declarations belongs to the adapter. */
export interface SdkCompilerResources {
  readonly apiMetadata: string
  readonly loaderRoot: string
  readonly loaderConfiguration: string
  readonly componentConfiguration: string
  readonly runtimeAmbientCandidates: readonly string[]
  readonly componentAmbientCandidates: readonly string[]
  readonly coreAmbientCandidates: readonly string[]
  readonly declarationDirectories: readonly string[]
}

export function harmonyCompilerResources(root: string): SdkCompilerResources {
  const loaderRoot = path.join(root, "ets", "build-tools", "ets-loader")
  const component = (name: string) => path.join(root, "ets", "component", name)
  return {
    apiMetadata: path.join(root, "ets", "oh-uni-package.json"),
    loaderRoot,
    loaderConfiguration: path.join(loaderRoot, "tsconfig.json"),
    componentConfiguration: component("component_config.json"),
    runtimeAmbientCandidates: [path.join(loaderRoot, "declarations", "global.d.ts"), component("global.d.ts")],
    componentAmbientCandidates: ["index-full.d.ts", "common.d.ts", "arkui.d.ts"].map(component),
    coreAmbientCandidates: ["common.d.ts", "units.d.ts", "common_ts_ets_api.d.ts", "enums.d.ts"].map(component),
    declarationDirectories: ["ets/component", "ets/api", "ets/kits", "ets/arkts", "js/api"].map(p => path.join(root, p)),
  }
}
