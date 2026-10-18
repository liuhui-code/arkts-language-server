import path from "node:path"

/** Preserve ArkTS source priority; lookup policy owns its actual load witnesses. */
export function relativeModuleCandidate(
  base: string,
  isResident: (filePath: string) => boolean,
  isCandidateFile: (filePath: string) => boolean,
): string | undefined {
  const candidates = /(?:\.d\.(?:ets|ts)|\.ets|\.tsx?)$/u.test(base)
    ? [base]
    : [
        base + ".ets",
        base + ".ts",
        base + ".tsx",
        base + ".d.ets",
        base + ".d.ts",
        path.join(base, "index.ets"),
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
        path.join(base, "index.d.ets"),
        path.join(base, "index.d.ts"),
      ]
  return candidates.find(candidate => isResident(candidate) || isCandidateFile(candidate))
}
