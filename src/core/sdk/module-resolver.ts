import fs from "node:fs"
import path from "node:path"

export function harmonySdkModuleCandidates(
  sdkRoot: string,
  moduleSpecifier: string,
): string[] {
  if (!isHarmonySdkModuleSpecifier(moduleSpecifier)) return []
  if (moduleSpecifier.startsWith("@ohos.") || moduleSpecifier.startsWith("@system.")) {
    return [
      path.join(sdkRoot, "ets", "api", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "ets", "api", `${moduleSpecifier}.d.ets`),
      path.join(sdkRoot, "js", "api", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "js", "api", `${moduleSpecifier}.d.ets`),
    ]
  }
  if (moduleSpecifier.startsWith("@kit.")) {
    return [
      path.join(sdkRoot, "ets", "kits", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "ets", "kits", `${moduleSpecifier}.d.ets`),
    ]
  }
  if (moduleSpecifier.startsWith("@arkts.")) {
    return [
      path.join(sdkRoot, "ets", "arkts", `${moduleSpecifier}.d.ts`),
      path.join(sdkRoot, "ets", "arkts", `${moduleSpecifier}.d.ets`),
    ]
  }
  return []
}

export function isHarmonySdkModuleSpecifier(moduleSpecifier: string): boolean {
  return !moduleSpecifier.includes("/")
    && !moduleSpecifier.includes("\\")
    && (moduleSpecifier.startsWith("@ohos.")
      || moduleSpecifier.startsWith("@system.")
      || moduleSpecifier.startsWith("@kit.")
      || moduleSpecifier.startsWith("@arkts."))
}

export function resolveHarmonySdkModule(
  sdkRoot: string,
  moduleSpecifier: string,
): string | null {
  return harmonySdkModuleCandidates(sdkRoot, moduleSpecifier)
    .find((candidate) => fs.existsSync(candidate)) ?? null
}
