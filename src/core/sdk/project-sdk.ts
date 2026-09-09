import fs from "node:fs"
import path from "node:path"

/*!
 * properties-file 5.0.7 — MIT License
 * Copyright (c) 2022 Nicolas Bouvrette
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { getProperties } from "properties-file"

import { discoverHarmonySdk, type HarmonySdkDiscovery } from "./discovery.js"
import { readSdkConfiguration } from "./configuration-reader.js"

export interface ProjectSdkSelection extends HarmonySdkDiscovery {
  source: "configuration" | "project" | "environment" | "default"
}

/** Select once per engine generation, never from the module-resolution request loop. */
export function discoverProjectSdk(
  workspaceRoot: string,
  fallback = process.env.ARKLINE_HARMONY_SDK_PATH,
  editorConfiguration?: unknown,
): ProjectSdkSelection {
  const configuredByEditor = editorSdkPath(editorConfiguration)
  if (configuredByEditor.status === "invalid") {
    return { ready: false, path: null, source: "configuration" }
  }
  if (configuredByEditor.status === "configured") {
    return {
      ...discoverHarmonySdk(configuredByEditor.path),
      source: "configuration",
    }
  }
  const configuration = path.join(workspaceRoot, "local.properties")
  const fallbackSelection = (): ProjectSdkSelection => ({
    ...discoverHarmonySdk(fallback), source: fallback?.trim() ? "environment" : "default",
  })
  try {
    const properties = getProperties(readSdkConfiguration(configuration))
    const configured = properties["sdk.dir"]
    if (configured === undefined) return fallbackSelection()
    if (!configured.trim()) return { ready: false, path: null, source: "project" }
    return { ...discoverHarmonySdk(path.resolve(workspaceRoot, configured)), source: "project" }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // open() reports ENOENT for both absent configuration and an existing
      // dangling link. Only the genuinely absent configuration permits fallback.
      try {
        fs.lstatSync(configuration)
      } catch (missing) {
        if ((missing as NodeJS.ErrnoException).code === "ENOENT") return fallbackSelection()
      }
    }
    return { ready: false, path: null, source: "project" }
  }
}

function editorSdkPath(configuration: unknown):
  | { status: "absent" }
  | { status: "configured"; path: string }
  | { status: "invalid" } {
  if (configuration === undefined) return { status: "absent" }
  if (configuration === null || typeof configuration !== "object" || Array.isArray(configuration)) {
    return { status: "invalid" }
  }
  if (!Object.prototype.hasOwnProperty.call(configuration, "path")) return { status: "absent" }
  const configured = (configuration as { path?: unknown }).path
  if (typeof configured !== "string" || !configured.trim() || !path.isAbsolute(configured)) {
    return { status: "invalid" }
  }
  return { status: "configured", path: configured }
}
