import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { projectRoot } from "./support/lsp-process.mjs"

const matrixPath = path.join(projectRoot, "docs", "semantic-capability-matrix.json")

test("assigns every semantic capability to exactly one authoritative owner", () => {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"))
  assert.deepEqual(Object.keys(matrix), [
    "schemaVersion",
    "syntax",
    "types",
    "completion",
    "definition",
    "references",
    "rename",
    "arktsRestrictions",
    "arkuiStructuralRules",
    "resourceExistence",
  ])
  assert.equal(matrix.schemaVersion, 1)

  for (const [capability, owner] of Object.entries(matrix)) {
    if (capability === "schemaVersion") continue
    assert.equal(typeof owner, "string", `${capability} must have one string owner`)
    assert.notEqual(owner.trim(), "", `${capability} must not have an empty owner`)
  }

  for (const capability of [
    "syntax",
    "types",
    "completion",
    "definition",
    "references",
    "rename",
  ]) {
    assert.equal(matrix[capability], "ohos-typescript")
  }
  assert.equal(matrix.arktsRestrictions, "unassigned")
  assert.equal(matrix.arkuiStructuralRules, "unassigned")
  assert.equal(matrix.resourceExistence, "project-resource-provider")
})

test("keeps unproven rule providers out of the production semantic runtime", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  const dependencyNames = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  }).join("\n")
  assert.doesNotMatch(dependencyNames, /ets2panda|ace[_-]ets2bundle/iu)

  const semanticSources = readTypeScriptTree(path.join(projectRoot, "src", "semantic"))
    + readTypeScriptTree(path.join(projectRoot, "src", "core", "types"))
  assert.doesNotMatch(semanticSources, /ets2panda|ace[_-]ets2bundle/iu)
  assert.equal((semanticSources.match(/\.createLanguageService\s*\(/gu) ?? []).length, 1)
  assert.doesNotMatch(semanticSources, /\.createProgram\s*\(/gu)

  const resourceProvider = fs.readFileSync(
    path.join(projectRoot, "src", "core", "arkui", "resource-language-provider.ts"),
    "utf8",
  )
  assert.doesNotMatch(
    resourceProvider,
    /\.create(?:LanguageService|Program|DocumentRegistry)\s*\(/gu,
  )
})

function readTypeScriptTree(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const candidate = path.join(root, entry.name)
      if (entry.isDirectory()) return readTypeScriptTree(candidate)
      return entry.isFile() && entry.name.endsWith(".ts")
        ? fs.readFileSync(candidate, "utf8")
        : ""
    })
    .join("\n")
}
