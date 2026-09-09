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

const scenarios = new Map([...coreScenarios, ...referenceRenameScenarios])

export const DIRECT_SCENARIO_IDS = new Set(scenarios.keys())
export const CORE_SEMANTIC_SCENARIO_IDS = new Set(coreScenarios.map(([id]) => id))
export const REFERENCE_RENAME_SCENARIO_IDS = new Set(
  referenceRenameScenarios.map(([id]) => id),
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
