import fs from "node:fs"
import path from "node:path"
import { createReadinessFixture } from "./semantic-readiness-lsp.mjs"

export function createSdkPartialScopeFixture(t, profile, env = {}) {
  const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
    ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE: profile, ...env },
    { serverPath: process.env.ARKTS_TEST_SERVER_PATH })
  for (const name of Object.keys(f.sources)) fs.unlinkSync(path.join(f.workspace, name))
  const folder = "app/src/main/ets", sourceRoot = path.join(f.workspace, folder)
  fs.mkdirSync(sourceRoot, { recursive: true })
  const main = 'import { Box } from "./Box"\nexport const global = new GlobalThing()\nexport const augmented = new Box().augment()\n'
  const global = "class GlobalThing { selected: number = 1 }\n"
  const augmentation = 'import { Box } from "./Box"\ndeclare module "./Box" { interface Box { augment(): number } }\n'
  for (const [name, text] of Object.entries({ "Main.ets": main, "Global.ets": global,
    "Augment.ets": augmentation, "Box.ets": "export class Box {}\n" })) fs.writeFileSync(path.join(sourceRoot, name), text)
  for (let i = 0; i < 96; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
  fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default", compileSdkVersion: "unmapped-sdk-alias" }] },
    modules: [{ name: "app", srcPath: "./app", targets: [{ name: "default", applyToProducts: ["default"] }] }] }))
  fs.writeFileSync(path.join(f.workspace, "app/build-profile.json5"), "{targets:[{name:'default'}]}")
  fs.writeFileSync(path.join(f.workspace, "app/oh-package.json5"), "{name:'app'}")
  return { f, folder, sourceRoot, main, global, augmentation }
}
