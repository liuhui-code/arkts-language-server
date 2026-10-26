import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { build } from "esbuild"

export async function buildPathIdentityDriver(t, windows = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-path-driver-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const outfile = path.join(directory, "identity.cjs")
  await build({
    stdin: { contents: `
      export * from './src/index/workspace-uri-identity.ts';
      export * from './src/semantic/semantic-worker-uri.ts';
      export { isSemanticWorkerUriWithinRoot } from './src/semantic/semantic-worker-input-guards.ts';
      export { isInside } from './src/core/workspace/physical-path-identity.ts';
      export { containsResolvedPath } from './src/project/resolved-path-containment.ts';`,
      resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile,
    ...(windows ? {
      define: { "process.platform": '"win32"' },
      plugins: [{ name: "windows-standard-path-semantics", setup(build) {
        build.onResolve({ filter: /^node:(path|url)$/ }, args => args.namespace === "windows-standard"
          ? { path: args.path, external: true } : { path: args.path, namespace: "windows-standard" })
        build.onLoad({ filter: /.*/, namespace: "windows-standard" }, args => ({
          contents: args.path === "node:path"
            ? `import { win32 } from 'node:path'; export default win32;`
            : `import * as url from 'node:url';
               export const fileURLToPath = value => url.fileURLToPath(value, { windows: true });
               export const pathToFileURL = value => url.pathToFileURL(value, { windows: true });`,
        }))
      } }],
    } : {}),
  })
  return createRequire(import.meta.url)(outfile)
}
