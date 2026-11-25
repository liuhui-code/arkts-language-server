import { createHash } from "node:crypto"
import path from "node:path"
import type ts from "typescript"
import { projectSourceRole, type ProjectSourceRole } from "./project-source-role.js"

/** One syntax-profile owner. Shares values, never ASTs, text, bindings or proofs. */
export class SourceRolePool {
  private readonly entries = new Map<string, { role: ProjectSourceRole; references: number }>()

  constructor(private readonly options: ts.CompilerOptions) {}

  acquire(file: string, text: string): { key: string; role: ProjectSourceRole } {
    // Preserve all filename suffix distinctions, including declaration modes and
    // case. Directory-relative requests remain unresolved syntax in this value.
    const basename = path.basename(file), dot = basename.indexOf(".")
    const mode = dot < 0 ? basename : basename.slice(dot)
    const key = JSON.stringify([mode, createHash("sha256").update(text).digest("hex")])
    let entry = this.entries.get(key)
    if (!entry) {
      const parsed = projectSourceRole(file, text, this.options)
      const role = Object.freeze({ ...parsed,
        modules: Object.freeze(parsed.modules), references: Object.freeze(parsed.references),
        globals: Object.freeze({ ...parsed.globals, names: Object.freeze(parsed.globals.names) }),
        exports: Object.freeze({ ...parsed.exports, names: Object.freeze(parsed.exports.names),
          stars: Object.freeze(parsed.exports.stars) }) })
      entry = { role, references: 0 }
      this.entries.set(key, entry)
    }
    entry.references++
    return { key, role: entry.role }
  }

  release(key: string): void {
    const entry = this.entries.get(key)
    if (!entry || entry.references <= 0) throw new Error("Unpaired source role release")
    if (--entry.references === 0) this.entries.delete(key)
  }
}
