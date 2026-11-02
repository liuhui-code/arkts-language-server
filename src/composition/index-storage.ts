import { prepareIndexCacheDirectory, snapshotIndexEnvironment } from "../index/cache-directory.js"
import { IndexCacheMaintenance } from "../index/cache-maintenance.js"
import type { StructuredLogger } from "../observability/logger.js"

/** One startup choice shared by every root and by maintenance; never switches a live cache. */
export function createIndexStorage(environment: NodeJS.ProcessEnv, logger: StructuredLogger) {
  const startupEnvironment = snapshotIndexEnvironment(environment)
  let directory: Promise<string> | undefined
  let maintenance: IndexCacheMaintenance | undefined
  let disposed = false
  return {
    directory(reportWarning: (message: string) => void): Promise<string> {
      if (disposed) return Promise.reject(new Error("Index storage was disposed"))
      directory ??= prepareIndexCacheDirectory({ env: startupEnvironment }).then(selected => {
        if (disposed) throw new Error("Index storage was disposed during startup")
        maintenance = new IndexCacheMaintenance(selected.directory, startupEnvironment, logger)
        logger.info("index.cache.directory.selected", { directory: selected.directory,
          requestedDirectory: selected.requestedDirectory, source: selected.source })
        if (selected.warning) reportWarning(selected.warning)
        return selected.directory
      }, error => {
        if (!disposed) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error("index.cache.directory.unavailable", { message })
          reportWarning(message)
        }
        throw error
      })
      return directory
    },
    start(): void { if (!disposed) maintenance?.start() },
    async dispose(): Promise<void> { disposed = true; await maintenance?.dispose() },
  }
}
