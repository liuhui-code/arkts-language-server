import path from "node:path"

import { createSpikeProject, diagnosticIdentity, materializeMarkedFixture } from "./backend-host.mjs"

const scenarios = new Map([
  ["completion.this-member", completionThisMember],
  ["completion.imported-receiver", completionImportedReceiver],
  ["completion.auto-import", completionAutoImport],
  ["definition.unopened-utf16", definitionUnopenedUtf16],
  ["definition.struct-source-map", definitionStructSource],
  ["definition.alias-reexport", definitionAliasReexport],
  ["diagnostics.exact-code-range", diagnosticsExactCodeRange],
  ["unicode.identifier-completion", unicodeIdentifier],
])

export const DIRECT_SCENARIO_IDS = new Set(scenarios.keys())

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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
