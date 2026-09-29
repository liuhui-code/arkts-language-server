import fs from "node:fs"
import path from "node:path"
import type { DocumentSnapshot } from "../../contracts/document.js"
import { referenceRootsMayOverlap, toFilePath } from "../semantic-worker-file-identity.js"
import { captureClassBindingInput, type CapturedClassBindingInput,
  type ClassBindingCaptureInput } from "./class-binding-input-snapshot.js"

export interface ReferenceInputSnapshot {
  readonly rootUri: string
  readonly rootRevision: number
  readonly configurationRevision: number
  readonly projectConfiguration: unknown
  readonly sdkConfiguration: unknown
  readonly sourceOverlays: ReferenceSourceOverlaySnapshot
}

/** Own revision fences and capture request input before asynchronous discovery. */
export class ReferenceInputState {
  readonly #rootRevisions = new Map<string, number>()
  #configurationRevision = 0

  configurationChanged(): void { this.#configurationRevision += 1 }

  changed(rootUri: string): readonly string[] {
    if (!this.#rootRevisions.has(rootUri)) this.#rootRevisions.set(rootUri, 0)
    const changedRoots: string[] = []
    for (const [knownRoot, revision] of this.#rootRevisions) {
      if (!referenceRootsMayOverlap(knownRoot, rootUri)) continue
      this.#rootRevisions.set(knownRoot, revision + 1)
      changedRoots.push(knownRoot)
    }
    return changedRoots
  }

  capture(rootUri: string, documents: Iterable<DocumentSnapshot>,
    projectConfiguration: unknown, sdkConfiguration: unknown): ReferenceInputSnapshot {
    if (!this.#rootRevisions.has(rootUri)) this.#rootRevisions.set(rootUri, 0)
    return Object.freeze({ rootUri, rootRevision: this.#rootRevisions.get(rootUri) ?? 0,
      configurationRevision: this.#configurationRevision,
      projectConfiguration, sdkConfiguration,
      sourceOverlays: captureReferenceSourceOverlays(documents),
    })
  }

  isCurrent(snapshot: ReferenceInputSnapshot): boolean {
    return (this.#rootRevisions.get(snapshot.rootUri) ?? 0) === snapshot.rootRevision
      && this.#configurationRevision === snapshot.configurationRevision
  }

  captureClassBindingInput(input: ClassBindingCaptureInput): CapturedClassBindingInput {
    return captureClassBindingInput(this, input)
  }

  clear(): void { this.#rootRevisions.clear() }
}

export interface ReferenceSourceOverlaySnapshot {
  readonly complete: boolean
  readonly hasOverlay: (filePath: string) => boolean
  readonly overlayPath: (physicalPath: string) => string | undefined
  readonly assertUnchanged: () => void
}

/** Capture presence, not semantic identity or competing-source absence. */
export function captureReferenceSourceOverlays(
  documents: Iterable<DocumentSnapshot>,
): ReferenceSourceOverlaySnapshot {
  const paths = new Map<string, string>()
  const physicalPaths = new Map<string, string>()
  let complete = true
  let identityChanged = false
  for (const document of documents) {
    const filePath = toFilePath(document.uri)
    const physicalPath = filePath && physicalOverlayPath(filePath)
    if (!filePath || !physicalPath) {
      complete = false
      continue
    }
    paths.set(filePath, physicalPath)
    const previous = physicalPaths.get(physicalPath)
    // Map insertion order cannot prove the Worker's latest effective alias.
    if (previous !== undefined && previous !== filePath) complete = false
    physicalPaths.set(physicalPath, filePath)
  }
  const assertIdentity = (filePath: string, physicalPath: string): void => {
    if (physicalOverlayPath(filePath) !== physicalPath) {
      identityChanged = true
      throw new Error("Reference overlay physical identity changed during source resolution")
    }
  }
  return Object.freeze({ complete,
    hasOverlay: (filePath: string) => {
      const physicalPath = paths.get(filePath)
      if (physicalPath === undefined) return false
      assertIdentity(filePath, physicalPath)
      return true
    },
    overlayPath: (physicalPath: string) => {
      const filePath = physicalPaths.get(physicalPath)
      if (filePath !== undefined) assertIdentity(filePath, physicalPath)
      return filePath
    },
    // Resolver catch blocks must not erase an already observed identity failure.
    assertUnchanged: () => {
      if (identityChanged) {
        throw new Error("Reference overlay physical identity changed during source resolution")
      }
    },
  })
}

function physicalOverlayPath(filePath: string): string | undefined {
  try {
    const physicalPath = fs.realpathSync.native(filePath)
    return fs.statSync(physicalPath).isFile() ? physicalPath : undefined
  } catch {
    try {
      // A dangling link or other existing object is not an unsaved new file.
      fs.lstatSync(filePath)
      return undefined
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined
    }
    try {
      return path.join(fs.realpathSync.native(path.dirname(filePath)), path.basename(filePath))
    } catch { return undefined }
  }
}
