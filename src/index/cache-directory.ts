import os from "node:os"
import path from "node:path"

export interface CacheDirectoryOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
}

export function resolveIndexCacheDirectory(options: CacheDirectoryOptions = {}): string {
  const environment = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const paths = platform === "win32" ? path.win32 : path.posix
  const override = environment.ARKTS_INDEX_CACHE_DIR
  if (override) return paths.resolve(override)

  const homeDirectory = options.homeDirectory ?? os.homedir()
  if (platform === "darwin") {
    return paths.join(homeDirectory, "Library", "Caches", "arkts-language-server", "index")
  }
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA
      ?? paths.join(homeDirectory, "AppData", "Local")
    return paths.join(localAppData, "arkts-language-server", "index")
  }
  const cacheHome = environment.XDG_CACHE_HOME ?? paths.join(homeDirectory, ".cache")
  return paths.join(cacheHome, "arkts-language-server", "index")
}
