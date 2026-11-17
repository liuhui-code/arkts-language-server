export interface IndexInput {
  readonly issuer: string
  readonly revision: number
}
export interface IndexSnapshotIdentity {
  readonly workspaceIdentity: string
  readonly storeId: string
  readonly factsDomain: string
  readonly head: number
}
export interface IndexQualification extends IndexSnapshotIdentity {
  readonly qualificationId: string
  readonly input: IndexInput
  readonly scanComplete: true
  readonly rejected: 0
  readonly fingerprint: string
}
export type IndexReadProof = {
  format: "legacy"
  snapshot: null
  qualification: null
} | {
  format: "versioned"
  snapshot: IndexSnapshotIdentity
  qualification: IndexQualification | null
}

export function sameIndexQualification(left: IndexQualification, right: IndexQualification): boolean {
  return left.workspaceIdentity === right.workspaceIdentity && left.storeId === right.storeId
    && left.factsDomain === right.factsDomain && left.head === right.head
    && left.qualificationId === right.qualificationId && left.fingerprint === right.fingerprint
    && left.input.issuer === right.input.issuer && left.input.revision === right.input.revision
}
