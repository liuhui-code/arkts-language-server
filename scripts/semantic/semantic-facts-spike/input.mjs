import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export function readJson(file) {
  if (fs.statSync(file).size > 32 * 1024 * 1024) throw new Error("spike JSON exceeds 32 MiB")
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

export function readSources(file) {
  const input = readJson(file)
  if (input.schemaVersion !== 1 || !input.files || typeof input.files !== "object"
    || Array.isArray(input.files) || !Object.keys(input.files).length) {
    throw new Error("input requires schemaVersion 1 and nonempty files")
  }
  for (const [name, text] of Object.entries(input.files)) {
    if (!validFile(name) || typeof text !== "string") throw new Error("invalid source file")
  }
  return input
}

// Disk inputs are accepted only by the stock oracle. Extraction still requires
// the small, self-contained fixture format above.
export function readOracleSources(file) {
  const input = readJson(file)
  if (input.schemaVersion === 1) {
    const fixture = readSources(file)
    return { files: fixture.files, root: path.dirname(file),
      inputSha256: inputIdentity(fixture.files), kind: "inline-fixture" }
  }
  if (input.schemaVersion !== 2 && input.schemaVersion !== 3) {
    throw new Error("input requires a supported disk-workspace schema; no inline fallback")
  }
  const fields = Object.keys(input).sort()
  const expected = ["files", "kind", "listedSourceSha256", "schemaVersion", "sdkRoot", "workspaceRoot"]
  const pinned = [...expected, "sdkDeclarationDigest"].sort()
  const productionPinned = [...pinned, "sdkCompilerOptionsDigest"].sort()
  const projectPinned = [...productionPinned, "projectConfigurationDigest"].sort()
  const installedPinned = [...projectPinned, "installedDependencyDigest"].sort()
  const fieldsWithoutSeed = fields.filter((field) => field !== "membershipSeedFile")
  const acceptedFields = input.schemaVersion === 3 ? [installedPinned]
    : [expected, pinned, productionPinned, projectPinned]
  if (!acceptedFields.some((candidate) => JSON.stringify(fieldsWithoutSeed) === JSON.stringify(candidate))
    || input.kind !== "disk-workspace"
    || typeof input.workspaceRoot !== "string" || !path.isAbsolute(input.workspaceRoot)
    || typeof input.sdkRoot !== "string" || !path.isAbsolute(input.sdkRoot)
    || typeof input.listedSourceSha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(input.listedSourceSha256)
    || (input.sdkDeclarationDigest !== undefined
      && (typeof input.sdkDeclarationDigest !== "string"
        || !/^[a-f0-9]{64}$/u.test(input.sdkDeclarationDigest)))
    || (input.sdkCompilerOptionsDigest !== undefined
      && (typeof input.sdkCompilerOptionsDigest !== "string"
        || !/^[a-f0-9]{64}$/u.test(input.sdkCompilerOptionsDigest)))
    || (input.projectConfigurationDigest !== undefined
      && (typeof input.projectConfigurationDigest !== "string"
        || !/^[a-f0-9]{64}$/u.test(input.projectConfigurationDigest)))
    || (input.schemaVersion === 3 && (typeof input.installedDependencyDigest !== "string"
      || !/^[a-f0-9]{64}$/u.test(input.installedDependencyDigest)))
    || !Array.isArray(input.files) || input.files.length === 0
    || new Set(input.files).size !== input.files.length
    || (input.membershipSeedFile !== undefined
      && (!validFile(input.membershipSeedFile)
        || !input.files.includes(input.membershipSeedFile)))) {
    throw new Error("disk oracle requires paths, file names, and pinned workspace digest; no source copies")
  }
  const root = path.resolve(input.workspaceRoot)
  const sdkRoot = path.resolve(input.sdkRoot)
  if (!fs.statSync(root).isDirectory() || !fs.statSync(sdkRoot).isDirectory()) {
    throw new Error("disk oracle requires existing workspace and SDK directories")
  }
  const realRoot = fs.realpathSync(root)
  const files = {}
  for (const name of input.files) {
    if (!validFile(name)) throw new Error(`invalid disk oracle source path: ${name}`)
    const source = path.resolve(root, name)
    const actual = fs.realpathSync(source)
    const withinRoot = path.relative(realRoot, actual)
    if (withinRoot.startsWith(`..${path.sep}`) || withinRoot === ".." || path.isAbsolute(withinRoot)
      || !fs.statSync(actual).isFile()) {
      throw new Error(`disk oracle source escapes workspace: ${name}`)
    }
    files[name] = fs.readFileSync(source, "utf8")
  }
  const inputSha256 = inputIdentity(files)
  if (inputSha256 !== input.listedSourceSha256) throw new Error("disk oracle listed-source digest mismatch")
  return { files, root, sdkRoot, inputSha256, kind: input.kind,
    membershipSeedFile: input.membershipSeedFile,
    sdkDeclarationDigest: input.sdkDeclarationDigest,
    sdkCompilerOptionsDigest: input.sdkCompilerOptionsDigest,
    projectConfigurationDigest: input.projectConfigurationDigest,
    installedDependencyDigest: input.installedDependencyDigest }
}

export function readQueries(file) {
  const input = readJson(file)
  if (input.schemaVersion !== 1 || !Array.isArray(input.queries) || !input.queries.length) {
    throw new Error("queries requires schemaVersion 1 and nonempty queries")
  }
  const ids = new Set()
  for (const query of input.queries) {
    if (!query || typeof query.id !== "string" || !query.id || ids.has(query.id)
      || !validFile(query.file) || !Number.isSafeInteger(query.line) || query.line < 0
      || !Number.isSafeInteger(query.character) || query.character < 0
      || typeof query.includeDeclaration !== "boolean") throw new Error("invalid or duplicate query")
    ids.add(query.id)
  }
  return input.queries
}

export function validFile(file) {
  return typeof file === "string" && !path.posix.isAbsolute(file) && !file.includes("\\")
    && file.split("/").every((segment) => segment && segment !== "." && segment !== "..")
    && /\.(ets|ts)$/u.test(file)
}

export function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

export function inputIdentity(files) {
  return digest(JSON.stringify(Object.keys(files).sort().map((file) => [file, digest(files[file])])))
}

export function ordinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

export function locationKey(location) {
  return JSON.stringify([location.file, location.start.line, location.start.character,
    location.end.line, location.end.character])
}

export function normalizeLocations(locations) {
  return [...new Map(locations.map((location) => [locationKey(location), location])).values()]
    .sort((left, right) => ordinal(left.file, right.file)
      || left.start.line - right.start.line || left.start.character - right.start.character
      || left.end.line - right.end.line || left.end.character - right.end.character)
}

export function queryOffset(file, query) {
  const start = file?.lineStarts[query.line]
  const end = file?.lineEnds[query.line]
  if (start === undefined || start + query.character >= end) {
    throw new Error(`query ${query.id} is outside its source line`)
  }
  return start + query.character
}
