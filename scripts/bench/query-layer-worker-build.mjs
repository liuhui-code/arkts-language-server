import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { promisify } from "node:util"
import { build, stop } from "esbuild"

export async function buildObservedWorkers(directory, server, identity) {
  const source = new URL(import.meta.url).href
  const code = `import { buildWorkerArtifacts } from ${JSON.stringify(source)}; await buildWorkerArtifacts(JSON.parse(process.argv[1]))`
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code,
    JSON.stringify({ directory, server, identity })], { encoding: "utf8", maxBuffer: 1024 * 1024 })
  return JSON.parse(stdout)
}

/** Separate builder exits before measurement. Baseline must reproduce the pinned production bytes. */
export async function buildWorkerArtifacts({ directory, server, identity }) {
  if (!path.basename(directory).startsWith("arkts-query-layer-counter-")) throw new Error("QUERY_LAYER_WORKER_BUILD_DIRECTORY_INVALID")
  const require = createRequire(import.meta.url)
  const compilerFile = fs.realpathSync(require.resolve("typescript"))
  const compilerSource = fs.readFileSync(compilerFile, "utf8")
  if (sha256(compilerSource) !== identity.compilerSha256) throw new Error("QUERY_LAYER_WORKER_COMPILER_CHANGED")
  const output = path.join(fs.realpathSync(directory), "workers")
  fs.mkdirSync(output)
  const options = { entryPoints: { server: "src/server.ts",
    "semantic-worker": "src/semantic/semantic-worker-runtime.ts",
    "reference-verifier-worker": "src/semantic/references/reference-verifier-worker-runtime.ts",
    "diagnostic-verifier-worker": "src/semantic/diagnostics/diagnostic-verifier-worker-runtime.ts" },
  bundle: true, write: false, define: { ARKTS_COMPILER_ARTIFACT_IDENTITY: JSON.stringify(identity) },
  platform: "node", target: "node20", format: "cjs", outdir: "dist", outExtension: { ".js": ".cjs" } }
  const production = path.dirname(server)
  try {
    const baseline = await build(options)
    for (const file of baseline.outputFiles) {
      if (sha256(file.contents) !== sha256(fs.readFileSync(path.join(production, path.basename(file.path))))) {
        throw new Error(`QUERY_LAYER_WORKER_BASELINE_DRIFT:${path.basename(file.path)}`)
      }
    }
    const hook = "const hook = globalThis[Symbol.for('arkts.query-layer.compiler-observer')];"
      + "if(typeof hook !== 'function') throw new Error('QUERY_LAYER_WORKER_COMPILER_HOOK_MISSING');"
      + "module.exports = hook(module.exports);"
    let loaded = 0
    const plugin = { name: "query-layer-compiler-exports", setup(builder) {
      builder.onLoad({ filter: /[/\\]typescript\.js$/ }, args => {
        if (fs.realpathSync(args.path) !== compilerFile) return
        loaded++
        return { contents: `${compilerSource}\n${hook}\n`, loader: "js", resolveDir: path.dirname(args.path) }
      })
    } }
    const artifacts = []
    for (const [stem, entry] of Object.entries(options.entryPoints).filter(([stem]) => stem !== "server")) {
      const name = `${stem}.cjs`
      const diagnostic = await build({ ...options, entryPoints: { [stem]: entry },
        define: { ...options.define, __filename: JSON.stringify(path.join(production, name)) }, plugins: [plugin] })
      if (diagnostic.outputFiles.length !== 1) throw new Error("QUERY_LAYER_WORKER_BUILD_INCOMPLETE")
      const file = diagnostic.outputFiles[0]
      const target = path.join(output, name)
      fs.writeFileSync(target, file.contents, { flag: "wx" })
      artifacts.push({ name, productionPath: path.join(production, name),
        productionSha256: sha256(fs.readFileSync(path.join(production, name))),
        diagnosticPath: target, diagnosticSha256: sha256(file.contents) })
    }
    if (loaded !== 3) throw new Error("QUERY_LAYER_WORKER_COMPILER_HOOK_COUNT")
    const manifest = path.join(production, "arkts-standard-library.json")
    const library = JSON.parse(fs.readFileSync(manifest, "utf8"))
    const libraryFiles = library.files.map(name => {
      if (!/^lib(?:\.[a-z0-9]+)*\.d\.ts$/.test(name)) throw new Error("QUERY_LAYER_WORKER_LIBRARY_INVALID")
      const bytes = fs.readFileSync(path.join(production, name))
      return { name, sha256: sha256(bytes) }
    })
    process.stdout.write(JSON.stringify({ parity: "PRODUCTION_SOURCE_EXPORT_HOOK_DIAGNOSTIC_BUILD", baselineByteIdentical: true,
      compilerIdentity: identity, hookSha256: sha256(hook), artifacts, libraryFiles, standardLibraryDirectory: production,
      standardLibraryManifestSha256: sha256(fs.readFileSync(manifest)),
      builderSha256: sha256(fs.readFileSync(new URL(import.meta.url))) }))
  } finally { await stop() }
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex") }
