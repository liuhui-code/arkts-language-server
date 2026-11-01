import path from "node:path"
import type { LoadedConfigurationWitness } from "./loaded-configuration-witness.js"
import { readHarmonyProfile } from "./harmony-profile-reader.js"

export interface HarmonySdkTarget {
  readonly status: "ready" | "unconfigured" | "unavailable"
  readonly product: string
  readonly compileSdkVersion?: number | string
  readonly compatibleSdkVersion?: number | string
  readonly targetSdkVersion?: number | string
  readonly runtimeOS?: string
  readonly reason?: string
}

/** Project selection owns build intent; interpreting SDK release aliases belongs to the SDK adapter. */
export function readHarmonySdkTarget(root: string, product: string | undefined,
  witness?: LoadedConfigurationWitness): HarmonySdkTarget {
  const invalid = (): HarmonySdkTarget => Object.freeze({ status: "unavailable", product: product ?? "default",
    reason: "project-sdk-context-unavailable" })
  if (!product) return invalid()
  const profile = readHarmonyProfile(path.join(root, "build-profile.json5"), witness)
  if (profile === undefined) return product === "default"
    ? Object.freeze({ status: "unconfigured", product }) : invalid()
  const app = record(profile?.app)
  if (!app || !Array.isArray(app.products) || app.products.length > 256) return invalid()
  const matches = app.products.filter(value => record(value)?.name === product)
  if (matches.length !== 1) return invalid()
  const selected = record(matches[0])!
  const result: Record<string, unknown> = { status: "ready", product }
  for (const field of ["compileSdkVersion", "compatibleSdkVersion", "targetSdkVersion"] as const) {
    const value = selected[field]
    if (value === undefined) continue
    if (typeof value === "number" ? !Number.isSafeInteger(value) || value < 1
      : typeof value !== "string" || !value.trim() || value.length > 128) return invalid()
    result[field] = value
  }
  if (selected.runtimeOS !== undefined) {
    if (typeof selected.runtimeOS !== "string" || !selected.runtimeOS.trim() || selected.runtimeOS.length > 128) return invalid()
    result.runtimeOS = selected.runtimeOS
  }
  return Object.freeze(result) as unknown as HarmonySdkTarget
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}
