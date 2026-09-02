import { runLanguageServer } from "./lsp/run-language-server.js"
import { resolveLogPath } from "./observability/log-path.js"

if (process.argv.includes("--print-log-path")) {
  process.stdout.write(`${resolveLogPath()}\n`)
} else {
  runLanguageServer()
}
