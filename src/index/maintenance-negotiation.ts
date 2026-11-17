import { SidecarRequestError } from "./sidecar-session.js"
import { SidecarProtocolError, asRecord } from "./sidecar-protocol-validation.js"

export const FILE_MAINTENANCE_CAPABILITY = "versioned-file-maintenance-v1"
export interface MaintenanceCapability {
  readonly factsDomain: string
  readonly sourceNamespaces?: true
  readonly readerEpoch: string
}
interface Initializer {
  request(method: string, params: unknown): Promise<unknown>
}
interface InitializePaths {
  workspaceRoot: string
  cacheDirectory: string
}
export interface NegotiatedMaintenance {
  initialized: Record<string, unknown>
  maintenance?: MaintenanceCapability
  legacyRetry: boolean
}

/** Old strict Native binaries reject the new field before opening a workspace.
 * Only that typed initialize failure permits a single unchanged-path retry.
 * Validation/identity/IO/transport failures must never silently downgrade.
 */
export async function negotiateMaintenance(session: Initializer, paths: InitializePaths, requested = true): Promise<NegotiatedMaintenance> {
  if (!requested) return { initialized: asRecord(await session.request("initialize", paths)), legacyRetry: false }
  let value: unknown
  let legacyRetry = false
  try {
    value = await session.request("initialize", { ...paths, capabilities: [FILE_MAINTENANCE_CAPABILITY] })
  } catch (error) {
    if (!(error instanceof SidecarRequestError) || error.code !== "invalid_params") throw error
    legacyRetry = true
    value = await session.request("initialize", { ...paths })
  }
  const initialized = asRecord(value)
  const caps = initialized.capabilities
  if (caps !== undefined && (!Array.isArray(caps) || caps.some(value => typeof value !== "string")
    || new Set(caps).size !== caps.length)) {
    throw new SidecarProtocolError("index sidecar returned invalid capabilities")
  }
  if (!caps?.includes(FILE_MAINTENANCE_CAPABILITY)) return { initialized, legacyRetry }
  if (legacyRetry || typeof initialized.factsDomain !== "string" || !initialized.factsDomain
    || typeof initialized.readerEpoch !== "string" || !initialized.readerEpoch) {
    throw new SidecarProtocolError("index sidecar returned an invalid maintenance capability identity")
  }
  return { initialized, legacyRetry,
    maintenance: Object.freeze({ factsDomain: initialized.factsDomain, readerEpoch: initialized.readerEpoch,
      ...(caps.includes("managed-source-namespaces-v1") ? { sourceNamespaces: true as const } : {}) }) }
}
