import path from "node:path"

import { createSpikeProject, diagnosticIdentity, materializeMarkedFixture } from "./backend-host.mjs"

const coreScenarios = [
  ["completion.this-member", completionThisMember],
  ["completion.imported-receiver", completionImportedReceiver],
  ["completion.auto-import", completionAutoImport],
  ["definition.unopened-utf16", definitionUnopenedUtf16],
  ["definition.struct-source-map", definitionStructSource],
  ["definition.alias-reexport", definitionAliasReexport],
  ["diagnostics.exact-code-range", diagnosticsExactCodeRange],
  ["unicode.identifier-completion", unicodeIdentifier],
]

const referenceRenameScenarios = [
  ["references.barrel-unopened", referencesBarrelUnopened],
  ["references.changed-overlay", referencesChangedOverlay],
  ["references.large-unopened-struct", referencesLargeUnopenedStruct],
  ["references.new-target-root", referencesNewTargetRoot],
  ["rename.cross-module", renameCrossModule],
  ["rename.explicit-barrel-alias", renameExplicitBarrelAlias],
  ["rename.non-bmp-prepare", renameNonBmpPrepare],
  ["rename.same-scope-conflict", renameSameScopeConflict],
]

const boundaryPolicyScenarios = [
  ["completion.sdk-hot-switch", completionSdkHotSwitch],
  ["definition.cross-module", definitionCrossModule],
  ["diagnostics.overlay-freshness", diagnosticsOverlayFreshness],
  ["diagnostics.invalid-sdk", diagnosticsInvalidSdk],
  ["incomplete.completion-result-limit", completionResultLimit],
  ["incomplete.references-membership", referencesMembership],
  ["project-boundary.declared-module", projectDeclaredModule],
  ["project-boundary.ghost-module", projectGhostModule],
  ["project-boundary.inactive-target", projectInactiveTarget],
  ["project-boundary.target-membership", projectTargetMembership],
  ["project-boundary.overlay-authority", projectOverlayAuthority],
  ["project-boundary.watcher-freshness", projectWatcherFreshness],
  ["project-boundary.catalog-identity", projectCatalogIdentity],
]

const scenarios = new Map([
  ...coreScenarios,
  ...referenceRenameScenarios,
  ...boundaryPolicyScenarios,
])

export const DIRECT_SCENARIO_IDS = new Set(scenarios.keys())
export const CORE_SEMANTIC_SCENARIO_IDS = new Set(coreScenarios.map(([id]) => id))
export const REFERENCE_RENAME_SCENARIO_IDS = new Set(
  referenceRenameScenarios.map(([id]) => id),
)
export const BOUNDARY_POLICY_SCENARIO_IDS = new Set(
  boundaryPolicyScenarios.map(([id]) => id),
)

export function runDirectScenario(compiler, contractsRoot, record) {
  const scenario = scenarios.get(record.id)
  if (!scenario) throw new Error("No direct scenario registered for " + record.id)
  const project = scenario(compiler, contractsRoot)
  try {
    const observations = project.verify()
    project.dispose()
    return {
      id: record.id,
      category: record.category,
      status: "passed",
      observations,
      stats: project.stats(),
    }
  } finally {
    project.dispose()
  }
}

function completionThisMember(compiler, root) {
  const fixture = marked(`
class Base {
  inheritedField: number = 1
  inheritedMethod(): void {}
}
class Page extends Base {
  run(): void {
    this./*@query*/
  }
}
`)
  return completionProject(compiler, root, "completion/this-member.ets", fixture, [
    ["inheritedField", "property"],
    ["inheritedMethod", "method"],
  ])
}

function completionImportedReceiver(compiler, root) {
  const fixture = marked(`
import { Greeter } from "./greeter"
const receiver = new Greeter()
receiver./*@query*/
`)
  return completionProject(
    compiler,
    root,
    "completion/imported-receiver.ets",
    fixture,
    [["message", "property"], ["greet", "method"]],
    {
      "completion/greeter.ets": `
export class Greeter {
  message: string = "hello"
  greet(): string { return this.message }
}
`,
    },
  )
}

function completionAutoImport(compiler, root) {
  const fixture = marked("const value = new Hidden/*@query*/\n")
  const project = createSpikeProject(compiler, root, {
    "completion/auto-import.ets": fixture.text,
    "completion/hidden.ets": "export class HiddenClass {}\n",
  })
  return wrap(project, () => {
    const completion = project.completions("completion/auto-import.ets", fixture.position)
    const entry = completion?.entries.find(({ name }) => name === "HiddenClass")
    assert(entry, "missing auto-import completion HiddenClass")
    assert(entry.hasAction === true, "auto-import completion has no import action")
    return {
      matchedCompletion: completionEntryIdentity(entry, root),
      replacementSpan: completion?.optionalReplacementSpan ?? null,
    }
  })
}

function definitionUnopenedUtf16(compiler, root) {
  const fixture = marked(`
import { Greeter } from "./model"
const emoji = "😀"
const value = new Greet/*@query*/er()
`)
  const model = "export class Greeter {}\n"
  return definitionProject(
    compiler,
    root,
    "definition/unopened-utf16.ets",
    fixture,
    { "definition/model.ets": model },
    "definition/model.ets",
    model.indexOf("Greeter"),
  )
}

function definitionStructSource(compiler, root) {
  const fixture = marked(`
struct Card {
  title: string = "hello"
}
const card = new Card()
const value = card./*@query*/title
`)
  return definitionProject(
    compiler,
    root,
    "definition/struct-source.ets",
    fixture,
    {},
    "definition/struct-source.ets",
    fixture.text.indexOf("title"),
  )
}

function definitionAliasReexport(compiler, root) {
  const fixture = marked(`
import { PublicThing } from "./barrel"
const value = new Public/*@query*/Thing()
`)
  const origin = "export class Original {}\n"
  return definitionProject(
    compiler,
    root,
    "definition/alias-consumer.ets",
    fixture,
    {
      "definition/origin.ets": origin,
      "definition/barrel.ets": "export { Original as PublicThing } from \"./origin\"\n",
    },
    "definition/origin.ets",
    origin.indexOf("Original"),
  )
}

function diagnosticsExactCodeRange(compiler, root) {
  const fixture = marked(`
function render(): string {
  const greeting = "Hello"
  return "😀 " + /*@query*/greting
}
`)
  const project = createSpikeProject(compiler, root, {
    "diagnostics/exact-code-range.ets": fixture.text,
  })
  return wrap(project, () => {
    const diagnostics = project.semanticDiagnostics("diagnostics/exact-code-range.ets")
      .map((diagnostic) => diagnosticIdentity(compiler, diagnostic))
    const mismatch = diagnostics.find(({ code }) => code === 2552)
    assert(mismatch, "missing TS2552 spelling diagnostic")
    assert(mismatch.start === fixture.position, "TS2552 starts at the wrong UTF-16 offset")
    assert(mismatch.length === "greting".length, "TS2552 has the wrong UTF-16 length")
    return { diagnostic: mismatch }
  })
}

function unicodeIdentifier(compiler, root) {
  const fixture = marked("const 变量 = 1\nconst value = 变/*@query*/\n")
  const project = createSpikeProject(compiler, root, {
    "unicode/identifier.ets": fixture.text,
  })
  return wrap(project, () => {
    const completion = project.completions("unicode/identifier.ets", fixture.position)
    const entry = completion?.entries.find(({ name }) => name === "变量")
    assert(entry, "missing Unicode identifier completion")
    const span = completion.optionalReplacementSpan
    assert(span?.start === fixture.position - 1, "Unicode replacement starts at the wrong offset")
    assert(span.length === 1, "Unicode replacement has the wrong UTF-16 length")
    return {
      matchedCompletion: completionEntryIdentity(entry, root),
      replacementSpan: span,
    }
  })
}

function referencesBarrelUnopened(compiler, root) {
  const origin = marked("export const /*@query*/target = 1\n")
  const project = createSpikeProject(compiler, root, {
    "references/origin.ets": origin.text,
    "references/barrel.ets": "export { target } from \"./origin\"\n",
    "references/consumer.ets": "import { target } from \"./barrel\"\nconsole.log(target)\n",
  })
  return wrap(project, () => {
    const references = referenceIdentities(
      project.references("references/origin.ets", origin.position),
      root,
    )
    assertPathSet(references, [
      "references/origin.ets",
      "references/barrel.ets",
      "references/consumer.ets",
    ])
    return { references }
  })
}

function referencesChangedOverlay(compiler, root) {
  const initial = marked(`
function /*@query*/target(): void {}
target()
target()
`)
  const changed = `
function target(): void {}
const emoji = "😀"
target()
`.trimStart()
  const mainPath = "references/changed-overlay.ets"
  const project = createSpikeProject(compiler, root, { [mainPath]: initial.text })
  return wrap(project, () => {
    const before = referenceIdentities(project.references(mainPath, initial.position), root)
    assert(before.length === 3, "initial overlay should contain three target references")
    project.update(mainPath, changed)
    const after = referenceIdentities(project.references(mainPath, changed.indexOf("target")), root)
    assert(after.length === 2, "changed overlay should replace stale target references")
    assert(
      after.every(({ start }) => start < changed.length),
      "changed overlay returned a stale out-of-range reference",
    )
    return { beforeCount: before.length, after }
  })
}

function referencesLargeUnopenedStruct(compiler, root) {
  const declaration = marked("struct /*@query*/Card { value: number = 1 }\n")
  const files = { "references/large/model.ets": declaration.text }
  for (let index = 0; index < 80; index += 1) {
    files[`references/large/consumer-${String(index).padStart(3, "0")}.ets`]
      = `const card${index} = new Card()\n`
  }
  const project = createSpikeProject(compiler, root, files)
  return wrap(project, () => {
    const references = referenceIdentities(
      project.references("references/large/model.ets", declaration.position),
      root,
    )
    assert(references.length === 81, "large unopened reference set is incomplete")
    assert(
      references.some(({ relativePath }) => relativePath.endsWith("consumer-079.ets")),
      "last unopened consumer is missing",
    )
    return { referenceCount: references.length, lastReference: references.at(-1) }
  })
}

function referencesNewTargetRoot(compiler, root) {
  const declaration = marked("class /*@query*/TargetService {}\n")
  const modelPath = "references/new-target/model.ets"
  const project = createSpikeProject(compiler, root, { [modelPath]: declaration.text })
  return wrap(project, () => {
    const before = referenceIdentities(project.references(modelPath, declaration.position), root)
    project.update(
      "references/new-target/materialized/consumer.ets",
      "const service = new TargetService()\n",
    )
    const after = referenceIdentities(project.references(modelPath, declaration.position), root)
    assert(after.length === before.length + 1, "new target root did not refresh references")
    assertPathSet(after, ["references/new-target/materialized/consumer.ets"])
    return { beforeCount: before.length, afterCount: after.length }
  })
}

function renameCrossModule(compiler, root) {
  const barrel = marked("export { Thing as /*@query*/PublicThing } from \"./origin\"\n")
  const project = createSpikeProject(compiler, root, {
    "rename/origin.ets": "export class Thing {}\n",
    "rename/barrel.ets": barrel.text,
    "rename/consumer-a.ets": "import { PublicThing } from \"./barrel\"\nnew PublicThing()\n",
    "rename/consumer-b.ets": "import { PublicThing } from \"./barrel\"\nnew PublicThing()\n",
  })
  return wrap(project, () => {
    const locations = renameIdentities(
      project.renameLocations("rename/barrel.ets", barrel.position),
      root,
    )
    assertPathSet(locations, [
      "rename/barrel.ets",
      "rename/consumer-a.ets",
      "rename/consumer-b.ets",
    ])
    assert(
      locations.every(({ relativePath }) => relativePath !== "rename/origin.ets"),
      "public rename changed the origin identity",
    )
    return { locations }
  })
}

function renameExplicitBarrelAlias(compiler, root) {
  const barrel = marked("export { Original as Public/*@query*/Alias } from \"./alias-origin\"\n")
  const project = createSpikeProject(compiler, root, {
    "rename/alias-origin.ets": "export class Original {}\n",
    "rename/alias-barrel.ets": barrel.text,
    "rename/alias-consumer.ets": "import { PublicAlias } from \"./alias-barrel\"\nnew PublicAlias()\n",
  })
  return wrap(project, () => {
    const locations = renameIdentities(
      project.renameLocations("rename/alias-barrel.ets", barrel.position),
      root,
    )
    assertPathSet(locations, ["rename/alias-barrel.ets", "rename/alias-consumer.ets"])
    assert(
      locations.every(({ relativePath }) => relativePath !== "rename/alias-origin.ets"),
      "explicit alias rename reached the origin declaration",
    )
    return { locations }
  })
}

function renameNonBmpPrepare(compiler, root) {
  const fixture = marked(`
import { Thing as Alias } from "./prepare-origin"
const emoji = "😀"
const value = new Al/*@query*/ias()
`)
  const mainPath = "rename/non-bmp-prepare.ets"
  const project = createSpikeProject(compiler, root, {
    [mainPath]: fixture.text,
    "rename/prepare-origin.ets": "export class Thing {}\n",
  })
  return wrap(project, () => {
    const info = project.renameInfo(mainPath, fixture.position)
    assert(info.canRename === true, "prepare rename rejected the source alias")
    const aliasStart = fixture.text.lastIndexOf("Alias")
    assert(info.triggerSpan.start === aliasStart, "prepare rename starts at the wrong UTF-16 offset")
    assert(info.triggerSpan.length === "Alias".length, "prepare rename has the wrong length")
    return {
      displayName: info.displayName,
      kind: info.kind,
      triggerSpan: info.triggerSpan,
    }
  })
}

function renameSameScopeConflict(compiler, root) {
  const fixture = marked(`
const existing = 1
const /*@query*/target = 2
console.log(target)
`)
  const mainPath = "rename/same-scope-conflict.ets"
  const project = createSpikeProject(compiler, root, { [mainPath]: fixture.text })
  return wrap(project, () => {
    const locations = project.renameLocations(mainPath, fixture.position)
    assert(locations.length === 2, "rename did not find both target locations")
    const renamed = applyRename(fixture.text, locations, project.fileName(mainPath), "existing")
    const validation = createSpikeProject(compiler, root, { [mainPath]: renamed })
    try {
      const diagnostics = validation.semanticDiagnostics(mainPath)
        .map((diagnostic) => diagnosticIdentity(compiler, diagnostic))
      const conflicts = diagnostics.filter(({ code }) => code === 2451)
      assert(conflicts.length >= 2, "backend did not expose the same-scope rename conflict")
      return {
        candidateCount: locations.length,
        conflictCodes: conflicts.map(({ code }) => code),
      }
    } finally {
      validation.dispose()
    }
  })
}

function completionSdkHotSwitch(compiler, root) {
  const fixture = marked("const overlayValue = 1\nconst value = new Sdk/*@query*/\n")
  const mainPath = "boundary/sdk-hot-switch.ets"
  const first = createSpikeProject(compiler, root, {
    [mainPath]: fixture.text,
    "boundary/sdk-a.d.ts": "declare class SdkAlpha { alpha: string }\n",
  })
  const second = createSpikeProject(compiler, root, {
    [mainPath]: fixture.text,
    "boundary/sdk-b.d.ts": "declare class SdkBeta { beta: string }\n",
  })
  return wrapProjects([first, second], () => {
    const before = completionNameSet(first, mainPath, fixture.position)
    const after = completionNameSet(second, mainPath, fixture.position)
    assert(before.has("SdkAlpha"), "first SDK completion is missing")
    assert(!before.has("SdkBeta"), "first context leaked the second SDK")
    assert(after.has("SdkBeta"), "hot-switched SDK completion is missing")
    assert(!after.has("SdkAlpha"), "second context retained the old SDK")
    assert(second.sourceFile(mainPath).text.includes("overlayValue"), "open overlay was not restored")
    return {
      before: ["SdkAlpha"],
      after: ["SdkBeta"],
      overlayRestored: true,
      owner: "DocumentAuthority + SemanticCoordinator",
    }
  })
}

function definitionCrossModule(compiler, rootnth) {
  const fixture = marked(`
import { RemoteService } from "../feature/service"
const service = new Remote/*@query*/Service()
`)
  const declaration = "export class RemoteService {}\n"
  return definitionProject(
    compiler,
    rootnth,
    "boundary/entry/main.ets",
    fixture,
    { "boundary/feature/service.ets": declaration },
    "boundary/feature/service.ets",
    declaration.indexOf("RemoteService"),
  )
}

function diagnosticsOverlayFreshness(compiler, root) {
  const initial = "const greeting = \"hello\"\nconsole.log(greting)\n"
  const changed = "const greeting = \"hello\"\nconsole.log(greeting)\n"
  const mainPath = "boundary/diagnostic-overlay.ets"
  const project = createSpikeProject(compiler, root, { [mainPath]: initial })
  return wrap(project, () => {
    const before = project.semanticDiagnostics(mainPath)
      .map((diagnostic) => diagnosticIdentity(compiler, diagnostic))
    assert(before.some(({ code }) => code === 2552), "initial diagnostic is missing")
    project.update(mainPath, changed)
    const after = project.semanticDiagnostics(mainPath)
      .map((diagnostic) => diagnosticIdentity(compiler, diagnostic))
    assert(!after.some(({ code }) => code === 2552), "obsolete diagnostic survived the overlay")
    return { beforeCodes: before.map(({ code }) => code), afterCodes: after.map(({ code }) => code) }
  })
}

function diagnosticsInvalidSdk(compiler, root) {
  const mainPath = "boundary/invalid-sdk.ets"
  const project = createSpikeProject(compiler, root, {
    [mainPath]: "import { MissingSdkType } from \"@ohos.this_sdk_does_not_exist\"\nnew MissingSdkType()\n",
  })
  return wrap(project, () => {
    const diagnostics = project.semanticDiagnostics(mainPath)
      .map((diagnostic) => diagnosticIdentity(compiler, diagnostic))
    assert(diagnostics.some(({ code }) => code === 2307), "invalid SDK silently resolved a module")
    return {
      backendCodes: diagnostics.map(({ code }) => code),
      configurationOutcome: "arkts.sdk.configuration",
      owner: "ProjectGraph",
    }
  })
}

function completionResultLimit(compiler, root) {
  const members = Array.from({ length: 129 }, (_, index) => (
    `  member${String(index).padStart(3, "0")}: number = ${index}`
  )).join("\n")
  const fixture = marked(`
class Wide {
${members}
  query(): void { this./*@query*/ }
}
`)
  const mainPath = "boundary/completion-result-limit.ets"
  const project = createSpikeProject(compiler, root, { [mainPath]: fixture.text })
  return wrap(project, () => {
    const raw = project.completions(mainPath, fixture.position)?.entries
      .filter(({ name }) => name.startsWith("member")) ?? []
    assert(raw.length === 129, "backend did not expose the complete member set")
    const bounded = raw.slice(0, 128)
    assert(bounded.length === 128, "completion policy returned the wrong bound")
    return {
      backendEntryCount: raw.length,
      responseEntryCount: bounded.length,
      isIncomplete: raw.length > bounded.length,
      owner: "LSP completion policy",
    }
  })
}

function referencesMembership(compiler, root) {
  const declaration = marked("function /*@query*/shared(): void {}\n")
  const mainPath = "boundary/membership/model.ets"
  const partial = createSpikeProject(compiler, root, {
    [mainPath]: declaration.text,
    "boundary/membership/a.ets": "shared()\n",
  })
  const complete = createSpikeProject(compiler, root, {
    [mainPath]: declaration.text,
    "boundary/membership/a.ets": "shared()\n",
    "boundary/membership/b.ets": "shared()\n",
  })
  return wrapProjects([partial, complete], () => {
    const partialEntries = partial.references(mainPath, declaration.position)
    const completeEntries = complete.references(mainPath, declaration.position)
    assert(partialEntries.length < completeEntries.length, "partial membership was not observable")
    return {
      partialBackendCount: partialEntries.length,
      completeBackendCount: completeEntries.length,
      partialPolicyOutcome: "unavailable",
      owner: "ProjectGraph + SemanticCoordinator",
    }
  })
}

function projectDeclaredModule(compiler, root) {
  const fixture = marked(`
import { DeclaredService } from "../declared/service"
const service = new Declared/*@query*/Service()
`)
  const declaration = "export class DeclaredService { ready: boolean = true }\n"
  return definitionProject(
    compiler,
    root,
    "boundary/app/main.ets",
    fixture,
    { "boundary/declared/service.ets": declaration },
    "boundary/declared/service.ets",
    declaration.indexOf("DeclaredService"),
  )
}

function projectGhostModule(compiler, root) {
  const fixture = marked("const value = new /*@query*/\n")
  const mainPath = "boundary/ghost/main.ets"
  const project = createSpikeProject(compiler, root, {
    [mainPath]: fixture.text,
    "boundary/ghost/active.d.ts": "declare class ActiveOnly {}\n",
  })
  return wrap(project, () => {
    const names = completionNameSet(project, mainPath, fixture.position)
    assert(names.has("ActiveOnly"), "declared active module is missing")
    assert(!names.has("GhostOnly"), "excluded ghost module leaked into completion")
    return { activeVisible: true, ghostVisible: false, owner: "ProjectGraph file set" }
  })
}

function projectInactiveTarget(compiler, root) {
  const fixture = marked("const value = new Target/*@query*/\n")
  const mainPath = "boundary/target/main.ets"
  const project = createSpikeProject(compiler, root, {
    [mainPath]: fixture.text,
    "boundary/target/active.d.ts": "declare class TargetActive {}\n",
  })
  return wrap(project, () => {
    const names = completionNameSet(project, mainPath, fixture.position)
    assert(names.has("TargetActive"), "active target global is missing")
    assert(!names.has("TargetInactive"), "inactive target global leaked into completion")
    return { active: ["TargetActive"], excluded: ["TargetInactive"], owner: "ProjectGraph" }
  })
}

function projectTargetMembership(compiler, root) {
  const fixture = marked("const value = new Target/*@query*/\n")
  const mainPath = "boundary/target-switch/main.ets"
  const warm = createSpikeProject(compiler, root, {
    [mainPath]: fixture.text,
    "boundary/target-switch/old.d.ts": "declare class TargetOld {}\n",
  })
  return wrap(warm, () => {
    completionNameSet(warm, mainPath, fixture.position)
    warm.remove("boundary/target-switch/old.d.ts")
    warm.update("boundary/target-switch/new.d.ts", "declare class TargetNew {}\n")
    const refreshed = completionNameSet(warm, mainPath, fixture.position)
    const fresh = createSpikeProject(compiler, root, {
      [mainPath]: fixture.text,
      "boundary/target-switch/new.d.ts": "declare class TargetNew {}\n",
    })
    try {
      const freshNames = completionNameSet(fresh, mainPath, fixture.position)
      assert(refreshed.has("TargetNew") && !refreshed.has("TargetOld"), "warm target did not switch")
      assert(freshNames.has("TargetNew") && !freshNames.has("TargetOld"), "fresh target is incorrect")
      return { warm: ["TargetNew"], fresh: ["TargetNew"], equal: true }
    } finally {
      fresh.dispose()
    }
  })
}

function projectOverlayAuthority(compiler, root) {
  const mainPath = "boundary/overlay/main.ets"
  const modelPath = "boundary/overlay/model.ets"
  const diskMain = "import { DiskValue } from \"./model\"\nnew DiskValue()\n"
  const overlayMain = "import { OverlayValue } from \"./model\"\nnew OverlayValue()\n"
  const project = createSpikeProject(compiler, root, {
    [mainPath]: diskMain,
    [modelPath]: "export class DiskValue {}\n",
  })
  return wrap(project, () => {
    project.update(modelPath, "export class OverlayValue {}\n")
    project.update(mainPath, overlayMain)
    const overlayPosition = overlayMain.lastIndexOf("OverlayValue")
    const overlayDefinitions = project.definitions(mainPath, overlayPosition)
    assert(overlayDefinitions[0]?.name === "OverlayValue", "overlay did not own definition truth")
    project.update(modelPath, "export class DiskValue {}\n")
    project.update(mainPath, diskMain)
    const diskDefinitions = project.definitions(mainPath, diskMain.lastIndexOf("DiskValue"))
    assert(diskDefinitions[0]?.name === "DiskValue", "restored disk truth is unavailable")
    return { openDefinition: "OverlayValue", closedDefinition: "DiskValue" }
  })
}

function projectWatcherFreshness(compiler, root) {
  const mainPath = "boundary/watcher/main.ets"
  const watchedPath = "boundary/watcher/watched.ets"
  const beforeName = "FreshnessBeforeUnique"
  const afterName = "FreshnessAfterUnique"
  const beforeMain = `import { ${beforeName} } from "./watched"\nnew ${beforeName}()\n`
  const afterMain = `import { ${afterName} } from "./watched"\nnew ${afterName}()\n`
  const project = createSpikeProject(compiler, root, {
    [mainPath]: beforeMain,
    [watchedPath]: `export class ${beforeName} {}\n`,
  })
  return wrap(project, () => {
    assert(project.definitions(mainPath, beforeMain.lastIndexOf(beforeName)).length > 0, "create is invisible")
    project.update(watchedPath, `export class ${afterName} {}\n`)
    project.update(mainPath, afterMain)
    assert(project.definitions(mainPath, afterMain.lastIndexOf(afterName)).length > 0, "change is invisible")
    project.remove(watchedPath)
    const afterDelete = project.definitions(mainPath, afterMain.lastIndexOf(afterName))
    assert(
      afterDelete.every(({ fileName }) => path.resolve(fileName) !== project.fileName(watchedPath)),
      "deleted target remains visible",
    )
    const diagnostics = project.semanticDiagnostics(mainPath)
      .map((diagnostic) => diagnosticIdentity(compiler, diagnostic))
    assert(diagnostics.some(({ code }) => code === 2307), "deleted import has no diagnostic")
    return {
      createVisible: true,
      changeVisible: true,
      deletedTargetVisible: false,
      remainingLocalAliasDefinitions: afterDelete.length,
      diagnosticCodes: diagnostics.map(({ code }) => code),
    }
  })
}

function projectCatalogIdentity(compiler, root) {
  const main = marked("const value: Catalog/*@query*/Value = {} as CatalogValue\n")
  const mainPath = "boundary/catalog/main.ets"
  const declarationPath = "boundary/catalog/declaration.d.ts"
  const project = createSpikeProject(compiler, root, {
    [mainPath]: main.text,
    [declarationPath]: "declare class CatalogValue {}\n",
  })
  return wrap(project, () => {
    const before = project.definitions(mainPath, main.position)[0]
    assert(before?.kind === "class", "initial catalog identity is incorrect")
    project.update(declarationPath, "interface CatalogValue {}\n")
    const after = project.definitions(mainPath, main.position)[0]
    assert(after?.kind === "interface", "changed catalog identity reused stale semantics")
    return { beforeKind: before.kind, afterKind: after.kind, owner: "ProjectGraph catalog revision" }
  })
}

function completionProject(compiler, root, mainPath, fixture, expected, otherFiles = {}) {
  const project = createSpikeProject(compiler, root, { [mainPath]: fixture.text, ...otherFiles })
  return wrap(project, () => {
    const completion = project.completions(mainPath, fixture.position)
    assert(completion, "completion provider returned no result")
    const matched = expected.map(([name, kind]) => {
      const entry = completion.entries.find((candidate) => candidate.name === name)
      assert(entry, "missing completion " + name)
      assert(entry.kind === kind, "completion " + name + " has kind " + entry.kind)
      return completionEntryIdentity(entry, root)
    })
    return {
      matchedCompletions: matched,
      replacementSpan: completion.optionalReplacementSpan ?? null,
    }
  })
}

function definitionProject(compiler, root, mainPath, fixture, otherFiles, expectedPath, expectedStart) {
  const project = createSpikeProject(compiler, root, { [mainPath]: fixture.text, ...otherFiles })
  return wrap(project, () => {
    const definitions = project.definitions(mainPath, fixture.position)
    const expectedFile = project.fileName(expectedPath)
    const definition = definitions.find(({ fileName, textSpan }) => (
      path.resolve(fileName) === expectedFile && textSpan.start === expectedStart
    ))
    assert(definition, "definition did not resolve to " + expectedPath + ":" + expectedStart)
    return {
      definition: {
        relativePath: expectedPath,
        start: definition.textSpan.start,
        length: definition.textSpan.length,
        kind: definition.kind,
        name: definition.name,
      },
    }
  })
}

function wrap(project, verify) {
  return {
    verify,
    stats: () => project.stats(),
    dispose: () => project.dispose(),
  }
}

function wrapProjects(projects, verify) {
  return {
    verify,
    stats: () => ({
      projectFileCount: projects.reduce((sum, project) => sum + project.stats().projectFileCount, 0),
      snapshotReadCount: projects.reduce((sum, project) => sum + project.stats().snapshotReadCount, 0),
      uniqueSnapshotReadCount: projects.reduce(
        (sum, project) => sum + project.stats().uniqueSnapshotReadCount,
        0,
      ),
      disposed: projects.every((project) => project.stats().disposed),
    }),
    dispose: () => {
      for (const project of projects) project.dispose()
    },
  }
}

function completionNameSet(project, relativePath, position) {
  return new Set(project.completions(relativePath, position)?.entries.map(({ name }) => name) ?? [])
}

function marked(text) {
  return materializeMarkedFixture(text.trimStart())
}

function completionEntryIdentity(entry, root) {
  return {
    name: entry.name,
    kind: entry.kind,
    kindModifiers: entry.kindModifiers,
    sortText: entry.sortText,
    hasAction: entry.hasAction === true,
    source: portableSource(entry.source, root),
  }
}

function portableSource(source, root) {
  if (source === undefined) return null
  return path.isAbsolute(source)
    ? path.relative(root, source).split(path.sep).join("/")
    : source
}

function referenceIdentities(entries, root) {
  return entries.map((entry) => ({
    relativePath: portablePath(entry.fileName, root),
    start: entry.textSpan.start,
    length: entry.textSpan.length,
    isDefinition: entry.isDefinition === true,
    isWriteAccess: entry.isWriteAccess === true,
  })).sort(compareLocation)
}

function renameIdentities(entries, root) {
  return entries.map((entry) => ({
    relativePath: portablePath(entry.fileName, root),
    start: entry.textSpan.start,
    length: entry.textSpan.length,
    prefixText: entry.prefixText ?? null,
    suffixText: entry.suffixText ?? null,
  })).sort(compareLocation)
}

function portablePath(fileName, root) {
  return path.relative(root, fileName).split(path.sep).join("/")
}

function compareLocation(left, right) {
  return left.relativePath.localeCompare(right.relativePath) || left.start - right.start
}

function assertPathSet(locations, expectedPaths) {
  const actual = new Set(locations.map(({ relativePath }) => relativePath))
  for (const expectedPath of expectedPaths) {
    assert(actual.has(expectedPath), "missing semantic location in " + expectedPath)
  }
}

function applyRename(text, locations, fileName, newName) {
  const spans = locations
    .filter((location) => path.resolve(location.fileName) === fileName)
    .map(({ textSpan }) => textSpan)
    .sort((left, right) => right.start - left.start)
  return spans.reduce((current, span) => (
    current.slice(0, span.start) + newName + current.slice(span.start + span.length)
  ), text)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
