import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { ClassBindingDiscoveryQuery, ClassBindingSourceAvailability } from "../../contracts/class-binding-discovery.js"
import type { DocumentSnapshot, WorkspaceDescriptor } from "../../contracts/document.js"
import { SemanticWorkerSupervisorError } from "../semantic-worker-supervisor.js"
import type { ReferenceInputSnapshot, ReferenceInputState } from "./reference-input-snapshot.js"

export interface ClassBindingCaptureInput {
  readonly workspace: WorkspaceDescriptor
  readonly query: Omit<ClassBindingDiscoveryQuery, "overlays" | "sourceAvailability">
  readonly documents: Iterable<DocumentSnapshot>
  readonly projectConfiguration: unknown
  readonly sdkConfiguration: unknown
}

/** Standalone caller input; not ProjectGraph membership or constructor proof. */
export interface CapturedClassBindingInput {
  readonly workspace: Readonly<WorkspaceDescriptor>
  readonly query: ClassBindingDiscoveryQuery
  readonly inputs: ReferenceInputSnapshot
  /** Call before discovery IO and before accepting its result. */
  readonly assertCurrent: () => void
}

interface DirectoryWitness { readonly physicalPath: string; readonly token: string }
interface SourceWitness {
  readonly state: ClassBindingSourceAvailability["state"]
  readonly token: string
  readonly physicalPath?: string
}

export function captureClassBindingInput(
  owner: ReferenceInputState,
  input: ClassBindingCaptureInput,
): CapturedClassBindingInput {
  const workspace = Object.freeze({ ...input.workspace })
  // Clone failure is not a default configuration or an admitted snapshot.
  const projectConfiguration = freezeCopy(input.projectConfiguration)
  const sdkConfiguration = freezeCopy(input.sdkConfiguration)
  const documentUris = Object.freeze(Array.from(input.query.documentUris))
  const requested = new Set(documentUris)
  if (documentUris.length > 128 || requested.size !== documentUris.length
    || !requested.has(input.query.documentUri)) {
    throw new RangeError("Class binding capture requires a bounded unique requested set")
  }
  const rootPath = fileURLToPath(workspace.rootUri)
  const physicalRoot = directoryIdentity(rootPath)
  const candidates = new Map<string, string>()
  for (const uri of documentUris) {
    const source = inspectSource(rootPath, physicalRoot, uri, false)
    if (!source.physicalPath) continue
    if (candidates.has(source.physicalPath)) {
      throw new RangeError("Class binding capture requires unique physical candidates")
    }
    candidates.set(source.physicalPath, uri)
  }
  const overlays: DocumentSnapshot[] = []
  const overlayUris = new Set<string>()
  const overlayWitnesses: { uri: string; token: string }[] = []
  for (const document of input.documents) {
    const source = inspectSource(rootPath, physicalRoot, document.uri, true, true)
    const uri = requested.has(document.uri) ? document.uri
      : source.physicalPath && candidates.get(source.physicalPath)
    if (!uri) continue
    if (document.workspaceId !== workspace.id || overlayUris.has(uri)) {
      throw new RangeError("Class binding capture requires one authoritative workspace overlay")
    }
    overlayUris.add(uri)
    overlayWitnesses.push({ uri: document.uri, token: source.token })
    overlays.push(Object.freeze({ ...document, uri }))
  }
  const sources = documentUris.map(uri => inspectSource(rootPath, physicalRoot, uri, overlayUris.has(uri)))
  const sourceAvailability = Object.freeze(documentUris.map((uri, index) => Object.freeze({ uri,
    state: sources[index]!.state,
  })))
  const query = Object.freeze({ expectedGeneration: input.query.expectedGeneration,
    documentUris, documentUri: input.query.documentUri,
    classNamePosition: Object.freeze({ ...input.query.classNamePosition }),
    overlays: Object.freeze(overlays), sourceAvailability,
  })
  const inputs = owner.capture(workspace.rootUri, overlays, projectConfiguration, sdkConfiguration)
  return Object.freeze({ workspace, query, inputs, assertCurrent: () => {
    const currentRoot = directoryIdentity(rootPath)
    if (!owner.isCurrent(inputs) || currentRoot?.token !== physicalRoot?.token
      || documentUris.some((uri, index) => inspectSource(rootPath, currentRoot, uri,
        overlayUris.has(uri)).token !== sources[index]!.token)
      || overlayWitnesses.some(({ uri, token }) =>
        inspectSource(rootPath, currentRoot, uri, true, true).token !== token)) {
      throw new SemanticWorkerSupervisorError("content-modified")
    }
  } })
}

function inspectSource(rootPath: string, physicalRoot: DirectoryWitness | undefined,
  uri: string, hasOverlay: boolean, overlayAlias = false): SourceWitness {
  const unknown = { state: "unknown" as const, token: "unknown" }
  try {
    const filePath = fileURLToPath(uri)
    if (!physicalRoot || (!overlayAlias && !within(rootPath, filePath)
      && !within(physicalRoot.physicalPath, filePath))) return unknown
    const physicalParent = directoryIdentity(path.dirname(filePath))
    if (!physicalParent || !within(physicalRoot.physicalPath, physicalParent.physicalPath)) return unknown
    try {
      // A dangling link, directory or special file is not confirmed absence.
      const stat = fs.lstatSync(filePath, { bigint: true })
      return { state: stat.isFile() ? "present" : "unknown",
        ...(stat.isFile() ? { physicalPath: path.join(physicalParent.physicalPath, path.basename(filePath)) } : {}),
        token: `${physicalParent.token}|${stat.mode}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}` }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return unknown
      return { state: hasOverlay ? "present" : "absent", token: `${physicalParent.token}|missing`,
        physicalPath: path.join(physicalParent.physicalPath, path.basename(filePath)) }
    }
  } catch { return unknown }
}

function directoryIdentity(filePath: string): DirectoryWitness | undefined {
  try {
    const physicalPath = fs.realpathSync.native(filePath)
    const stat = fs.statSync(physicalPath, { bigint: true })
    if (!stat.isDirectory()) return undefined
    const lexical = fs.lstatSync(filePath, { bigint: true })
    return { physicalPath,
      token: `${physicalPath}|${stat.dev}:${stat.ino}|${lexical.mode}:${lexical.dev}:${lexical.ino}`
        + (lexical.isSymbolicLink() ? `:${lexical.ctimeNs}` : "") }
  } catch { return undefined }
}

function within(rootPath: string, candidate: string): boolean {
  const relative = path.relative(rootPath, candidate)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function freezeCopy(value: unknown): unknown {
  const owned = structuredClone(value)
  const seen = new WeakSet<object>()
  const freeze = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || seen.has(entry)) return
    seen.add(entry)
    for (const child of Object.values(entry)) freeze(child)
    Object.freeze(entry)
  }
  freeze(owned)
  return owned
}
