import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { readSdkConfiguration } from "./configuration-reader.js"

export interface HarmonySdkIdentity {
  status: "identified" | "missing" | "invalid"
  metadataPath: string
  apiVersion?: string
  componentVersion?: string
  /** API metadata does not establish compatibility with an ArkTS language dialect. */
  dialectCompatibility: "unverified"
  declarationSupport: "typescript-compatible-only"
}

export interface HarmonySdkDiscovery {
  ready: boolean
  path: string | null
  identity?: HarmonySdkIdentity
}

export function discoverHarmonySdk(
  configured = process.env.ARKLINE_HARMONY_SDK_PATH,
): HarmonySdkDiscovery {
  const resolvedPath =
    configured && configured.trim().length > 0
      ? discoverConfiguredSdk(configured)
      : discoverDefaultSdk(process.platform)

  if (resolvedPath) {
    return {
      ready: true,
      path: resolvedPath,
      identity: discoverSdkIdentity(resolvedPath),
    }
  }

  return {
    ready: false,
    path: null,
  }
}

function discoverSdkIdentity(sdkRoot: string): HarmonySdkIdentity {
  const metadataPath = path.join(sdkRoot, "ets", "oh-uni-package.json")
  const boundary = { metadataPath, dialectCompatibility: "unverified", declarationSupport: "typescript-compatible-only" } as const
  try {
    const metadata: unknown = JSON.parse(readSdkConfiguration(metadataPath))
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { ...boundary, status: "invalid" }
    const record = metadata as Record<string, unknown>
    if (record.path !== "ets" || typeof record.apiVersion !== "string" || !/^[1-9]\d*$/.test(record.apiVersion)
      || typeof record.version !== "string" || !record.version.trim()) return { ...boundary, status: "invalid" }
    return { ...boundary, status: "identified", apiVersion: record.apiVersion, componentVersion: record.version }
  } catch (error) {
    return { ...boundary, status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "invalid" }
  }
}

export function defaultHarmonySdkCandidates(
  platform: NodeJS.Platform,
  homeDirectory = os.homedir(),
): string[] {
  if (platform === "darwin") {
    return [
      "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony",
      "/Applications/DevEco Studio.app/Contents/sdk/default/openharmony",
      path.join(homeDirectory, "Library", "Huawei", "Sdk", "default", "openharmony"),
    ]
  }

  return []
}

function discoverConfiguredSdk(configured: string | undefined): string | null {
  if (!configured || configured.trim().length === 0) {
    return null
  }

  return configuredSdkCandidates(configured).find((candidate) => isValidSdkRoot(candidate)) ?? null
}

function discoverDefaultSdk(platform: NodeJS.Platform): string | null {
  return defaultHarmonySdkCandidates(platform).find((candidate) => isValidSdkRoot(candidate)) ?? null
}

function isValidSdkRoot(rootPath: string): boolean {
  try {
    return [rootPath, path.join(rootPath, "ets"), path.join(rootPath, "toolchains")]
      .every((candidate) => fs.statSync(candidate).isDirectory())
  } catch {
    return false
  }
}

function configuredSdkCandidates(configured: string): string[] {
  const root = configured.trim().replace(/[\\/]+$/, "")
  return [
    root,
    `${root}/openharmony`,
    `${root}/default/openharmony`,
  ]
}
