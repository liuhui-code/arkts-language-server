import type ts from "typescript"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import { validateRequestInput } from "../../project/request-input-validation.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

/** Worker-local proof; never accepted as authority by the serialized protocol. */
export const OPERATION_SCOPE = Symbol("operationScopeProof")
export interface OperationScopeProof {
  current(): boolean
  readonly options: string
  readonly projected: boolean
  readonly nativePackageBaseline?: ReadonlyMap<string, string>
  readonly fallbackRoots: readonly string[]
  fallback(): void
}
export type ScopedWorkspace = SemanticWorkspaceView & { readonly [OPERATION_SCOPE]?: OperationScopeProof }
let active: OperationScopeProof | undefined
class FullOperationScopeRequired extends Error {}
export const isFullOperationScopeRequired = (error: unknown): boolean => error instanceof FullOperationScopeRequired

export function hasOperationScope(workspace: SemanticWorkspaceView): boolean {
  return (workspace as ScopedWorkspace)[OPERATION_SCOPE] !== undefined
}

export function withOperationScope<Result>(workspace: SemanticWorkspaceView, run: () => Result): Result {
  const previous = active
  active = (workspace as ScopedWorkspace)[OPERATION_SCOPE]
  try { return run() } finally { active = previous }
}

/** Pinned ohos-typescript's actual package-id canonicalization table, including
 * cached resolutions. Checking only fresh Host callbacks misses reused SDK files.
 * Unknown compiler shape conservatively uses the complete semantic unit. */
export function assertOperationProgramPackageIdentity(program: ts.Program | undefined): void {
  if (!active?.projected || !program) return
  const packages = (program as ts.Program & { sourceFileToPackageName?: ReadonlyMap<unknown, unknown> }).sourceFileToPackageName
  if (packages?.size === 0) return
  const baseline = active.nativePackageBaseline
  if (baseline && packages instanceof Map && packages.size === baseline.size
    && [...packages].every(([file, name]) => baseline.get(file as string) === name)) return
  active.fallback()
  throw new FullOperationScopeRequired("Native package identity requires its complete semantic unit")
}

export function fullOperationScope(workspace: SemanticWorkspaceView, error: unknown): SemanticWorkspaceView | undefined {
  const proof = (workspace as ScopedWorkspace)[OPERATION_SCOPE]
  return error instanceof FullOperationScopeRequired && proof?.projected
    ? { ...workspace, semanticRootPaths: proof.fallbackRoots,
      [OPERATION_SCOPE]: { ...proof, projected: false } } as ScopedWorkspace : undefined
}

/** Recheck the syntax/configuration inputs, not a cached valid flag. */
export function assertCurrentOperationScope(workspace: SemanticWorkspaceView, options: ts.CompilerOptions): void {
  const proof = (workspace as ScopedWorkspace)[OPERATION_SCOPE]
  if (proof && (proof.options !== JSON.stringify(options)
    || !validateRequestInput(proof, 0, 0, () => proof.current(), "membership-consumer"))) throw new SemanticInputUnavailableError()
}

/** Primitive metadata only, detached from the baseline Program/AST lifetime. */
export function nativeProgramPackageBaseline(program: ts.Program | undefined): ReadonlyMap<string, string> | undefined {
  const packages = (program as (ts.Program & { sourceFileToPackageName?: unknown }) | undefined)?.sourceFileToPackageName
  return packages instanceof Map && [...packages].every(([file, name]) => typeof file === "string" && typeof name === "string")
    ? new Map(packages as Map<string, string>) : undefined
}
