import path from "node:path"
import type ts from "typescript"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectSdkSelection } from "../sdk/project-sdk.js"
import { sdkContains } from "../sdk/environment.js"
import { canonicalExistingPath, type ModuleBoundary } from "./typescript-source-boundary.js"
import { globalDeclarationSummary, type GlobalDeclarationSummary } from "./global-declaration-summary.js"
import { resolvedPathIdentity } from "../../project/path-identity.js"
import type { RetainedConfigurationProof } from "../../project/loaded-configuration-witness.js"
import { createHash } from "node:crypto"

/** Data only: never retains a LanguageService, Program or SourceFile. */
export interface ScopeDependencyEnvironment {
  readonly rootPath: string
  readonly sdk: ProjectSdkSelection
  readonly resolver: LocalPackageResolver
  readonly options: ts.CompilerOptions
  readonly boundary: ModuleBoundary
  readonly sdkRoots: readonly string[]
  readonly baselineGlobals: ReadonlyMap<string, GlobalDeclarationSummary>
  readonly baselineSdk: ReadonlySet<string>
  readonly baselineInputs: RetainedConfigurationProof | undefined
  readonly baselineSourceHashes: ReadonlyMap<string, string>
}

export function scopeDependencyEnvironment(rootPath: string, sdk: ProjectSdkSelection,
  resolver: LocalPackageResolver, options: ts.CompilerOptions, program: ts.Program,
  baselineInputs?: RetainedConfigurationProof): ScopeDependencyEnvironment {
  return { rootPath, sdk, resolver, options, boundary: { rootPath,
    workspacePhysicalRoot: canonicalExistingPath(rootPath), sdkRoot: sdk.path,
    sdkPhysicalRoot: sdk.path ? canonicalExistingPath(sdk.path) : undefined, sdkComponents: sdk.components },
    sdkRoots: program.getRootFileNames().filter(file => sdkContains(sdk, path.resolve(file))),
    baselineGlobals: new Map(program.getSourceFiles().map(source => [resolvedPathIdentity(source.fileName), globalDeclarationSummary(source)])),
    baselineSdk: new Set(program.getSourceFiles().filter(source => sdkContains(sdk, path.resolve(source.fileName)))
      .map(source => resolvedPathIdentity(source.fileName))), baselineInputs,
    baselineSourceHashes: new Map(program.getSourceFiles().map(source => [resolvedPathIdentity(source.fileName),
      createHash("sha256").update(source.text).digest("hex")])) }
}
