import path from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { createOfficialSemanticService } from "./backends/ohos-typescript/registry-pool.js"
import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticDocumentQuery, VersionedSemanticResult, SemanticDocumentSymbol } from "../contracts/semantic-engine.js"
import { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import { discoverProjectSdk } from "../core/sdk/project-sdk.js"
import { bindSdkTarget } from "../core/sdk/target-qualification.js"
import { arktsLanguageServiceOptions } from "../core/types/arkts-language-service-options.js"
import { CooperativeWork } from "../core/types/cooperative-work.js"
import { navigationSymbols, compareDocumentSymbols } from "../core/types/typescript-document-symbols.js"
import { createScriptRecord, type ScriptRecord } from "../core/types/typescript-script-record.js"
import { prospectiveRealPathSync } from "../core/types/typescript-source-boundary.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"
import { LoadedConfigurationWitness } from "../project/loaded-configuration-witness.js"
import { withRequestInputValidation } from "../project/request-input-validation.js"
import { toPublicDocumentSymbol } from "./legacy-result-mappers.js"

const unavailable = (): never => { throw new SemanticInputUnavailableError() }

/** One current syntax tree per workspace, never a semantic Program or source catalog. */
class SyntaxDocumentSymbolsOwner {
  private readonly resolver = new LocalPackageResolver()
  private readonly inputs = new LoadedConfigurationWitness()
  private readonly service: ts.LanguageService
  private script?: ScriptRecord
  private checkpoint: () => void = () => {}

  constructor(readonly root: string, sdk: unknown, project: unknown) {
    this.resolver.configureProject(project)
    this.resolver.enableConfigurationWitness()
    const target = this.resolver.projectFor(root).sdkTarget()
    const installation = discoverProjectSdk(root, process.env.ARKLINE_HARMONY_SDK_PATH, sdk, this.inputs)
    const selection = bindSdkTarget(installation, target, this.inputs)
    const options = arktsLanguageServiceOptions(selection.path, this.inputs)
    if (selection.targetQualification?.status === "compatible") {
      options.compatibleSdkVersion = selection.targetQualification.compatibleApi
    }
    this.service = createOfficialSemanticService({
      getCompilationSettings: () => options,
      getCurrentDirectory: () => root,
      getScriptFileNames: () => [],
      getScriptVersion: file => this.script?.path === file ? String(this.script.version) : "0",
      getScriptSnapshot: file => this.script?.path === file ? this.script.snapshot : undefined,
      getScriptKind: file => file.endsWith(".ets") ? ts.ScriptKind.ETS : ts.ScriptKind.TS,
      getDefaultLibFileName: () => unavailable(),
      getCancellationToken: () => ({
        isCancellationRequested: () => { this.checkpoint(); return false },
        throwIfCancellationRequested: () => this.checkpoint(),
      }),
      // Preserve actual parse-time fallback inputs if a compiler version needs them.
      fileExists: file => this.inputs.observePresence(file, () => ts.sys.fileExists(file)),
      readFile: file => this.inputs.observe(file, () => ts.sys.readFile(file)),
    }, selection, undefined, undefined, undefined, ts.LanguageServiceMode.Syntactic)
  }

  current(checkpoint: () => void): boolean {
    return Boolean(this.inputs.freshness(checkpoint, "capture")?.()
      && this.resolver.configurationFreshness(this.root, checkpoint, "capture")?.())
  }

  symbols(document: DocumentSnapshot, checkpoint: () => void): SemanticDocumentSymbol[] {
    this.checkpoint = checkpoint
    const work = new CooperativeWork(checkpoint)
    work.boundary()
    const filePath = path.resolve(fileURLToPath(document.uri))
    // Only the open overlay supplies bytes. Retain its original path identity;
    // disk contents and unrelated imports cannot replace the editor's snapshot.
    const paths = new LoadedConfigurationWitness()
    paths.observePath(this.root, () => prospectiveRealPathSync(this.root))
    paths.observePath(filePath, () => prospectiveRealPathSync(filePath))
    if (!paths.freshness(checkpoint, "capture")?.()) unavailable()
    if (this.script?.path !== filePath || this.script.sourceContent !== document.text) {
      this.script = createScriptRecord({ path: filePath, sourceContent: document.text,
        sourceFingerprint: createHash("sha256").update(document.text).digest("hex"), documentVersion: document.version, overlay: true, lastAccess: 0 }, this.script)
    }
    work.boundary()
    const tree = this.service.getNavigationTree(filePath)
    work.boundary()
    const symbols = navigationSymbols(tree.childItems ?? [], this.script, work)
    work.boundary()
    symbols.sort(work.comparator(compareDocumentSymbols))
    return work.finish(symbols.map(toPublicDocumentSymbol))
  }

  owns(uri: string): boolean { return this.script?.path === fileURLToPath(uri) }
  dispose(): void { this.service.dispose(); this.script = undefined }
}

/** Reuse parser state only with its actual original configuration/physical inputs. */
export class DocumentSymbolOperation {
  private readonly owners = new Map<string, SyntaxDocumentSymbolsOwner>()
  private sdk: unknown
  private project: unknown

  constructor(private readonly checkpoint: () => void) {}

  run(root: string, query: SemanticDocumentQuery): VersionedSemanticResult<SemanticDocumentSymbol[]> {
    const checkpoint = () => {
      this.checkpoint()
      if (query.signal?.aborted) throw query.signal.reason instanceof Error
        ? query.signal.reason : new Error("Semantic request cancelled")
    }
    checkpoint()
    let owner = this.owners.get(root)
    try {
      return withRequestInputValidation(() => {
        if (!owner) {
          owner = new SyntaxDocumentSymbolsOwner(root, this.sdk, this.project)
          this.owners.set(root, owner)
          // Match the existing project-model domain's four-workspace LRU bound.
          while (this.owners.size > 4) this.retire(this.owners.keys().next().value!)
        }
        if (!owner.current(checkpoint)) unavailable()
        this.owners.delete(root); this.owners.set(root, owner)
        const value = owner.symbols(query.document, checkpoint)
        // Includes facts added during this actual parse and lends them to the
        // independent final union; it does not renew any old loaded identity.
        if (!owner.current(checkpoint)) unavailable()
        return { documentVersion: query.document.version, value }
      }, unavailable)
    } catch (error) {
      this.retire(root)
      throw error
    }
  }

  configureSdk(sdk: unknown): void { this.dispose(); this.sdk = sdk }
  configureProject(project: unknown): void { this.dispose(); this.project = project }
  invalidate(root: string): void { this.retire(root) }
  close(uri: string): void {
    if (!uri.startsWith("file:")) return
    for (const [root, owner] of this.owners) if (owner.owns(uri)) this.retire(root)
  }
  dispose(): void { for (const root of this.owners.keys()) this.retire(root) }
  private retire(root: string): void {
    const owner = this.owners.get(root)
    this.owners.delete(root)
    owner?.dispose()
  }
}
