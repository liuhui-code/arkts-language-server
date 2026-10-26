import type ts from "typescript"
import { CompilerOwnershipUncertainError } from "./compiler-resource-lifetime.js"

type KindSource = ts.SourceFile & { readonly scriptKind: ts.ScriptKind }
interface Lease {
  readonly path: ts.Path
  readonly bucket: ts.DocumentRegistryBucketKey
  readonly kind: ts.ScriptKind
  readonly mode: ts.SourceFile["impliedNodeFormat"]
  count: number
}

/** One LS owns these leases; SDK retention acquires its separate pins below this facade. */
export function ownedDocumentRegistry(shared: ts.DocumentRegistry): {
  readonly registry: ts.DocumentRegistry
  releaseRemaining(): void
} {
  const leases = new Map<string, Lease>()
  let releaseFailure: CompilerOwnershipUncertainError | undefined
  const identity = (file: ts.Path, bucket: ts.DocumentRegistryBucketKey,
    kind: ts.ScriptKind | undefined, mode: ts.SourceFile["impliedNodeFormat"]) => JSON.stringify([file, bucket, kind, mode])
  const acquire: ts.DocumentRegistry["acquireDocumentWithKey"] = (...args) => {
    const source = shared.acquireDocumentWithKey(...args) as KindSource
    const kind = args[6] ?? source.scriptKind
    const mode = source.impliedNodeFormat
    const key = identity(args[1], args[3], kind, mode)
    const lease = leases.get(key)
    if (lease) lease.count++
    else leases.set(key, { path: args[1], bucket: args[3], kind, mode, count: 1 })
    return source
  }
  const release = (file: ts.Path, bucket: ts.DocumentRegistryBucketKey,
    kind?: ts.ScriptKind, mode?: ts.SourceFile["impliedNodeFormat"]) => {
    if (releaseFailure) throw releaseFailure
    const key = identity(file, bucket, kind, mode)
    const lease = leases.get(key)
    if (!lease) throw new Error("Compiler released a document not owned by this language service")
    try { shared.releaseDocumentWithKey(file, bucket, lease.kind, mode) }
    catch (error) { throw releaseFailure = new CompilerOwnershipUncertainError(error) }
    if (--lease.count === 0) leases.delete(key)
  }
  const update: ts.DocumentRegistry["updateDocumentWithKey"] = (...args) => {
    const mode = typeof args[7] === "object" ? args[7].impliedNodeFormat : undefined
    if (!leases.has(identity(args[1], args[3], args[6], mode))) {
      throw new Error("Compiler updated a document not owned by this language service")
    }
    return shared.updateDocumentWithKey(...args)
  }
  const canonicalKeysRequired = (): never => {
    // The fixed compiler uses WithKey exclusively. Never invent a second path canonicalizer.
    throw new Error("Owned compiler documents require explicit canonical Registry keys")
  }
  return {
    registry: { ...shared, acquireDocumentWithKey: acquire, updateDocumentWithKey: update,
      releaseDocumentWithKey: release, acquireDocument: canonicalKeysRequired,
      updateDocument: canonicalKeysRequired, releaseDocument: canonicalKeysRequired },
    releaseRemaining() {
      for (const lease of leases.values()) {
        while (lease.count > 0) release(lease.path, lease.bucket, lease.kind, lease.mode)
      }
    },
  }
}
