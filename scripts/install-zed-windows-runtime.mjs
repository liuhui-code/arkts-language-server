import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export function buildWindowsRuntime({ libexecRoot, projectRoot, extensionSource, runBuild, assertWasm }) {
  runBuild("pnpm", ["install", "--frozen-lockfile", "--config.lockfile=true"])
  runBuild("pnpm", ["build"])
  runBuild("cargo", ["build", "--locked", "--package", "arkts-index-sidecar", "--release"], {
    ...process.env,
    CARGO_TARGET_DIR: path.join(projectRoot, "target"),
  })
  runBuild("cargo", ["build", "--locked", "--manifest-path", "editors/zed/Cargo.toml",
    "--target", "wasm32-wasip2", "--release"], {
    ...process.env,
    CARGO_TARGET_DIR: path.join(extensionSource, "target"),
  })

  const extensionBuild = path.join(extensionSource, "target", "wasm32-wasip2", "release", "zed_arkts_local.wasm")
  const extensionWasm = path.join(extensionSource, "extension.wasm")
  const extensionTemporary = `${extensionWasm}.tmp-${process.pid}`
  try {
    fs.copyFileSync(extensionBuild, extensionTemporary)
    assertWasm(extensionTemporary, "Zed extension")
    fs.renameSync(extensionTemporary, extensionWasm)
  } finally {
    fs.rmSync(extensionTemporary, { force: true })
  }

  const standardLibrary = JSON.parse(fs.readFileSync(path.join(projectRoot, "dist", "arkts-standard-library.json"), "utf8"))
  if (standardLibrary.schema !== "arkts-language-server.standard-library"
    || standardLibrary.schemaVersion !== 1
    || !Array.isArray(standardLibrary.files)
    || standardLibrary.files.length === 0
    || standardLibrary.files.some((name, index) => typeof name !== "string"
      || !/^lib(?:\.[A-Za-z0-9_-]+)*\.d\.ts$/.test(name)
      || (index > 0 && standardLibrary.files[index - 1] >= name))) {
    throw new Error("invalid ArkTS standard-library manifest")
  }
  const files = [
    "config/semantic-runtime.json",
    "dist/server.cjs",
    "dist/semantic-worker.cjs",
    "dist/reference-verifier-worker.cjs",
    "dist/arkts-standard-library.json",
    ...standardLibrary.files.map((name) => `dist/${name}`),
    "target/release/arkts-index-sidecar.exe",
  ]
  const digest = createHash("sha256")
  for (const relative of files) {
    const source = path.join(projectRoot, relative)
    const stat = fs.lstatSync(source)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe runtime file: ${relative}`)
    digest.update(fs.readFileSync(source))
    digest.update("\0")
  }
  const version = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version
  if (!/^[A-Za-z0-9._-]+$/.test(version)) throw new Error("Invalid package version")
  const release = path.join(libexecRoot, `${version}-${digest.digest("hex")}`)
  if (!fs.existsSync(release)) {
    const staging = path.join(libexecRoot, `.staging-${process.pid}-${randomBytes(6).toString("hex")}`)
    try {
      for (const relative of files) {
        const target = path.join(staging, relative)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(path.join(projectRoot, relative), target)
      }
      fs.renameSync(staging, release)
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  }
  const releaseStat = fs.lstatSync(release)
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) {
    throw new Error(`Existing language-server release is corrupt: ${release}`)
  }
  for (const relative of files) {
    let parent = release
    for (const segment of relative.split("/").slice(0, -1)) {
      parent = path.join(parent, segment)
      const parentStat = fs.lstatSync(parent)
      if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
        throw new Error(`Existing language-server release is corrupt: ${release}`)
      }
    }
    const installed = path.join(release, relative)
    const stat = fs.lstatSync(installed)
    if (!stat.isFile() || stat.isSymbolicLink()
      || !fs.readFileSync(path.join(projectRoot, relative)).equals(fs.readFileSync(installed))) {
      throw new Error(`Existing language-server release is corrupt: ${release}`)
    }
  }
  return path.join(release, "dist", "server.cjs")
}
