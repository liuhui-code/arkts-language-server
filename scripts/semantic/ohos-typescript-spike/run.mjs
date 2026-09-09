#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import {
  createSpikeProject,
  diagnosticIdentity,
  materializeMarkedFixture,
} from "./backend-host.mjs"
import { summarizeSpikeResults } from "./spike-report.mjs"

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function run() {
  const options = parseArguments(process.argv.slice(2))
  const lock = readJson(path.join(projectRoot, "docs", "toolchains", "arkts-toolchain.lock.json"))
  const upstreamIdentity = readJson(
    path.join(projectRoot, "docs", "reports", "ohos-typescript-upstream.json"),
  )
  const checkoutRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: options.upstream,
    encoding: "utf8",
    maxBuffer: 16 * 1024,
  }).trim()
  if (checkoutRevision !== lock.semanticBackendRevision) {
    throw new Error("Spike checkout does not match the toolchain lock")
  }

  const packageJson = readJson(path.join(options.upstream, "package.json"))
  const modulePath = packageJson.main.replace(/^\.\//, "")
  const compiler = require(path.join(options.upstream, ...modulePath.split("/")))
  if (compiler.ScriptKind.ETS !== upstreamIdentity.compilerApiIdentity.scriptKindEts) {
    throw new Error("Loaded compiler API identity differs from the S1 report")
  }

  requireSdkLayout(options.sdk)
  const manifest = readJson(path.join(options.contracts, "manifest.json"))
  const cases = manifest.caseFiles.flatMap(({ category, path: casePath }) => (
    readJson(path.join(options.contracts, ...casePath.split("/")))
      .map((record) => ({ ...record, category }))
  ))
  const results = cases.map((record) => (
    record.fixture
      ? runRawCase(compiler, options.contracts, record)
      : {
          id: record.id,
          category: record.category,
          status: "deferred",
          reason: "Public transcript is not yet expressed as a direct official-backend scenario",
        }
  ))
  const summary = summarizeSpikeResults(results, manifest.minimumCases)
  const report = {
    schemaVersion: 1,
    status: summary.status,
    backendRevision: lock.semanticBackendRevision,
    backendPackage: packageJson.name,
    backendPackageVersion: packageJson.version,
    compilerVersion: compiler.version,
    scriptKindEts: compiler.ScriptKind.ETS,
    sdkApiLevel: lock.sdkApiLevel,
    sdkDeclarationDigest: lock.sdkDeclarationDigest,
    productionWiring: false,
    sdkSmoke: runSdkSmoke(compiler, options.sdk),
    summary,
    results,
  }
  writeJsonAtomically(options.out, report)
  process.stdout.write("OHOS_TYPESCRIPT_SPIKE=" + summary.status + "\n")
  process.stdout.write(
    "EXECUTED=" + summary.totals.passed + " DEFERRED=" + summary.totals.deferred
      + " FAILED=" + summary.totals.failed + "\n",
  )
  if (summary.status !== "PASS" && !options.allowIncomplete) process.exitCode = 42
}

function runRawCase(compiler, contractsRoot, record) {
  const fixturePath = path.join(
    contractsRoot,
    record.category,
    ...record.fixture.file.split("/"),
  )
  const markedText = fs.readFileSync(fixturePath, "utf8")
  const materialized = materializeMarkedFixture(markedText, record.fixture.marker)
  const relativePath = record.category + "/" + record.fixture.file
  const project = createSpikeProject(compiler, contractsRoot, {
    [relativePath]: materialized.text,
  })
  try {
    const sourceFile = project.sourceFile(relativePath)
    if (!sourceFile) throw new Error("LanguageService did not create a SourceFile")
    const syntacticDiagnostics = project.syntacticDiagnostics(relativePath)
      .map((diagnostic) => diagnosticIdentity(compiler, diagnostic))
    const observations = {
      scriptKind: sourceFile.scriptKind,
      syntacticDiagnostics,
    }

    if (record.category === "syntax") {
      observations.declarations = sourceFile.statements
        .filter((statement) => statement.name?.text)
        .map((statement) => ({
          kind: compiler.SyntaxKind[statement.kind],
          name: statement.name.text,
        }))
      const names = observations.declarations.map(({ name }) => name)
      assert(names.includes("Page"), "expected Page declaration")
      assert(!names.includes("Ghost"), "struct token in string/comment became a declaration")
      assert(syntacticDiagnostics.length === 0, "unexpected syntax diagnostics")
    } else {
      const completion = project.completions(relativePath, materialized.position)
      const completionNames = completion?.entries.map(({ name }) => name) ?? []
      observations.completionEntryCount = completionNames.length
      const expected = record.fixture.oracle.completionIncludes ?? []
      observations.matchedCompletionNames = expected.filter((name) => completionNames.includes(name))
      for (const name of expected) {
        assert(completionNames.includes(name), "missing completion " + name)
      }
      if (record.category === "unicode") {
        const position = sourceFile.getLineAndCharacterOfPosition(materialized.position)
        observations.utf16Position = position
        assert(
          sourceFile.getPositionOfLineAndCharacter(position.line, position.character)
            === materialized.position,
          "UTF-16 position did not round-trip",
        )
      }
    }

    project.dispose()
    return {
      id: record.id,
      category: record.category,
      status: "passed",
      observations,
      stats: project.stats(),
    }
  } catch (error) {
    return {
      id: record.id,
      category: record.category,
      status: "failed",
      reason: boundedMessage(error),
    }
  } finally {
    project.dispose()
  }
}

function runSdkSmoke(compiler, sdkRoot) {
  const relativePath = "ets/api/@ohos.hilog.d.ts"
  const fileName = path.join(sdkRoot, ...relativePath.split("/"))
  const text = fs.readFileSync(fileName, "utf8")
  const sourceFile = compiler.createSourceFile(
    fileName,
    text,
    compiler.ScriptTarget.Latest,
    true,
    compiler.ScriptKind.TS,
  )
  return {
    relativePath,
    bytes: Buffer.byteLength(text),
    syntacticDiagnostics: sourceFile.parseDiagnostics
      .map((diagnostic) => diagnosticIdentity(compiler, diagnostic)),
  }
}

function requireSdkLayout(sdkRoot) {
  for (const relativePath of ["ets", "toolchains", "ets/api/@ohos.hilog.d.ts"]) {
    const candidate = path.join(sdkRoot, ...relativePath.split("/"))
    if (!fs.existsSync(candidate)) throw new Error("SDK input is missing: " + relativePath)
  }
}

function parseArguments(argv) {
  const values = new Map()
  let allowIncomplete = false
  for (let index = 0; index < argv.length;) {
    const name = argv[index]
    if (name === "--allow-incomplete") {
      if (allowIncomplete) throw new Error("--allow-incomplete may appear only once")
      allowIncomplete = true
      index += 1
      continue
    }
    if (!["--upstream", "--sdk", "--contracts", "--out"].includes(name)) {
      throw new Error("Unknown argument: " + name)
    }
    if (values.has(name) || argv[index + 1] === undefined) {
      throw new Error(name + " requires exactly one value")
    }
    values.set(name, argv[index + 1])
    index += 2
  }
  return {
    upstream: requiredAbsolute(values.get("--upstream"), "--upstream"),
    sdk: requiredAbsolute(values.get("--sdk"), "--sdk"),
    contracts: path.resolve(values.get("--contracts") ?? "tests/semantic-contract"),
    out: path.resolve(values.get("--out") ?? "docs/reports/ohos-typescript-spike.json"),
    allowIncomplete,
  }
}

function requiredAbsolute(value, name) {
  if (!value || !path.isAbsolute(value)) throw new Error(name + " must be an absolute path")
  return path.resolve(value)
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(fileName, "utf8"))
}

function writeJsonAtomically(fileName, value) {
  fs.mkdirSync(path.dirname(fileName), { recursive: true })
  const temporary = fileName + "." + process.pid + ".tmp"
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
    fs.renameSync(temporary, fileName)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function boundedMessage(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 512)
}

try {
  run()
} catch (error) {
  process.stderr.write(boundedMessage(error) + "\n")
  process.exitCode = 1
}
