import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

/** Add call/return observation only; never edit the installed compiler or its algorithms. */
export function compilerObservationPlugin(compilerFile, { writeMetadata = true } = {}) {
  return {
    name: "fixed-compiler-call-observation",
    setup(build) {
      build.onLoad({ filter: /[\\/]lib[\\/]typescript\.js$/ }, async args => {
        if (path.resolve(args.path) !== path.resolve(compilerFile)) return
        const original = await fs.readFile(args.path, "utf8")
        const contents = compilerObservedSource(original)
        if (writeMetadata) {
          await fs.mkdir("dist", { recursive: true })
          await fs.writeFile("dist/arkts-compiler-observation.json", JSON.stringify({
          schema: 1, inputSha256: createHash("sha256").update(original).digest("hex"),
          transformedSha256: createHash("sha256").update(contents).digest("hex"),
          phases: ["program", "checker"], inputFileUnmodified: true,
          }, null, 2))
        }
        return { contents, loader: "js", resolveDir: path.dirname(args.path) }
      })
    },
  }
}

/** Reuse the production transform before adding separate diagnostic hooks. */
export function compilerObservedSource(original) {
  const observer = path.resolve("src/semantic/semantic-worker-progress.ts")
  let contents = original
  for (const [name, parameters, phase] of [
    ["createProgram", "rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics", "program"],
    ["createTypeChecker", "host, isTypeCheckerForLinter = false", "checker"],
  ]) {
    const declaration = "function " + name + "(" + parameters + ") {"
    if (contents.split(declaration).length !== 2) throw Error("Fixed compiler observation signature changed: " + name)
    const implementation = "__arktsObserved_" + name
    contents = contents.replace(declaration, declaration
      + " return __arktsCompilerObserver.observeCompilerPhase(" + JSON.stringify(phase)
      + ", () => " + implementation + "(...arguments)); }\nfunction " + implementation + "(" + parameters + ") {")
  }
  // Insert beside the declaration so an existing strict directive stays a directive.
  const importLine = "var __arktsCompilerObserver = require(" + JSON.stringify(observer) + ");\n"
  return contents.replace("function createProgram(", importLine + "function createProgram(")
}
