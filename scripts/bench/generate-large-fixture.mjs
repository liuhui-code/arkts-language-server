#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

try {
  const options = parseArguments(process.argv.slice(2))
  generateFixture(options)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

function generateFixture({ output, workspaceFiles, activeDependencyFiles, seed }) {
  if (workspaceFiles <= activeDependencyFiles) {
    throw new Error("workspace-files must exceed active-dependency-files")
  }
  if (fs.existsSync(output)) throw new Error(`output directory already exists: ${output}`)

  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.mkdirSync(output)
  write(output, "build-profile.json5", `{
  app: { products: [{ name: "default", signingConfig: "default" }] },
  modules: [{ name: "entry", srcPath: "./entry", targets: [{ name: "default", applyToProducts: ["default"] }] }]
}\n`)
  write(output, "oh-package.json5", "{ name: \"product-gate-workspace\", version: \"1.0.0\" }\n")
  write(output, "entry/build-profile.json5", `{
  apiType: "stageMode",
  buildOption: {},
  targets: [{ name: "default" }]
}\n`)
  write(output, "entry/oh-package.json5", "{ name: \"entry\", version: \"1.0.0\", main: \"src/main/ets/Main.ets\" }\n")
  write(output, "entry/src/main/module.json5", `{
  module: { name: "entry", type: "entry", srcEntry: "./ets/Main.ets", deviceTypes: ["phone"] }
}\n`)

  const sourceRoot = "entry/src/main/ets"
  const generatedRoot = `${sourceRoot}/generated`
  const firstImport = activeDependencyFiles === 0
    ? ""
    : `import { Active000000 } from "./generated/Active000000"\n\n`
  write(output, `${sourceRoot}/Main.ets`, `${firstImport}export const benchmarkSeed = ${seed}\n`)

  for (let index = 0; index < activeDependencyFiles; index += 1) {
    const identity = padded(index)
    const nextImport = index + 1 < activeDependencyFiles
      ? `import { Active${padded(index + 1)} } from "./Active${padded(index + 1)}"\n\n`
      : ""
    const nextUse = index + 1 < activeDependencyFiles
      ? `\nexport const next${identity}: Active${padded(index + 1)} | undefined = undefined`
      : ""
    write(
      output,
      `${generatedRoot}/Active${identity}.ets`,
      `${nextImport}export class Active${identity} { readonly seed: number = ${seed} }${nextUse}\n`,
    )
  }

  const unrelatedFiles = workspaceFiles - activeDependencyFiles - 1
  for (let index = 0; index < unrelatedFiles; index += 1) {
    const identity = padded(index)
    const bucket = String(Math.floor(index / 1_000)).padStart(3, "0")
    write(
      output,
      `${generatedRoot}/unused/${bucket}/Unused${identity}.ets`,
      `export class Unused${identity} { readonly seed: number = ${seed} }\n`,
    )
  }

  write(output, "fixture-manifest.json", `${JSON.stringify({
    schemaVersion: 1,
    seed,
    workspaceFiles,
    activeDependencyFiles,
    entryFile: `${sourceRoot}/Main.ets`,
    generatedSourceRoot: generatedRoot,
  }, null, 2)}\n`)
}

function parseArguments(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) {
      throw new Error("usage: generate-large-fixture.mjs --out PATH --workspace-files N --active-dependency-files N --seed N")
    }
    values.set(flag, value)
  }
  const expected = ["--out", "--workspace-files", "--active-dependency-files", "--seed"]
  if (values.size !== expected.length || expected.some((flag) => !values.has(flag))) {
    throw new Error("usage: generate-large-fixture.mjs --out PATH --workspace-files N --active-dependency-files N --seed N")
  }
  const output = path.resolve(values.get("--out"))
  const workspaceFiles = integer(values.get("--workspace-files"), "workspace-files", 1)
  const activeDependencyFiles = integer(
    values.get("--active-dependency-files"),
    "active-dependency-files",
    0,
  )
  const seed = integer(values.get("--seed"), "seed", 0)
  return { output, workspaceFiles, activeDependencyFiles, seed }
}

function integer(value, name, minimum) {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) throw new Error(`${name} must be an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be a safe integer >= ${minimum}`)
  }
  return parsed
}

function padded(value) {
  return String(value).padStart(6, "0")
}

function write(root, relativePath, content) {
  const destination = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, content, { encoding: "utf8", flag: "wx" })
}
