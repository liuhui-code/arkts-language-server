import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"

export type TypeScriptSdkAmbientProfile = "full" | "core" | "common"

export function discoverSdkAmbientDeclarations(
  sdkRoot: string | null,
  profile: TypeScriptSdkAmbientProfile,
  witness?: LoadedConfigurationWitness,
): string[] {
  if (!sdkRoot) return []
  const exists = (candidate: string): boolean => witness
    ? witness.observe(candidate, () => fs.existsSync(candidate)) : fs.existsSync(candidate)
  if (profile === "core") {
    const core = [
      path.join(sdkRoot, "ets", "component", "common.d.ts"),
      path.join(sdkRoot, "ets", "component", "units.d.ts"),
      path.join(sdkRoot, "ets", "component", "common_ts_ets_api.d.ts"),
      path.join(sdkRoot, "ets", "component", "enums.d.ts"),
    ]
    if (core.every(exists) && fullSdkIndexOnlyReferences(sdkRoot, core, witness)) return core
  }
  if (profile === "common") {
    const common = path.join(sdkRoot, "ets", "component", "common.d.ts")
    if (!exists(common)) throw new Error(`SDK common ambient declaration is unavailable: ${common}`)
    return [common]
  }
  const prelude = [
    path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    path.join(sdkRoot, "ets", "component", "common.d.ts"),
    path.join(sdkRoot, "ets", "component", "arkui.d.ts"),
  ].find(exists)
  return prelude ? [prelude] : []
}

function fullSdkIndexOnlyReferences(
  sdkRoot: string,
  expectedPaths: readonly string[],
  witness?: LoadedConfigurationWitness,
): boolean {
  const indexPath = path.join(sdkRoot, "ets", "component", "index-full.d.ts")
  try {
    const read = () => fs.readFileSync(indexPath, "utf8")
    const contents = witness ? witness.observe(indexPath, read) : read()
    if (contents.split(/\r?\n/).some((line) => (
      /^\s*\/\/\//.test(line)
      && !/^\s*\/\/\/\s*<reference path="[^"]+"\s*\/>\s*$/.test(line)
    ))) return false
    const source = ts.createSourceFile(indexPath, contents, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
    if (source.statements.length > 0 || source.hasNoDefaultLib || source.typeReferenceDirectives.length > 0
      || source.libReferenceDirectives.length > 0 || source.referencedFiles.length !== expectedPaths.length) return false
    const expected = new Set(expectedPaths.map((filePath) => path.resolve(filePath)))
    return source.referencedFiles.every(reference => (
      expected.delete(path.resolve(path.dirname(indexPath), reference.fileName))
    )) && expected.size === 0
  } catch { return false }
}
