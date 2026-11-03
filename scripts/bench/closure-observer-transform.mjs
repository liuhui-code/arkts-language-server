import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const ts = require("typescript")

/** Diagnostic-only insertions around real call bodies; the installed artifact is never written. */
export function instrumentClosureWorker(source, observerFile, { io = false } = {}) {
  const tree = ts.createSourceFile("semantic-worker.cjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits = [], counts = new Map()
  const audit = "globalThis.__arktsClosureObservation"
  const wrap = (body, expression, key) => {
    counts.set(key, (counts.get(key) ?? 0) + 1)
    edits.push([body.getStart(tree) + 1, `return ${audit}.${expression}() => {`], [body.end - 1, "});"])
  }
  const namedParent = (node, name) => {
    for (let parent = node.parent; parent; parent = parent.parent) if (parent.name?.text === name) return true
    return false
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.body) {
      const name = node.name?.text
      const calls = {
        runWorkerCommand: 'command(command, ',
        observeCompilerPhase: 'phase(phase, ',
        createProgram: 'program(rootNamesOrOptions, ',
        createOfficialSemanticService: 'owner(host, sdk, ',
        prepareContextEntry: 'prepare(workspace, contextId, ',
        relativeModuleBoundary: 'scope("source-boundary", ',
        lookupIdentity: 'scope("load-guard", ',
        requestConfigurationIdentity: 'scope("validation", ',
        requestFileIdentity: 'scope("validation", ',
      }
      if (!io) for (const key of ["relativeModuleBoundary", "lookupIdentity", "requestConfigurationIdentity", "requestFileIdentity"]) delete calls[key]
      if (Object.hasOwn(calls, name)) wrap(node.body, calls[name], name)
    }
    if (ts.isVariableDeclaration(node) && node.name?.text === "buildProgram"
      && ts.isArrowFunction(node.initializer) && namedParent(node, "sdkExportIndex")) {
      wrap(node.initializer.body, 'role("sdk-export", ', "sdk-export")
    }
    if (io && ts.isMethodDeclaration(node) && node.name?.text === "installedSourcePath") {
      wrap(node.body, 'installed(candidate, ', "installed-source")
    }
    if (io && ts.isMethodDeclaration(node) && node.name?.text === "relativeCandidate" && namedParent(node, "QueryModuleResolution")) {
      wrap(node.body, 'candidate(this.active?.candidates.has(base) === true, ', "candidate")
    }
    // Only the existing post-query validation call gets this label. No extra validation is added.
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "input.validate"
      && namedParent(node, "withRequestInputValidation")) {
      counts.set("final-fence", (counts.get("final-fence") ?? 0) + 1)
      edits.push([node.getStart(tree), `${audit}.phase("final-fence", () => `], [node.end, ")"])
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  for (const key of ["runWorkerCommand", "observeCompilerPhase", "createProgram", "createOfficialSemanticService",
    "prepareContextEntry", "sdk-export", "final-fence",
    ...io ? ["relativeModuleBoundary", "lookupIdentity", "requestConfigurationIdentity", "requestFileIdentity", "installed-source", "candidate"] : []]) {
    if (counts.get(key) !== 1) throw Error(`CLOSURE_OBSERVER_SIGNATURE:${key}:${counts.get(key) ?? 0}`)
  }
  // Insertion only, so nested compiler bodies, this, arguments, returns and exceptions stay original.
  let result = source
  for (const [offset, text] of edits.sort((a, b) => b[0] - a[0])) result = result.slice(0, offset) + text + result.slice(offset)
  const directive = result.startsWith('"use strict";') ? '"use strict";' : ""
  return `${directive}\nrequire(${JSON.stringify(path.resolve(observerFile))});\n${result.slice(directive.length)}`
}

export function writeObservedWorker(input, output, observerFile, options = {}) {
  const source = fs.readFileSync(input, "utf8")
  const observed = instrumentClosureWorker(source, observerFile, options)
  new vm.Script(observed, { filename: "closure-observed-worker.cjs" })
  fs.writeFileSync(output, observed, { flag: "wx" })
}
