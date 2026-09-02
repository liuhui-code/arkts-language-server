import os from "node:os"
import path from "node:path"

const LOG_FILE_NAME = "server.log"

export function resolveLogPath(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = environment.ARKTS_LSP_LOG_DIR?.trim()
  if (override) return path.resolve(override, LOG_FILE_NAME)

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Logs", "arkts-language-server", LOG_FILE_NAME)
  }
  if (platform === "win32") {
    const localData = environment.LOCALAPPDATA?.trim()
      ? path.resolve(environment.LOCALAPPDATA)
      : path.join(os.homedir(), "AppData", "Local")
    return path.join(localData, "ArkTSLanguageServer", "logs", LOG_FILE_NAME)
  }
  const stateHome = environment.XDG_STATE_HOME?.trim()
    ? path.resolve(environment.XDG_STATE_HOME)
    : path.join(os.homedir(), ".local", "state")
  return path.join(stateHome, "arkts-language-server", LOG_FILE_NAME)
}
