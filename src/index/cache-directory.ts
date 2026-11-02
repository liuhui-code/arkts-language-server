import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, open, rename, rmdir, unlink } from "node:fs/promises"

export interface CacheDirectoryOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
}

export function resolveIndexCacheDirectory(options: CacheDirectoryOptions = {}): string {
  const platform = options.platform ?? process.platform
  const environment = snapshotIndexEnvironment(options.env ?? process.env, platform)
  const paths = platform === "win32" ? path.win32 : path.posix
  const override = environment.ARKTS_INDEX_CACHE_DIR
  if (override) return paths.resolve(override)

  const homeDirectory = options.homeDirectory ?? os.homedir()
  if (platform === "darwin") {
    return paths.join(homeDirectory, "Library", "Caches", "arkts-language-server", "index")
  }
  if (platform === "win32") {
    return paths.join("D:\\", "arkts-language-server", "index")
  }
  const cacheHome = environment.XDG_CACHE_HOME ?? paths.join(homeDirectory, ".cache")
  return paths.join(cacheHome, "arkts-language-server", "index")
}

export interface PreparedIndexCacheDirectory {
  directory: string
  requestedDirectory: string
  source: "environment" | "windows-default" | "windows-fallback" | "platform-default"
  warning?: string
}

/** A plain-object copy must not lose Windows process.env's case-insensitive setting names. */
export function snapshotIndexEnvironment(environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const snapshot = { ...environment }
  if (platform === "win32") for (const key of Object.keys(environment)) {
    const canonical = key.toUpperCase()
    if (canonical.startsWith("ARKTS_INDEX_") || canonical === "LOCALAPPDATA" || canonical === "ARKTS_LSP_HOME") {
      snapshot[canonical] = environment[canonical] ?? environment[key]
      if (key !== canonical) delete snapshot[key]
    }
  }
  return snapshot
}

/** LSP startup preparation; the pure resolver above also serves readonly administration. */
export async function prepareIndexCacheDirectory(options: CacheDirectoryOptions = {},
  probe: (directory: string) => Promise<void> = probeWritableDirectory,
): Promise<PreparedIndexCacheDirectory> {
  const windows = (options.platform ?? process.platform) === "win32"
  const environment = snapshotIndexEnvironment(options.env ?? process.env, options.platform)
  const configured = Boolean(environment.ARKTS_INDEX_CACHE_DIR)
  const requestedDirectory = resolveIndexCacheDirectory({ ...options, env: environment })
  const selected: PreparedIndexCacheDirectory = { directory: requestedDirectory, requestedDirectory,
    source: configured ? "environment" : windows ? "windows-default" : "platform-default" }
  // Preserve ordinary non-Windows startup, including its existing deferred native open.
  if (!windows && !configured) return selected
  try {
    await probe(requestedDirectory)
    return selected
  } catch (error) {
    if (configured) throw unavailable(requestedDirectory, error, true)
    const localAppData = environment.LOCALAPPDATA?.trim() ? environment.LOCALAPPDATA
      : path.win32.join(options.homeDirectory ?? os.homedir(), "AppData", "Local")
    const fallback = path.win32.join(localAppData, "arkts-language-server", "index")
    try {
      await probe(fallback)
    } catch (fallbackError) {
      throw new Error(`${unavailable(requestedDirectory, error, false).message} `
        + `Profile fallback also unavailable: ${fallback} (${describeError(fallbackError)}).`, { cause: fallbackError })
    }
    return { directory: fallback, requestedDirectory, source: "windows-fallback",
      warning: `Default index directory ${requestedDirectory} is unavailable (${describeError(error)}); `
        + `using ${fallback}. Set ARKTS_INDEX_CACHE_DIR to choose another directory, then restart the language server.` }
  }
}

function unavailable(directory: string, error: unknown, configured: boolean): Error {
  return new Error(`Cannot use ${configured ? "configured" : "default"} index directory ${directory} `
    + `(${describeError(error)}). Workspace indexing is unavailable. `
    + "Set ARKTS_INDEX_CACHE_DIR to a writable directory and restart the language server.", { cause: error })
}

function describeError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code
  return `${code ? `${code}: ` : ""}${error instanceof Error ? error.message : String(error)}`
}

/** Owns only one fresh private probe directory; never touches an existing database or WAL. */
async function probeWritableDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  const temporary = await mkdtemp(path.join(directory, ".arkts-index-probe-"))
  let ownedFile: string | undefined
  try {
    const source = path.join(temporary, "write")
    const handle = await open(source, "wx")
    ownedFile = source
    try { await handle.writeFile("arkts-index-write-probe\n") }
    finally { await handle.close() }
    const target = path.join(temporary, "renamed")
    await rename(source, target)
    ownedFile = target
  } finally {
    try { if (ownedFile) await unlink(ownedFile) }
    finally { await rmdir(temporary) }
  }
}
