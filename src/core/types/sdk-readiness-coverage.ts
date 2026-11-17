import type { ProjectSdkSelection } from "../sdk/project-sdk.js"
import { harmonyCompilerResources } from "../sdk/compiler-resources.js"
import { sameResolvedPath } from "../../project/path-identity.js"

/** A pre-existing SDK input refusal, not project/Program readiness or validity. */
export function sdkReadinessCoverage(sdk: ProjectSdkSelection, profile: string, roots: readonly string[]): boolean {
  return sdk.ready && sdk.identity?.status === "identified" && profile === "full"
    && (!sdk.targetQualification || sdk.targetQualification.status === "compatible")
    && !sdk.components?.some(component => component.issue)
    && roots.some(root => harmonyCompilerResources(sdk.path!).componentAmbientCandidates
      .some(candidate => sameResolvedPath(root, candidate)))
}
