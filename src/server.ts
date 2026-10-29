import { createProductionLanguageServerServices } from "./composition/production-services.js"
import { runLanguageServer } from "./lsp/run-language-server.js"
import { resolveLogPath } from "./observability/log-path.js"
import { runCacheCommand } from "./index/cache-cli.js"

if (process.argv.includes("--index-cache")) {
  void runCacheCommand(process.argv.slice(2)).then(code => { process.exitCode = code }, error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
} else if (process.argv.includes("--print-log-path")) {
  process.stdout.write(`${resolveLogPath()}\n`)
} else {
  runLanguageServer(createProductionLanguageServerServices())
}
