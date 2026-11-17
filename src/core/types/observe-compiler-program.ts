import type ts from "typescript"
import type { RetainedConfigurationProof } from "../../project/loaded-configuration-witness.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectSdkSelection } from "../sdk/project-sdk.js"
import { scopeDependencyEnvironment } from "./scope-dependency-environment.js"
import type { TypeScriptHostRoots } from "./typescript-host-file-names.js"
import { assertOperationProgramPackageIdentity, nativeProgramPackageBaseline } from "./operation-scope-execution.js"

/** Program has returned, but an operation scope is not yet a publishable result. */
export function admitCompilerProgramObservation(program: ts.Program | undefined,
  roots: Pick<TypeScriptHostRoots, "observeProgram">, version: string): void {
  assertOperationProgramPackageIdentity(program)
  roots.observeProgram(program, version)
}

/** Optional baseline capture is used only after completed SDK synchronization. */
export function compilerSyntaxProfile(options: ts.CompilerOptions, program?: ts.Program, root?: string, sdk?: ProjectSdkSelection, resolver?: LocalPackageResolver,
  baselineInputs?: () => RetainedConfigurationProof | undefined) {
  return { options, nativePackages: nativeProgramPackageBaseline(program),
    dependencies: program && root && sdk && resolver ? scopeDependencyEnvironment(root, sdk, resolver, options, program, baselineInputs?.()) : undefined }
}
