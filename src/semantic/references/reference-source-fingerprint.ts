/** Exact complete source projection, shared by status admission and candidates.
 * This compares evidence only; no observation, cached validity or path rewriting. */
export function matchesReferenceSourceFingerprint(indexFingerprint: string | undefined,
  currentSourceFingerprint: string | undefined): boolean {
  return currentSourceFingerprint !== undefined && typeof indexFingerprint === "string"
    && /^arkts-complete-scan-v2:[a-f0-9]{64}:([a-f0-9]{64})$/.exec(indexFingerprint)?.[1] === currentSourceFingerprint
}
