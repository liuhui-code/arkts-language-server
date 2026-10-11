import path from "node:path"
import type ts from "typescript"

import type { SemanticDocumentPosition } from "../protocol.js"
import type { SemanticRenameQueryResult } from "./type-engine-contract.js"
import { CooperativeWork } from "./cooperative-work.js"
import { lineColumnToOffset } from "./text-position.js"
import { isIdentifierText, preflightRenameConflict } from "./typescript-rename-conflict.js"
import { compareTextEdits, hasOverlappingEdits } from "./typescript-rename-edits.js"
import { exactSourceRange, semanticLocationKey, type ReferenceSourceView } from "./typescript-reference-query.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

interface RenameSourceView extends ReferenceSourceView {
  readonly sourceContent: string
  readonly documentVersion?: number
}

export interface RenameQueryPort {
  readonly rootPath: string
  readonly service: ts.LanguageService
  readonly checkpoint?: () => void
  readonly querySource: (filePath: string) => RenameSourceView | undefined
  readonly sourceView: (filePath: string) => ReferenceSourceView | undefined
  readonly membershipFailure: () => Extract<SemanticRenameQueryResult, { status: "incomplete" }> | undefined
  readonly inputsAreCurrent: (checkpoint: () => void) => boolean
}

/** Publish an atomic edit set only after validating every current input fact. */
export function queryTypeScriptRename(
  port: RenameQueryPort,
  position: SemanticDocumentPosition,
  newName: string,
): SemanticRenameQueryResult {
  const work = new CooperativeWork(port.checkpoint)
  work.boundary()
  const initialMembershipFailure = port.membershipFailure()
  if (initialMembershipFailure) return work.finish(initialMembershipFailure)
  const filePath = path.resolve(position.path)
  const script = port.querySource(filePath)
  if (!script) return work.finish({ status: "incomplete", reason: "source-unavailable" })
  if (!isIdentifierText(newName)) return work.finish({ status: "invalid-name" })
  const sourceOffset = lineColumnToOffset(script.sourceContent, position.line, position.column)
  const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
  work.boundary()
  const info = port.service.getRenameInfo(filePath, offset, { allowRenameOfImportPath: false })
  work.boundary()
  const finish = (result: SemanticRenameQueryResult): SemanticRenameQueryResult => {
    if (!port.inputsAreCurrent(() => work.boundary())) throw new SemanticInputUnavailableError()
    return work.finish(result)
  }
  const renameInfoMembershipFailure = port.membershipFailure()
  if (renameInfoMembershipFailure) return finish(renameInfoMembershipFailure)
  if (!info.canRename) return finish({ status: "unavailable" })
  work.boundary()
  const conflict = preflightRenameConflict(
    port.service,
    filePath,
    info.triggerSpan.start,
    newName,
  )
  work.boundary()
  const preflightMembershipFailure = port.membershipFailure()
  if (preflightMembershipFailure) return finish(preflightMembershipFailure)
  if (conflict === "conflict" || conflict === "indeterminate") {
    return finish({ status: "unavailable" })
  }
  work.boundary()
  const locations = port.service.findRenameLocations(filePath, offset, false, false, true) ?? []
  work.boundary()
  const locationsMembershipFailure = port.membershipFailure()
  if (locationsMembershipFailure) return finish(locationsMembershipFailure)
  if (locations.length === 0) return finish({ status: "unavailable" })
  const sourceViews = new Map<string, ReferenceSourceView>()
  const edits: Extract<SemanticRenameQueryResult, { status: "complete" }>["edits"] = []
  const seen = new Set<string>()
  for (const location of locations) {
    const targetPath = path.resolve(location.fileName)
    work.item()
    if (!within(port.rootPath, targetPath)) {
      return finish({ status: "incomplete", reason: "source-outside-workspace" })
    }
    let sourceView = sourceViews.get(targetPath)
    if (!sourceView) {
      sourceView = port.sourceView(targetPath)
      if (!sourceView) return finish({ status: "incomplete", reason: "source-unavailable" })
      sourceViews.set(targetPath, sourceView)
    }
    const range = exactSourceRange(sourceView, location.textSpan)
    if (!range) return finish({ status: "incomplete", reason: "source-unmappable" })
    const newText = `${location.prefixText ?? ""}${newName}${location.suffixText ?? ""}`
    const key = semanticLocationKey(targetPath, range)
    if (seen.has(key)) continue
    seen.add(key)
    edits.push({
      path: targetPath,
      range,
      newText,
      expectedVersion: port.querySource(targetPath)?.documentVersion ?? null,
    })
  }
  work.boundary()
  edits.sort(work.comparator(compareTextEdits))
  work.boundary()
  if (hasOverlappingEdits(edits, work)) {
    return finish({ status: "incomplete", reason: "source-unmappable" })
  }
  const finalMembershipFailure = port.membershipFailure()
  if (finalMembershipFailure) return finish(finalMembershipFailure)
  return finish({ status: "complete", edits })
}

function within(rootPath: string, filePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
