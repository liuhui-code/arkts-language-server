import path from "node:path"

import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type {
  HarmonySemanticGraph,
  HarmonySemanticUnit,
} from "../../project/harmony-project-model.js"

export interface ReferenceBatch {
  readonly index: number
  readonly rootPaths: readonly string[]
  readonly candidateRoots: number
  readonly semanticUnits: number
  readonly admittedProjectPaths?: readonly string[]
}

export interface ReferenceSearchPlan {
  readonly membershipFiles: number
  readonly candidateFiles: number
  readonly candidateMode: "conservative" | "indexed"
  readonly semanticUnitMode: "conservative" | "project-graph"
  readonly semanticUnits: number
  readonly batches: readonly ReferenceBatch[]
}

export function planConservativeReferenceBatches(
  workspace: SemanticWorkspaceView,
  batchRootLimit: number,
  candidatePaths?: readonly string[],
  semanticGraph?: HarmonySemanticGraph,
): ReferenceSearchPlan | undefined {
  const membership = workspace.projectMembership
  if (!membership || membership.status !== "complete") return undefined

  const pinned = new Set<string>([path.resolve(workspace.state.path)])
  for (const document of workspace.documents) {
    if (document.overlay) pinned.add(path.resolve(document.path))
  }
  const indexedCandidates = candidatePaths
    ? new Set(candidatePaths.map(filePath => path.resolve(filePath)))
    : undefined
  const candidates = membership.paths
    .map(filePath => path.resolve(filePath))
    .filter(filePath => !indexedCandidates || indexedCandidates.has(filePath))
    .filter(filePath => !pinned.has(filePath))
    .sort(ordinalCompare)
  const semanticGroups = indexedCandidates && semanticGraph?.status === "ready"
    && semanticGraph.complete
    ? groupCandidatesBySemanticUnit(candidates, pinned, membership.paths, semanticGraph)
    : undefined
  const chunks = semanticGroups
    ? packSemanticUnits(semanticGroups.units, batchRootLimit, semanticGroups.context)
    : chunkCandidates(candidates, batchRootLimit)
  const batches = chunks.map((chunk, index): ReferenceBatch => ({
    index,
    rootPaths: [...pinned, ...chunk.paths],
    candidateRoots: chunk.paths.length,
    semanticUnits: chunk.semanticUnits,
    ...(chunk.admittedProjectPaths
      ? { admittedProjectPaths: chunk.admittedProjectPaths }
      : {}),
  }))
  if (batches.length === 0) batches.push({
    index: 0,
    rootPaths: [...pinned],
    candidateRoots: 0,
    semanticUnits: 0,
  })
  return {
    membershipFiles: membership.paths.length,
    candidateFiles: new Set([...pinned, ...candidates]).size,
    candidateMode: indexedCandidates ? "indexed" : "conservative",
    semanticUnitMode: semanticGroups ? "project-graph" : "conservative",
    semanticUnits: semanticGroups ? semanticGraph!.units.length : 0,
    batches,
  }
}

interface CandidateChunk {
  readonly paths: readonly string[]
  readonly semanticUnits: number
  readonly unitNames?: readonly string[]
  readonly admittedProjectPaths?: readonly string[]
}

interface SemanticUnitPlanningContext {
  readonly graph: HarmonySemanticGraph
  readonly membershipPaths: readonly string[]
  readonly pinnedUnitNames: readonly string[]
}

function groupCandidatesBySemanticUnit(
  candidates: readonly string[],
  pinned: ReadonlySet<string>,
  membershipPaths: readonly string[],
  graph: HarmonySemanticGraph,
): { readonly units: readonly CandidateChunk[]; readonly context: SemanticUnitPlanningContext }
  | undefined {
  const grouped = new Map<string, string[]>()
  for (const candidate of candidates) {
    const unit = semanticUnitForPath(graph, candidate)
    if (!unit) return undefined
    const key = unit.identity.module
    const paths = grouped.get(key) ?? []
    paths.push(candidate)
    grouped.set(key, paths)
  }
  const pinnedUnitNames = new Set<string>()
  for (const pinnedPath of pinned) {
    const unit = semanticUnitForPath(graph, pinnedPath)
    if (!unit) return undefined
    pinnedUnitNames.add(unit.identity.module)
  }
  const units = [...grouped]
    .sort(([left], [right]) => ordinalCompare(left, right))
    .map(([unitName, paths]) => ({ paths, semanticUnits: 1, unitNames: [unitName] }))
  return {
    units,
    context: {
      graph,
      membershipPaths: membershipPaths.map(filePath => path.resolve(filePath)),
      pinnedUnitNames: [...pinnedUnitNames].sort(ordinalCompare),
    },
  }
}

function packSemanticUnits(
  units: readonly CandidateChunk[],
  batchRootLimit: number,
  context: SemanticUnitPlanningContext,
): readonly CandidateChunk[] {
  const batches: CandidateChunk[] = []
  let paths: string[] = []
  let unitNames: string[] = []
  let semanticUnits = 0
  const flush = () => {
    if (paths.length === 0) return
    batches.push({
      paths,
      semanticUnits,
      admittedProjectPaths: admittedDependencyClosurePaths(
        [...context.pinnedUnitNames, ...unitNames],
        context,
      ),
    })
    paths = []
    unitNames = []
    semanticUnits = 0
  }
  for (const unit of units) {
    if (paths.length > 0 && paths.length + unit.paths.length > batchRootLimit) flush()
    paths.push(...unit.paths)
    unitNames.push(...unit.unitNames ?? [])
    semanticUnits += 1
    if (paths.length >= batchRootLimit) flush()
  }
  flush()
  return batches
}

function admittedDependencyClosurePaths(
  seedUnitNames: readonly string[],
  context: SemanticUnitPlanningContext,
): readonly string[] {
  const byName = new Map(context.graph.units.map(unit => [unit.identity.module, unit]))
  const admittedUnits = new Set<string>()
  const pending = [...seedUnitNames]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (admittedUnits.has(name)) continue
    const unit = byName.get(name)
    if (!unit) continue
    admittedUnits.add(name)
    for (const dependency of unit.dependencies) pending.push(dependency.module)
  }
  const roots = [...admittedUnits].map(name => byName.get(name)!.moduleRoot)
  return context.membershipPaths.filter(filePath => roots.some(root => inside(root, filePath)))
}

function semanticUnitForPath(
  graph: HarmonySemanticGraph,
  filePath: string,
): HarmonySemanticUnit | undefined {
  let owner: HarmonySemanticUnit | undefined
  for (const unit of graph.units) {
    if (inside(unit.moduleRoot, filePath)
      && (!owner || unit.moduleRoot.length > owner.moduleRoot.length)) owner = unit
  }
  return owner
}

function chunkCandidates(
  candidates: readonly string[],
  batchRootLimit: number,
): readonly CandidateChunk[] {
  const batches: CandidateChunk[] = []
  for (let offset = 0; offset < candidates.length; offset += batchRootLimit) {
    batches.push({ paths: candidates.slice(offset, offset + batchRootLimit), semanticUnits: 0 })
  }
  return batches
}

function inside(rootPath: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidate))
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".."
    && !relative.startsWith(`..${path.sep}`))
}

function ordinalCompare(left: string, right: string): number {
  return left.localeCompare(right)
}
