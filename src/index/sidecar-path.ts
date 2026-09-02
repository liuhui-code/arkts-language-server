import path from "node:path"

export interface SidecarPathOptions {
  sidecarPath?: string
  projectRoot?: string
  env?: NodeJS.ProcessEnv
}

export function resolveIndexSidecarPath(options: SidecarPathOptions = {}): string {
  const environment = options.env ?? process.env
  const explicit = options.sidecarPath ?? environment.ARKTS_INDEX_SIDECAR_PATH
  if (explicit) return path.resolve(explicit)

  const projectRoot = options.projectRoot
    ?? environment.ARKTS_LSP_HOME
    ?? path.resolve(__dirname, "..")
  const executable = process.platform === "win32"
    ? "arkts-index-sidecar.exe"
    : "arkts-index-sidecar"
  return path.join(projectRoot, "target", "release", executable)
}
