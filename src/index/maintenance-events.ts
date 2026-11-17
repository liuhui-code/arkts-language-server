import type { WorkspaceIndexValidation } from "../contracts/workspace-symbol-service.js"
import { asRecord, SidecarProtocolError, isNonNegativeInteger } from "./sidecar-protocol-validation.js"
import { decodeInput, decodeMaintenanceTerminal, type IndexInput } from "./versioned-index-proof.js"

export interface MaintenanceEvent {
  protocol: 1
  event: "maintenance/progress" | "maintenance/terminal"
  attemptId: string
  input: IndexInput
  validation?: WorkspaceIndexValidation
  [key: string]: unknown
}

/** Envelope validation is independent of any task. The task owner separately
 * checks expected workspace/domain/input before accepting a terminal as proof.
 */
export function decodeMaintenanceEvent(value: unknown): MaintenanceEvent {
  const event = asRecord(value)
  if (event.protocol !== 1 || "id" in event || typeof event.attemptId !== "string" || !event.attemptId) {
    throw new SidecarProtocolError("index sidecar returned an invalid maintenance event")
  }
  const input = decodeInput(event.input)
  if (event.scope !== undefined && event.scope !== "file" && event.scope !== "workspace") {
    throw new SidecarProtocolError("index sidecar returned an invalid maintenance scope")
  }
  if (event.scope === "file" && (typeof event.uri !== "string" || !event.uri)) {
    throw new SidecarProtocolError("index sidecar omitted file maintenance identity")
  }
  if (event.event === "maintenance/progress") {
    if (!isNonNegativeInteger(event.discovered) || !isNonNegativeInteger(event.indexed)
      || !isNonNegativeInteger(event.rejected)) {
      throw new SidecarProtocolError("index sidecar returned invalid maintenance progress")
    }
  } else if (event.event === "maintenance/terminal") {
    const proof = event.qualification ?? event.snapshot
    const q = proof === undefined || proof === null ? undefined : asRecord(proof)
    decodeMaintenanceTerminal(event, {
      workspaceIdentity: typeof q?.workspaceIdentity === "string" ? q.workspaceIdentity : "",
      factsDomain: typeof q?.factsDomain === "string" ? q.factsDomain : "", input,
    })
  } else {
    throw new SidecarProtocolError("index sidecar returned an unknown maintenance event")
  }
  return { ...event, protocol: 1, event: event.event, attemptId: event.attemptId, input,
    validation: decodeValidation(event.validation) }
}

function decodeValidation(value: unknown): WorkspaceIndexValidation | undefined {
  if (value === undefined || value === null) return undefined
  const status = asRecord(value)
  const stage = status.stage
  if ((stage !== "QuickCheck" && stage !== "ForeignKeys" && stage !== "Fts")
    || !isNonNegativeInteger(status.vmSteps) || !isNonNegativeInteger(status.activitySequence)
    || !isNonNegativeInteger(status.stageElapsedMs)) {
    throw new SidecarProtocolError("index sidecar returned invalid SQL validation progress")
  }
  return { stage, vmSteps: status.vmSteps, activitySequence: status.activitySequence,
    stageElapsedMs: status.stageElapsedMs }
}
