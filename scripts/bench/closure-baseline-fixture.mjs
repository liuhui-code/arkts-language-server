import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

/** Deterministic synthetic input only. Never edits a supplied project or SDK. */
export function createClosureFixture(directory, { files, imports, fields = 0, edges = 0, groups = 0 }) {
  const workspace = path.join(directory, "workspace"), sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  if (groups > 0) return createGroups(workspace, sdk, groups)
  const names = []
  for (let i = 0; i < files - 2; i++) {
    const dependencies = Array.from({ length: Math.min(edges, files - 2) }, (_, j) => `import { Item${j} } from './File${j}'`).join("\n")
    const members = Array.from({ length: fields }, (_, j) => `value${j}: number = ${i};`).join("")
    fs.writeFileSync(path.join(workspace, `File${i}.ets`), `${dependencies}\nexport class Item${i} { ${members} }\n`)
    if (i < imports) names.push(`import { Item${i} } from './File${i}'`)
  }
  const source = `// neverLogThisSourceMarker\nimport { Target } from './Target'\n${names.join("\n")}\nexport const result = new Target()\n`
  fs.writeFileSync(path.join(workspace, "Main.ets"), source)
  fs.writeFileSync(path.join(workspace, "Target.ets"), "export class Target {}\n")
  const prefix = source.slice(0, source.lastIndexOf("Target") + 1).split("\n")
  return { workspace, sdk, main: "Main.ets", target: "Target.ets", position: { line: prefix.length - 1, character: prefix.at(-1).length } }
}

export function fixtureDigest(directory) {
  const hash = createHash("sha256")
  function visit(relative) {
    const full = path.join(directory, relative)
    for (const entry of fs.readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name)
      if (entry.isDirectory()) visit(name)
      else { hash.update(name.split(path.sep).join("/") + "\0"); hash.update(fs.readFileSync(path.join(directory, name))) }
    }
  }
  visit("workspace"); visit("sdk")
  return hash.digest("hex")
}

function createGroups(workspace, sdk, count) {
  const modules = Array.from({ length: count }, (_, index) => `module${index}`)
  fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] }, modules: modules.map(name => ({
      name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
  for (const module of modules) {
    const directory = path.join(workspace, module)
    fs.mkdirSync(path.join(directory, "src/main/ets"), { recursive: true })
    fs.writeFileSync(path.join(directory, "build-profile.json5"), "{targets:[{name:'default'}]}")
    fs.writeFileSync(path.join(directory, "oh-package.json5"), JSON.stringify({ name: module,
      main: "./src/main/ets/Target.ets", dependencies: {} }))
    fs.writeFileSync(path.join(directory, "src/main/ets/Target.ets"), "export class Target {}\n")
    fs.writeFileSync(path.join(directory, "src/main/ets/Main.ets"), "import { Target } from './Target'\nexport const result = new Target()\n")
  }
  const prefix = `${modules.at(-1)}/src/main/ets/`
  return { workspace, sdk, main: prefix + "Main.ets", target: prefix + "Target.ets", position: { line: 1, character: 27 } }
}
