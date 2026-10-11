interface CompilerArtifactIdentity {
  readonly packageVersion: string
  readonly compilerSha256: string
  readonly packageSha256: string
}

/** Embedded from the exact compiler input used by the production bundler. */
declare const ARKTS_COMPILER_ARTIFACT_IDENTITY: CompilerArtifactIdentity

export const compilerArtifactIdentity: CompilerArtifactIdentity | undefined =
  typeof ARKTS_COMPILER_ARTIFACT_IDENTITY === "undefined" ? undefined : ARKTS_COMPILER_ARTIFACT_IDENTITY
