import { resolvedPathIdentity } from "../../project/path-identity.js"
import type { ProjectSourceRole } from "./project-source-role.js"
import type { ScopeDependencyEnvironment } from "./scope-dependency-environment.js"

interface InfluenceNode { readonly opaque: boolean; readonly role?: ProjectSourceRole; readonly sourceHash?: string; readonly edges: readonly string[] }

/** Only unchanged, already loaded SDK scripts with disjoint global binding domains
 * are order-independent. Merged/unknown domains keep the original importer roots. */
export function independentMandatoryGlobals(env: ScopeDependencyEnvironment,
  nodes: ReadonlyMap<string, InfluenceNode>, allowed: readonly string[], checkpoint: () => void): ReadonlySet<string> {
  if (!env.baselineInputs?.current(checkpoint)) return new Set()
  // The configuration capsule and SDK Registry have different source ownership.
  // Every actual baseline AST must also match a fresh load-owned source read.
  for (const [file, hash] of env.baselineSourceHashes) {
    checkpoint()
    if (nodes.get(file)?.sourceHash !== hash) return new Set()
  }
  const seen = new Set<string>(), queue = [...allowed, ...env.sdkRoots, ...env.baselineGlobals.keys()]
  const owners = new Map<string, string>()
  const shared = new Set<string>()
  for (let index = 0; index < queue.length; index++) {
    checkpoint()
    const file = resolvedPathIdentity(queue[index])
    if (seen.has(file)) continue
    seen.add(file)
    const node = nodes.get(file), globals = node?.role?.globals
    // The retained full SDK load proof includes its type/lib lookup namespace;
    // opaque project or newly introduced dependencies have no such coverage.
    if (!node || node.opaque || !globals?.complete || node.role?.opaque && !env.baselineGlobals.has(file)) return new Set()
    for (const name of globals.names) {
      const previous = owners.get(name)
      if (previous && previous !== file) shared.add(name)
      else owners.set(name, file)
    }
    queue.push(...node.edges)
  }
  const result = new Set<string>()
  for (const file of seen) {
    const globals = nodes.get(file)?.role?.globals
    if (env.baselineSdk.has(file) && globals?.plainDeclaration && globals.names.length
      && globals.names.every(name => !shared.has(name))) result.add(file)
  }
  return result
}
