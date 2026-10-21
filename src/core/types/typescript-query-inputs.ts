import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { LoadedConfigurationWitness } from "../../project/loaded-configuration-witness.js"
import { CooperativeWork } from "./cooperative-work.js"

export class SemanticInputUnavailableError extends Error {
  constructor() {
    super("Semantic query requires current workspace inputs")
    this.name = "SemanticInputUnavailableError"
  }
}

/** Membership completeness and unavailable source admission are separate failure reasons. */
export function projectMembershipFailure(status: "complete" | "partial" | "none", unavailable: boolean):
  { status: "incomplete"; reason: "project-membership-incomplete" | "source-unavailable" } | undefined {
  if (status !== "complete") return { status: "incomplete", reason: "project-membership-incomplete" }
  return unavailable ? { status: "incomplete", reason: "source-unavailable" } : undefined
}

/** Validate metadata from its actual load, never restamp a cached resolution. */
export function loadedConfigurationIsCurrent(
  witness: LoadedConfigurationWitness | undefined,
  resolver: LocalPackageResolver,
  rootPath: string,
  checkpoint: () => void,
): boolean {
  const work = new CooperativeWork(checkpoint)
  work.boundary()
  if (!witness) return work.finish(true)
  // Capture all load-owned predicates first, then verify once before returning.
  // Repeated checks may share this query's validation; its final union fence scans uncached.
  const compiler = witness.freshness(() => work.item(), "capture")
  const packages = resolver.configurationFreshness(rootPath, () => work.item(), "capture")
  return work.finish(Boolean(compiler?.() && packages?.()))
}

/** Same full scan and error as existing query fences; no cached validity answer. */
export function assertCurrentQueryInputs(witness: LoadedConfigurationWitness | undefined,
  resolver: LocalPackageResolver, rootPath: string, checkpoint: () => void): void {
  if (!loadedConfigurationIsCurrent(witness, resolver, rootPath, checkpoint)) {
    throw new SemanticInputUnavailableError()
  }
}
