import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const contractRoot = path.join(projectRoot, "tests", "semantic-contract")
const requiredCategories = [
  "syntax",
  "completion",
  "definition",
  "references",
  "rename",
  "diagnostics",
  "incomplete",
  "unicode",
  "project-boundary",
]
const requiredCases = [
  "syntax.struct",
  "syntax.struct-in-string",
  "syntax.struct-in-comment",
  "incomplete.this-dot",
  "unicode.non-bmp-position",
  "project-boundary.declared-module",
  "project-boundary.ghost-module",
  "project-boundary.inactive-target",
  "definition.alias-reexport",
  "rename.cross-module",
  "project-boundary.target-membership",
  "project-boundary.overlay-authority",
  "project-boundary.watcher-freshness",
  "project-boundary.catalog-identity",
]

test("semantic contract manifest contains every mandatory backend-independent case", () => {
  const manifest = readJson(path.join(contractRoot, "manifest.json"))
  assert.equal(manifest.schemaVersion, 1)
  assert.ok(manifest.minimumCases >= 30)
  assert.deepEqual(manifest.requiredCategories, requiredCategories)
  assert.deepEqual(manifest.caseFiles.map(({ category }) => category), requiredCategories)

  const cases = manifest.caseFiles.flatMap(({ category, path: casePath }) => {
    const categoryRoot = path.join(contractRoot, category)
    assert.equal(fs.statSync(categoryRoot).isDirectory(), true)
    const absoluteCasePath = withinContractRoot(casePath)
    const records = readJson(absoluteCasePath)
    assert.ok(Array.isArray(records) && records.length > 0, `${casePath} must contain cases`)
    return records.map((record) => ({ ...record, category, casePath }))
  })

  assert.ok(cases.length >= manifest.minimumCases)
  assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length)
  for (const id of requiredCases) assert.ok(cases.some((record) => record.id === id), id)
  for (const record of cases) validateCase(record)
})

function validateCase(record) {
  assert.match(record.id, new RegExp(`^${escapeRegex(record.category)}\\.[a-z0-9][a-z0-9.-]*$`))
  assert.equal(record.mandatory, true, `${record.id} must be mandatory`)
  assert.ok(Array.isArray(record.assertions) && record.assertions.length > 0)
  assert.ok(record.assertions.every((claim) => typeof claim === "string" && claim.trim()))
  assert.equal(Number(Boolean(record.evidence)) + Number(Boolean(record.fixture)), 1)

  if (record.evidence) {
    const evidencePath = path.resolve(projectRoot, ...record.evidence.file.split("/"))
    assert.equal(evidencePath.startsWith(`${projectRoot}${path.sep}`), true)
    const source = fs.readFileSync(evidencePath, "utf8")
    const declaration = new RegExp(
      `\\btest\\(\\s*["']${escapeRegex(record.evidence.testName)}["']`,
      "g",
    )
    assert.equal(source.match(declaration)?.length, 1, `${record.id} evidence must be exact`)
    assert.ok(Array.isArray(record.oracleFields) && record.oracleFields.length > 0)
  } else {
    const fixturePath = withinContractRoot(path.posix.join(record.category, record.fixture.file))
    const source = fs.readFileSync(fixturePath, "utf8")
    assert.equal(source.match(/\/\*@query\*\//g)?.length, 1)
    assert.equal(record.fixture.marker, "/*@query*/")
    assert.ok(record.fixture.oracle && typeof record.fixture.oracle === "object")
  }
}

function withinContractRoot(relativePath) {
  const absolutePath = path.resolve(contractRoot, ...relativePath.split("/"))
  assert.equal(absolutePath.startsWith(`${contractRoot}${path.sep}`), true)
  return absolutePath
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
