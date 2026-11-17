import type { WorkspaceIndexStatus } from "../contracts/workspace-index.js"
import { retainedReadProof } from "./versioned-index-proof.js"
import { asRecord, SidecarProtocolError, isIndexState, isNonNegativeInteger, isNullableGeneration } from "./sidecar-protocol-validation.js"

export function mapStatus(value: unknown): WorkspaceIndexStatus {
  const status = asRecord(value)
  if (!isIndexState(status.state) || !isNonNegativeInteger(status.committedGeneration)
    || (status.buildingGeneration !== undefined && !isNullableGeneration(status.buildingGeneration))) {
    throw new SidecarProtocolError("index sidecar returned an invalid status")
  }
  return { ...retainedReadProof(value), state: status.state, committedGeneration: status.committedGeneration,
    ...(typeof status.buildingGeneration === "number" ? { buildingGeneration: status.buildingGeneration } : {}),
    ...(typeof status.message === "string" ? { message: status.message } : {}),
  }
}

