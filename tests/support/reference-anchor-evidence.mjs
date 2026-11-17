import assert from "node:assert/strict"

export function assertAnchorSelection(events, { unclassifiedOccurrence, localSeed, editDiskDependency, moveDiskDeclaration }) {
  if (editDiskDependency || moveDiskDeclaration) {
    assert.ok(events.some(event => event.event === "references.index.fallback"
      && event.reason === "workspace-changed"), "stale declaration identity must not certify indexed coverage")
    const fallback = events.findLastIndex(event => event.event === "references.index.fallback")
    assert.ok(!events.slice(fallback).some(event => event.event === "references.index.accepted"))
    assert.ok(!events.slice(fallback).some(event => event.event === "references.anchor.complete"),
      "known scope mismatch bypasses anchor reuse and verifies full membership directly")
    assert.ok(events.some(event => event.event === "references.plan.complete"
      && event.candidateFiles === event.membershipFiles), "fallback must retain full membership")
  } else if (unclassifiedOccurrence) {
    assert.notEqual(events.find(event => event.event === "references.index.accepted")?.anchorMode,
      "indexed-local-export-seed")
  } else {
    assert.equal(events.find(event => event.event === "references.index.accepted")?.anchorMode,
      localSeed ? "indexed-local-export-seed" : "compiler-definition-identity")
  }
}
