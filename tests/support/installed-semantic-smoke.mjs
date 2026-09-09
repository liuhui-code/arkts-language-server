import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"

import { applyTextEdits, applyWorkspaceEdit } from "./lsp-edits.mjs"
import { LspSession } from "./lsp-session.mjs"
import { materializeConformanceWorkspace } from "./materialize-conformance-workspace.mjs"

export async function assertInstalledSemanticSmoke({
  installedCommand,
  temporaryRoot,
  cwd,
  env = {},
  timeoutMs = 15_000,
}) {
  const materialized = await materializeConformanceWorkspace({ temporaryRoot })
  const reference = materialized.cases["profile.reference"]
  const typeDefinition = materialized.cases["profile.type-definition"]
  const definition = materialized.cases["profile.definition"]
  const implementationInterface = materialized.cases["implementation.interface"]
  const implementationInterfaceTarget = materialized.cases["implementation.interface-target"]
  const implementationAbstractClass = materialized.cases["implementation.abstract-class"]
  const implementationAbstractClassTarget = materialized.cases["implementation.abstract-class-target"]
  const barrel = materialized.cases["profile.barrel"]
  const importedReference = materialized.cases["profile.import"]
  const renameOrigin = materialized.cases["rename.origin"]
  const renameBarrel = materialized.cases["rename.barrel"]
  const renameConsumerImport = materialized.cases["rename.consumer-import"]
  const renameConsumerReference = materialized.cases["rename.consumer-reference"]
  const renameConflictOrigin = materialized.cases["rename.conflict-origin"]
  const completion = materialized.cases["completion.unicode"]
  const greeterDefinition = materialized.cases["greeter.definition"]
  const quickFix = materialized.cases["quickfix.greeting"]
  const signature = materialized.cases["signature.format-call"]
  const inlayType = materialized.cases["inlay-hint.type"]
  const inlayValue = materialized.cases["inlay-hint.value"]
  const inlayCount = materialized.cases["inlay-hint.count"]
  const documentSymbolPage = materialized.cases["document-symbol.arkui-page"]
  const documentSymbolTitle = materialized.cases["document-symbol.title"]
  const documentSymbolBuild = materialized.cases["document-symbol.build"]
  const resourceCompletion = materialized.cases["arkui.resource.completion"]
  const resourceDefinition = materialized.cases["arkui.resource.definition"]
  const missingResource = materialized.cases["arkui.resource.missing"]
  const builderWidth = materialized.cases["arkui.builder-tail.width"]
  const documentHighlight = materialized.cases["document-highlight.tracked"]
  const callHierarchyCallerDeclaration = materialized.cases[
    "call-hierarchy.caller-declaration"
  ]
  const callHierarchyCallerSelection = materialized.cases[
    "call-hierarchy.caller-selection"
  ]
  const callHierarchyTargetDeclaration = materialized.cases[
    "call-hierarchy.target-declaration"
  ]
  const callHierarchyTargetSelection = materialized.cases[
    "call-hierarchy.target-selection"
  ]
  const callHierarchyOutgoingCallsite = materialized.cases[
    "call-hierarchy.outgoing-callsite"
  ]
  const callHierarchyIncomingCallsite = materialized.cases[
    "call-hierarchy.incoming-callsite"
  ]
  const arkuiSdkScenarios = [
    {
      label: "Entry",
      prefix: "Ent",
      kind: CompletionItemKind.Variable,
      completion: materialized.cases["arkui.sdk-completion.entry"],
      usage: materialized.cases["arkui.decorator.entry"],
      definitionAnchor: "declare const Entry",
      hoverPattern: /const Entry: \(target: object\) => void/,
    },
    {
      label: "Component",
      prefix: "Com",
      kind: CompletionItemKind.Variable,
      completion: materialized.cases["arkui.sdk-completion.component"],
      usage: materialized.cases["arkui.decorator.component"],
      definitionAnchor: "declare const Component",
      hoverPattern: /const Component: \(target: object\) => void/,
    },
    {
      label: "State",
      prefix: "Sta",
      kind: CompletionItemKind.Variable,
      completion: materialized.cases["arkui.sdk-completion.state"],
      usage: materialized.cases["arkui.decorator.state"],
      definitionAnchor: "declare const State",
      hoverPattern: /const State: \(target: object, propertyKey: string\) => void/,
    },
    {
      label: "Column",
      prefix: "Col",
      kind: CompletionItemKind.Function,
      completion: materialized.cases["arkui.sdk-completion.column"],
      usage: materialized.cases["arkui.component.column"],
      definitionAnchor: "declare function Column",
      hoverPattern: /function Column\(\): ColumnAttribute/,
    },
    {
      label: "Text",
      prefix: "Te",
      kind: CompletionItemKind.Function,
      completion: materialized.cases["arkui.sdk-completion.text"],
      usage: materialized.cases["arkui.component.text"],
      definitionAnchor: "declare function Text",
      hoverPattern: /function Text\(value: string\): TextAttribute/,
    },
  ]
  assert.ok(signature, "the installed-artifact corpus must expose signature.format-call")
  assert.ok(
    inlayType && inlayValue && inlayCount,
    "the installed-artifact corpus must expose type and parameter inlay hints",
  )
  assert.ok(typeDefinition, "the installed-artifact corpus must expose profile.type-definition")
  assert.ok(
    implementationInterface
      && implementationInterfaceTarget
      && implementationAbstractClass
      && implementationAbstractClassTarget,
    "the installed-artifact corpus must expose interface and abstract-class implementations",
  )
  assert.ok(
    documentSymbolPage && documentSymbolTitle && documentSymbolBuild,
    "the installed-artifact corpus must expose the ArkUI document-symbol hierarchy",
  )
  assert.ok(
    resourceCompletion && resourceDefinition && missingResource && builderWidth,
    "the installed-artifact corpus must expose ArkUI resource and builder-tail probes",
  )
  assert.ok(
    arkuiSdkScenarios.every(({ completion: sdkCompletion, usage }) => sdkCompletion && usage),
    "the installed-artifact corpus must expose ArkUI SDK completion and usage probes",
  )
  assert.ok(
    documentHighlight,
    "the installed-artifact corpus must expose the document-highlight probe",
  )
  assert.ok(
    callHierarchyCallerDeclaration
      && callHierarchyCallerSelection
      && callHierarchyTargetDeclaration
      && callHierarchyTargetSelection
      && callHierarchyOutgoingCallsite
      && callHierarchyIncomingCallsite,
    "the installed-artifact corpus must expose the call-hierarchy traversal probes",
  )
  const consumerSource = fs.readFileSync(fileURLToPath(reference.uri), "utf8")
  const definitionSource = fs.readFileSync(fileURLToPath(definition.uri), "utf8")
  const implementationContractsSource = fs.readFileSync(
    fileURLToPath(implementationInterface.uri),
    "utf8",
  )
  const implementationTargetsSource = fs.readFileSync(
    fileURLToPath(implementationInterfaceTarget.uri),
    "utf8",
  )
  const barrelSource = fs.readFileSync(fileURLToPath(barrel.uri), "utf8")
  const renameConflictSource = fs.readFileSync(fileURLToPath(renameConflictOrigin.uri), "utf8")
  const homeSource = fs.readFileSync(fileURLToPath(completion.uri), "utf8")
  const greeterSource = fs.readFileSync(fileURLToPath(greeterDefinition.uri), "utf8")
  const quickFixSource = fs.readFileSync(fileURLToPath(quickFix.uri), "utf8")
  const signatureSource = fs.readFileSync(fileURLToPath(signature.uri), "utf8")
  const inlaySource = fs.readFileSync(fileURLToPath(inlayType.uri), "utf8")
  const documentSymbolSource = fs.readFileSync(fileURLToPath(documentSymbolPage.uri), "utf8")
  const formattingSource = documentSymbolSource
    .replace("Text(this.title)", "Text( this.title )")
    .replace('.width("100%")', '.width( "100%" )    ')
  assert.notEqual(formattingSource, documentSymbolSource)
  const resourcePageSource = fs.readFileSync(fileURLToPath(resourceCompletion.uri), "utf8")
  const builderPageSource = fs.readFileSync(fileURLToPath(builderWidth.uri), "utf8")
  const documentHighlightSource = fs.readFileSync(fileURLToPath(documentHighlight.uri), "utf8")
  const callHierarchyCallerSource = fs.readFileSync(
    fileURLToPath(callHierarchyCallerDeclaration.uri),
    "utf8",
  )
  const callHierarchyTargetSource = fs.readFileSync(
    fileURLToPath(callHierarchyTargetDeclaration.uri),
    "utf8",
  )
  const symbolKindsPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "SymbolKinds.ets",
  )
  const symbolKindsUri = pathToFileURL(symbolKindsPath).href
  const symbolKindsSource = fs.readFileSync(symbolKindsPath, "utf8")
  const negotiatedSymbolKinds = [
    { name: "InstalledSymbolReady", modernKind: 22, legacyKind: 10 },
    { name: "InstalledSymbolType", modernKind: 26, legacyKind: 13 },
    { name: "InstalledSymbolStruct", modernKind: 23, legacyKind: 5 },
  ].map((scenario) => ({
    ...scenario,
    range: rangeInAnchor(symbolKindsSource, scenario.name, scenario.name),
  }))
  const arkuiSdkCompletionUri = arkuiSdkScenarios[0].completion.uri
  const arkuiSdkCompletionSource = fs.readFileSync(
    fileURLToPath(arkuiSdkCompletionUri),
    "utf8",
  )
  const resourcePath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "resources",
    "base",
    "element",
    "string.json",
  )
  const resourceUri = pathToFileURL(resourcePath).href
  const resourceSource = fs.readFileSync(resourcePath, "utf8")
  const sdkPath = path.join(
    materialized.corpusRoot,
    "sdk",
    "openharmony",
    "ets",
    "component",
    "arkui.d.ts",
  )
  const sdkUri = pathToFileURL(sdkPath).href
  const sdkSource = fs.readFileSync(sdkPath, "utf8")
  assert.equal(textInRange(consumerSource, reference.range), "Profile")
  assert.equal(textInRange(consumerSource, importedReference.range), "Profile")
  assert.equal(textInRange(barrelSource, barrel.range), "Profile")
  assert.equal(textInRange(definitionSource, definition.range), "Profile")
  assert.equal(renameOrigin.uri, definition.uri)
  assert.equal(renameBarrel.uri, barrel.uri)
  assert.equal(renameConsumerImport.uri, reference.uri)
  assert.equal(renameConsumerReference.uri, reference.uri)
  assert.equal(textInRange(definitionSource, renameOrigin.range), "Profile")
  assert.equal(textInRange(barrelSource, renameBarrel.range), "Profile")
  assert.equal(textInRange(consumerSource, renameConsumerImport.range), "Profile")
  assert.equal(textInRange(consumerSource, renameConsumerReference.range), "Profile")
  assert.equal(textInRange(renameConflictSource, renameConflictOrigin.range), "Profile")
  const referenceLine = consumerSource.split("\n")[reference.range.start.line]
  const referencePrefix = referenceLine.slice(0, reference.range.start.character)
  assert.match(referencePrefix, /😀/)
  assert.equal(
    referencePrefix.length - Array.from(referencePrefix).length,
    1,
    "the hover reference marker must use UTF-16 code units after its emoji prefix",
  )
  assert.equal(textInRange(homeSource, completion.range), "Gree")
  const completionLine = homeSource.split("\n")[completion.range.start.line]
  const completionPrefix = completionLine.slice(0, completion.range.start.character)
  assert.match(completionPrefix, /😀/)
  assert.equal(
    completionPrefix.length - Array.from(completionPrefix).length,
    1,
    "the completion marker must use UTF-16 code units after its emoji prefix",
  )
  assert.equal(textInRange(quickFixSource, quickFix.range), "greting")
  assert.equal(resourceCompletion.uri, resourceDefinition.uri)
  assert.equal(resourceCompletion.uri, missingResource.uri)
  assert.equal(textInRange(resourcePageSource, resourceCompletion.range), "ti")
  assert.deepEqual(resourceCompletion.position, resourceCompletion.range.end)
  assert.equal(textInRange(resourcePageSource, resourceDefinition.range), "title")
  assert.equal(textInRange(resourcePageSource, missingResource.range), "missing_title")
  assert.equal(textInRange(builderPageSource, builderWidth.range), "width")
  assert.equal(textInRange(documentHighlightSource, documentHighlight.range), "tracked")
  assert.equal(
    textInRange(callHierarchyCallerSource, callHierarchyCallerSelection.range),
    "artifactCaller",
  )
  assert.equal(
    textInRange(callHierarchyTargetSource, callHierarchyTargetSelection.range),
    "artifactTarget",
  )
  assert.deepEqual(callHierarchyOutgoingCallsite.range, callHierarchyIncomingCallsite.range)
  assert.equal(
    textInRange(callHierarchyCallerSource, callHierarchyOutgoingCallsite.range),
    "artifactTarget",
  )
  for (const [label, source, range] of [
    ["caller selection", callHierarchyCallerSource, callHierarchyCallerSelection.range],
    ["target selection", callHierarchyTargetSource, callHierarchyTargetSelection.range],
    ["call site", callHierarchyCallerSource, callHierarchyOutgoingCallsite.range],
  ]) {
    const line = source.split("\n")[range.start.line]
    const prefix = line.slice(0, range.start.character)
    assert.match(prefix, /😀/, `${label} must follow an emoji prefix`)
    assert.equal(
      prefix.length - Array.from(prefix).length,
      1,
      `${label} must be measured in UTF-16 code units`,
    )
  }
  assert.deepEqual(
    negotiatedSymbolKinds.map(({ name }) => name),
    ["InstalledSymbolReady", "InstalledSymbolType", "InstalledSymbolStruct"],
  )
  for (const scenario of arkuiSdkScenarios) {
    assert.equal(scenario.completion.uri, arkuiSdkCompletionUri)
    assert.deepEqual(scenario.completion.position, scenario.completion.range.end)
    assert.equal(
      textInRange(arkuiSdkCompletionSource, scenario.completion.range),
      scenario.prefix,
    )
    assert.equal(scenario.usage.uri, documentSymbolPage.uri)
    assert.equal(textInRange(documentSymbolSource, scenario.usage.range), scenario.label)
  }
  const signatureLine = signatureSource.split("\n")[signature.position.line]
  const signaturePrefix = signatureLine.slice(0, signature.position.character)
  assert.match(signaturePrefix, /😀/)
  assert.equal(
    signaturePrefix.length - Array.from(signaturePrefix).length,
    1,
    "the signature marker must use UTF-16 code units after its emoji prefix",
  )
  assert.equal(inlayType.uri, inlayValue.uri)
  assert.equal(inlayType.uri, inlayCount.uri)
  const inlayLine = inlaySource.split("\n")[inlayType.position.line]
  const inlayPrefix = inlayLine.slice(0, inlayType.position.character)
  assert.match(inlayPrefix, /😀/)
  assert.equal(
    inlayPrefix.length - Array.from(inlayPrefix).length,
    1,
    "the inlay hint marker must use UTF-16 code units after its emoji prefix",
  )
  const titleLine = documentSymbolSource.split("\n")[documentSymbolTitle.range.start.line]
  const titlePrefix = titleLine.slice(0, documentSymbolTitle.range.start.character)
  assert.match(titlePrefix, /😀/)
  assert.equal(
    titlePrefix.length - Array.from(titlePrefix).length,
    1,
    "the document-symbol marker must use UTF-16 code units after its emoji prefix",
  )
  const externalCwd = cwd ?? path.join(temporaryRoot, "semantic-external-cwd")
  fs.mkdirSync(externalCwd, { recursive: true })
  const modernSymbolKinds = Array.from({ length: 26 }, (_, index) => index + 1)
  const session = new LspSession({
    command: installedCommand,
    args: ["--stdio"],
    cwd: externalCwd,
    env: {
      ...env,
      HOME: env.HOME ?? path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_INDEX_SIDECAR_PATH: "",
      ARKTS_INDEX_CACHE_DIR: path.join(materialized.root, "index-cache"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      workspace: {
        workspaceEdit: {
          documentChanges: true,
          failureHandling: "transactional",
        },
        symbol: { symbolKind: { valueSet: modernSymbolKinds } },
      },
      textDocument: {
        documentHighlight: { dynamicRegistration: false },
        formatting: { dynamicRegistration: false },
        foldingRange: {
          dynamicRegistration: false,
          lineFoldingOnly: true,
          rangeLimit: 2,
          foldingRangeKind: { valueSet: ["comment", "imports", "region"] },
        },
        publishDiagnostics: { versionSupport: true },
        hover: { contentFormat: ["markdown"] },
        rename: { prepareSupport: true },
        signatureHelp: { contextSupport: true },
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
          symbolKind: { valueSet: modernSymbolKinds },
        },
        codeAction: {
          codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix"] } },
          dataSupport: true,
          resolveSupport: { properties: ["edit"] },
        },
      },
      window: { workDoneProgress: true },
    },
  })
  let workspaceSymbolKindUriNameRange
  const verifiedClaims = []

  try {
    const initialized = await session.initialize({ timeoutMs })
    assert.deepEqual(initialized.result.capabilities.textDocumentSync, {
      openClose: true,
      change: 2,
    })
    assert.equal(initialized.result.capabilities.completionProvider.resolveProvider, true)
    assert.equal(initialized.result.capabilities.hoverProvider, true)
    assert.equal(initialized.result.capabilities.implementationProvider, true)
    assert.equal(initialized.result.capabilities.inlayHintProvider, true)
    assert.equal(initialized.result.capabilities.referencesProvider, true)
    assert.deepEqual(initialized.result.capabilities.renameProvider, {
      prepareProvider: true,
    })
    assert.deepEqual(initialized.result.capabilities.signatureHelpProvider, {
      triggerCharacters: ["(", ",", "<"],
      retriggerCharacters: [")"],
    })
    assert.equal(initialized.result.capabilities.documentSymbolProvider, true)
    assert.equal(initialized.result.capabilities.documentHighlightProvider, true)
    assert.equal(initialized.result.capabilities.documentFormattingProvider, true)
    assert.equal(initialized.result.capabilities.foldingRangeProvider, true)
    assert.equal(initialized.result.capabilities.callHierarchyProvider, true)
    assert.deepEqual(initialized.result.capabilities.codeActionProvider, {
      codeActionKinds: ["quickfix"],
      resolveProvider: true,
    })
    const create = await session.transport.serverRequest(
      "window/workDoneProgress/create",
      () => true,
      timeoutMs,
    )
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    const catalogReady = await session.transport.progress(
      create.params.token,
      (message) => message.params.value.kind === "report"
        && message.params.value.percentage === 100,
      timeoutMs,
    )
    assert.match(catalogReady.params.value.message, /^Indexed \d+\/\d+ files; skipped \d+ entries$/)
    await session.transport.progress(
      create.params.token,
      (message) => message.params.value.kind === "end",
      timeoutMs,
    )

    const callHierarchyRootUri = pathToFileURL(materialized.workspaceRoot).href
    const callHierarchyData = {
      arktsCallHierarchy: {
        protocol: 1,
        rootUri: callHierarchyRootUri,
      },
    }
    const openedCallHierarchyUris = new Set()
    session.openDocument({
      uri: callHierarchyCallerDeclaration.uri,
      languageId: "arkts",
      version: 1,
      text: callHierarchyCallerSource,
    })
    openedCallHierarchyUris.add(callHierarchyCallerDeclaration.uri)
    const preparedCallHierarchy = await session.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri: callHierarchyCallerDeclaration.uri },
      position: midpoint(callHierarchyCallerSelection.range),
    }, { timeoutMs })
    assert.equal(
      preparedCallHierarchy.error,
      undefined,
      JSON.stringify(preparedCallHierarchy.error),
    )
    assert.deepEqual(preparedCallHierarchy.result, [{
      name: "artifactCaller",
      kind: 12,
      uri: callHierarchyCallerDeclaration.uri,
      range: callHierarchyCallerDeclaration.range,
      selectionRange: callHierarchyCallerSelection.range,
      data: callHierarchyData,
    }])

    const outgoingCallHierarchy = await session.request("callHierarchy/outgoingCalls", {
      item: preparedCallHierarchy.result[0],
    }, { timeoutMs })
    assert.equal(
      outgoingCallHierarchy.error,
      undefined,
      JSON.stringify(outgoingCallHierarchy.error),
    )
    assert.deepEqual(outgoingCallHierarchy.result, [{
      to: {
        name: "artifactTarget",
        kind: 12,
        uri: callHierarchyTargetDeclaration.uri,
        range: callHierarchyTargetDeclaration.range,
        selectionRange: callHierarchyTargetSelection.range,
        data: callHierarchyData,
      },
      fromRanges: [callHierarchyOutgoingCallsite.range],
    }])

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: callHierarchyCallerDeclaration.uri } },
    })
    openedCallHierarchyUris.delete(callHierarchyCallerDeclaration.uri)
    const incomingCallHierarchy = await session.request("callHierarchy/incomingCalls", {
      item: outgoingCallHierarchy.result[0].to,
    }, { timeoutMs })
    assert.equal(
      incomingCallHierarchy.error,
      undefined,
      JSON.stringify(incomingCallHierarchy.error),
    )
    assert.deepEqual(incomingCallHierarchy.result, [{
      from: {
        name: "artifactCaller",
        kind: 12,
        uri: callHierarchyCallerDeclaration.uri,
        range: callHierarchyCallerDeclaration.range,
        selectionRange: callHierarchyCallerSelection.range,
        data: callHierarchyData,
      },
      fromRanges: [callHierarchyIncomingCallsite.range],
    }])
    assert.equal(
      openedCallHierarchyUris.has(callHierarchyCallerDeclaration.uri),
      false,
      "the installed incoming traversal must discover its caller while the caller is unopened",
    )
    verifiedClaims.push(
      "call-hierarchy.artifact.immutable-prepare-outgoing-incoming-unopened-utf16",
    )

    session.openDocument({
      uri: inlayType.uri,
      languageId: "arkts",
      version: 1,
      text: inlaySource,
    })
    const expectedInlayHints = [
      {
        position: inlayType.position,
        label: ": string",
        kind: 1,
        paddingLeft: true,
      },
      {
        position: inlayValue.position,
        label: "value:",
        kind: 2,
        paddingRight: true,
      },
      {
        position: inlayCount.position,
        label: "count:",
        kind: 2,
        paddingRight: true,
      },
    ]
    const inlayResponse = await session.request("textDocument/inlayHint", {
      textDocument: { uri: inlayType.uri },
      range: {
        start: { line: inlayType.position.line, character: 0 },
        end: { line: inlayType.position.line, character: inlayLine.length },
      },
    }, { timeoutMs })
    assert.equal(inlayResponse.error, undefined, JSON.stringify(inlayResponse.error))
    assert.deepEqual(inlayResponse.result, expectedInlayHints)
    const repeatedInlayResponse = await session.request("textDocument/inlayHint", {
      textDocument: { uri: inlayType.uri },
      range: {
        start: { line: inlayType.position.line, character: 0 },
        end: { line: inlayType.position.line, character: inlayLine.length },
      },
    }, { timeoutMs })
    assert.deepEqual(repeatedInlayResponse.result, expectedInlayHints)
    assert.equal(
      new Set(repeatedInlayResponse.result.map((hint) => JSON.stringify(hint))).size,
      repeatedInlayResponse.result.length,
      "installed inlay hints must be stable and unique",
    )
    const parameterOnlyInlayResponse = await session.request("textDocument/inlayHint", {
      textDocument: { uri: inlayType.uri },
      range: {
        start: inlayValue.position,
        end: { ...inlayCount.position, character: inlayCount.position.character + 1 },
      },
    }, { timeoutMs })
    assert.deepEqual(parameterOnlyInlayResponse.result, expectedInlayHints.slice(1))

    const changedInlaySource = inlaySource.replace(
      "function inlayFormat(value: string, count: number): string {\n  return value.repeat(count)",
      "function inlayFormat(value: string, count: number): number {\n  return count",
    )
    session.changeDocument({
      uri: inlayType.uri,
      version: 2,
      text: changedInlaySource,
    })
    const changedInlayResponse = await session.request("textDocument/inlayHint", {
      textDocument: { uri: inlayType.uri },
      range: {
        start: { line: inlayType.position.line, character: 0 },
        end: inlayValue.position,
      },
    }, { timeoutMs })
    assert.deepEqual(changedInlayResponse.result, [{
      position: inlayType.position,
      label: ": number",
      kind: 1,
      paddingLeft: true,
    }])
    verifiedClaims.push(
      "inlay-hint.artifact.immutable-arkui-lowering-parameter-type-range-utf16-overlay",
    )
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: inlayType.uri } },
    })

    const highlightRanges = rangesOf(documentHighlightSource, "tracked")
    assert.deepEqual(highlightRanges.map(({ start }) => start.character), [20, 9, 19, 33])
    assert.deepEqual(documentHighlight.range, highlightRanges[3])
    session.openDocument({
      uri: documentHighlight.uri,
      languageId: "arkts",
      version: 7,
      text: documentHighlightSource,
    })
    const highlightResponse = await session.request("textDocument/documentHighlight", {
      textDocument: { uri: documentHighlight.uri },
      position: midpoint(documentHighlight.range),
    }, { timeoutMs })
    assert.equal(highlightResponse.error, undefined, JSON.stringify(highlightResponse.error))
    assert.deepEqual(highlightResponse.result, [
      { range: highlightRanges[0], kind: 3 },
      { range: highlightRanges[1], kind: 3 },
      { range: highlightRanges[2], kind: 2 },
      { range: highlightRanges[3], kind: 2 },
    ])
    assert.equal(
      new Set(highlightResponse.result.map(({ range }) => JSON.stringify(range))).size,
      highlightResponse.result.length,
      "installed document highlights must be unique",
    )
    verifiedClaims.push("document-highlight.artifact.immutable-versioned-write-read-ranges")
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: documentHighlight.uri } },
    })

    const availableArkuiFolds = [
      lineRange(documentSymbolSource, "struct ArkuiPage {", "}"),
      lineRange(documentSymbolSource, "build() {", "  }"),
      lineRange(documentSymbolSource, "Column() {", "    }"),
    ]
    assert.equal(availableArkuiFolds.length, 3)
    session.openDocument({
      uri: documentSymbolPage.uri,
      languageId: "arkts",
      version: 1,
      text: documentSymbolSource,
    })
    const foldingResponse = await session.request("textDocument/foldingRange", {
      textDocument: { uri: documentSymbolPage.uri },
    }, { timeoutMs })
    assert.equal(foldingResponse.error, undefined, JSON.stringify(foldingResponse.error))
    assert.deepEqual(
      foldingResponse.result,
      availableArkuiFolds.slice(0, 2),
      "installed folding ranges must honor the client's rangeLimit in source order",
    )
    assert.ok(foldingResponse.result.every(({ startCharacter, endCharacter }) => (
      startCharacter === undefined && endCharacter === undefined
    )), "installed folding ranges must honor lineFoldingOnly")
    verifiedClaims.push(
      "folding-range.artifact.immutable-client-options-line-only-range-limit",
    )
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: documentSymbolPage.uri } },
    })

    const formattingDiagnosticsV8 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === documentSymbolPage.uri
        && message.params.version === 8,
      timeoutMs,
    )
    session.openDocument({
      uri: documentSymbolPage.uri,
      languageId: "arkts",
      version: 8,
      text: formattingSource,
    })
    assert.deepEqual((await formattingDiagnosticsV8).params.diagnostics, [])
    const formattingResponse = await session.request("textDocument/formatting", {
      textDocument: { uri: documentSymbolPage.uri },
      options: { tabSize: 2, insertSpaces: true, trimTrailingWhitespace: true },
    }, { timeoutMs })
    assert.equal(formattingResponse.error, undefined, JSON.stringify(formattingResponse.error))
    assert.ok(Array.isArray(formattingResponse.result))
    assert.ok(formattingResponse.result.length > 0)
    const formattedArkuiPage = applyTextEdits(formattingSource, formattingResponse.result)
    assert.equal(formattedArkuiPage, documentSymbolSource)

    const formattingDiagnosticsV9 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === documentSymbolPage.uri
        && message.params.version === 9,
      timeoutMs,
    )
    session.changeDocument({
      uri: documentSymbolPage.uri,
      version: 9,
      text: formattedArkuiPage,
    })
    assert.deepEqual((await formattingDiagnosticsV9).params.diagnostics, [])
    const formattedWidthRange = rangeInAnchor(
      formattedArkuiPage,
      '.width("100%")',
      "width",
    )
    const formattedWidthDefinition = await session.request("textDocument/definition", {
      textDocument: { uri: documentSymbolPage.uri },
      position: midpoint(formattedWidthRange),
    }, { timeoutMs })
    assert.equal(
      formattedWidthDefinition.error,
      undefined,
      JSON.stringify(formattedWidthDefinition.error),
    )
    assert.deepEqual(
      normalizeLocations(formattedWidthDefinition.result).filter(({ uri }) => uri === sdkUri),
      [{
        uri: sdkUri,
        range: rangeInAnchor(sdkSource, "width(value: ArkUILength)", "width"),
      }],
    )
    const repeatedFormatting = await session.request("textDocument/formatting", {
      textDocument: { uri: documentSymbolPage.uri },
      options: { tabSize: 2, insertSpaces: true, trimTrailingWhitespace: true },
    }, { timeoutMs })
    assert.equal(repeatedFormatting.error, undefined, JSON.stringify(repeatedFormatting.error))
    assert.deepEqual(repeatedFormatting.result, [])
    verifiedClaims.push(
      "document-formatting.artifact.immutable-edits-apply-idempotent-semantics",
    )
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: documentSymbolPage.uri } },
    })

    const consumerDiagnostics = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === reference.uri && message.params.version === 1,
      timeoutMs,
    )
    session.openDocument({
      uri: reference.uri,
      languageId: "arkts",
      version: 1,
      text: consumerSource,
    })
    const published = await consumerDiagnostics
    assert.equal(published.params.version, 1)
    assert.deepEqual(published.params.diagnostics, [])

    const definitionResponse = await session.request("textDocument/definition", {
      textDocument: { uri: reference.uri },
      position: midpoint(reference.range),
    }, { timeoutMs })
    assert.equal(definitionResponse.error, undefined, JSON.stringify(definitionResponse.error))
    const locations = definitionResponse.result === null
      ? []
      : Array.isArray(definitionResponse.result)
        ? definitionResponse.result
        : [definitionResponse.result]
    assert.deepEqual(locations, [{ uri: definition.uri, range: definition.range }])
    assert.notDeepEqual(locations[0].range.start, locations[0].range.end)
    assert.equal(textInRange(definitionSource, locations[0].range), "Profile")

    assert.equal(textInRange(consumerSource, typeDefinition.range), "profile")
    const typeDefinitionResponse = await session.request("textDocument/typeDefinition", {
      textDocument: { uri: typeDefinition.uri },
      position: midpoint(typeDefinition.range),
    }, { timeoutMs })
    assert.equal(
      typeDefinitionResponse.error,
      undefined,
      JSON.stringify(typeDefinitionResponse.error),
    )
    assert.deepEqual(normalizeLocations(typeDefinitionResponse.result), [{
      uri: definition.uri,
      range: definition.range,
    }])
    assert.equal(textInRange(definitionSource, definition.range), "Profile")
    verifiedClaims.push("type-definition.artifact.immutable-unopened-variable-type-range")

    session.openDocument({
      uri: implementationInterface.uri,
      languageId: "arkts",
      version: 1,
      text: implementationContractsSource,
    })
    for (const { query, target, queryText, targetText } of [
      {
        query: implementationInterface,
        target: implementationInterfaceTarget,
        queryText: "Formatter",
        targetText: "JsonFormatter",
      },
      {
        query: implementationAbstractClass,
        target: implementationAbstractClassTarget,
        queryText: "Validator",
        targetText: "RequiredValidator",
      },
    ]) {
      assert.equal(textInRange(implementationContractsSource, query.range), queryText)
      assert.equal(textInRange(implementationTargetsSource, target.range), targetText)
      const implementationResponse = await session.request("textDocument/implementation", {
        textDocument: { uri: query.uri },
        position: midpoint(query.range),
      }, { timeoutMs })
      assert.equal(
        implementationResponse.error,
        undefined,
        JSON.stringify(implementationResponse.error),
      )
      assert.deepEqual(normalizeLocations(implementationResponse.result), [{
        uri: target.uri,
        range: target.range,
      }])
    }
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: implementationInterface.uri } },
    })
    verifiedClaims.push("implementation.artifact.immutable-unopened-interface-abstract-ranges")

    const hoverResponse = await session.request("textDocument/hover", {
      textDocument: { uri: reference.uri },
      position: midpoint(reference.range),
    }, { timeoutMs })
    assert.equal(hoverResponse.error, undefined, JSON.stringify(hoverResponse.error))
    assert.equal(hoverResponse.result.contents.kind, "markdown")
    assert.equal(
      hoverSignature(hoverResponse.result.contents.value),
      "(alias) interface Profile\nimport Profile",
    )
    assert.match(
      hoverResponse.result.contents.value,
      /Represents a user profile shared across ArkTS modules\./,
    )
    assert.match(hoverResponse.result.contents.value, /@since\s+1\.0\.0/)
    assert.deepEqual(hoverResponse.result.range, reference.range)

    const referencesWithoutDeclaration = await session.request("textDocument/references", {
      textDocument: { uri: reference.uri },
      position: midpoint(reference.range),
      context: { includeDeclaration: false },
    }, { timeoutMs })
    assert.equal(
      referencesWithoutDeclaration.error,
      undefined,
      JSON.stringify(referencesWithoutDeclaration.error),
    )
    assert.deepEqual(referencesWithoutDeclaration.result, [
      { uri: barrel.uri, range: barrel.range },
      { uri: importedReference.uri, range: importedReference.range },
      { uri: reference.uri, range: reference.range },
    ])

    const referencesWithDeclaration = await session.request("textDocument/references", {
      textDocument: { uri: reference.uri },
      position: midpoint(reference.range),
      context: { includeDeclaration: true },
    }, { timeoutMs })
    assert.equal(
      referencesWithDeclaration.error,
      undefined,
      JSON.stringify(referencesWithDeclaration.error),
    )
    assert.deepEqual(referencesWithDeclaration.result, [
      { uri: barrel.uri, range: barrel.range },
      { uri: definition.uri, range: definition.range },
      { uri: importedReference.uri, range: importedReference.range },
      { uri: reference.uri, range: reference.range },
    ])
    verifiedClaims.push("references.artifact.immutable-unopened-barrel-declaration-policy")

    const conflictDiagnostics = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === renameConflictOrigin.uri
        && message.params.version === 1,
      timeoutMs,
    )
    session.openDocument({
      uri: renameConflictOrigin.uri,
      languageId: "arkts",
      version: 1,
      text: renameConflictSource,
    })
    assert.deepEqual((await conflictDiagnostics).params.diagnostics, [])
    const conflictingRename = await session.request("textDocument/rename", {
      textDocument: { uri: renameConflictOrigin.uri },
      position: midpoint(renameConflictOrigin.range),
      newName: "Account",
    }, { timeoutMs })
    assert.equal(
      conflictingRename.result,
      undefined,
      "a same-scope conflict must not leak a WorkspaceEdit",
    )
    assert.deepEqual(conflictingRename.error, {
      code: -32803,
      message: "Rename is not available at this position.",
    })
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: renameConflictOrigin.uri } },
    })

    const preparedRename = await session.request("textDocument/prepareRename", {
      textDocument: { uri: renameConsumerReference.uri },
      position: midpoint(renameConsumerReference.range),
    }, { timeoutMs })
    assert.equal(preparedRename.error, undefined, JSON.stringify(preparedRename.error))
    assert.deepEqual(preparedRename.result, {
      range: renameConsumerReference.range,
      placeholder: "Profile",
    })

    const renamedProfile = "InstalledProfile"
    const renamedConsumer = await session.request("textDocument/rename", {
      textDocument: { uri: renameConsumerReference.uri },
      position: midpoint(renameConsumerReference.range),
      newName: renamedProfile,
    }, { timeoutMs })
    assert.equal(renamedConsumer.error, undefined, JSON.stringify(renamedConsumer.error))
    assert.equal(renamedConsumer.result.changes, undefined)
    assert.deepEqual(renamedConsumer.result.documentChanges, [{
      textDocument: { uri: renameConsumerReference.uri, version: 1 },
      edits: [
        {
          range: renameConsumerImport.range,
          newText: `Profile as ${renamedProfile}`,
        },
        { range: renameConsumerReference.range, newText: renamedProfile },
      ],
    }])
    const renamedDocuments = applyWorkspaceEdit(
      new Map([[renameConsumerReference.uri, consumerSource]]),
      renamedConsumer.result,
      { documentVersions: new Map([[renameConsumerReference.uri, 1]]) },
    )
    const renamedConsumerSource = renamedDocuments.get(renameConsumerReference.uri)
    assert.equal(
      renamedConsumerSource,
      consumerSource
        .replace("import { Profile }", `import { Profile as ${renamedProfile} }`)
        .replace("/* 😀 */ Profile", `/* 😀 */ ${renamedProfile}`),
    )
    const renamedConsumerReferenceRange = replacementRange(
      renameConsumerReference.range,
      renamedProfile,
    )
    const renamedConsumerAliasRange = {
      start: {
        line: renameConsumerImport.range.start.line,
        character: renameConsumerImport.range.start.character + "Profile as ".length,
      },
      end: {
        line: renameConsumerImport.range.start.line,
        character: renameConsumerImport.range.start.character
          + "Profile as ".length
          + renamedProfile.length,
      },
    }
    const consumerDiagnosticsV2 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === renameConsumerReference.uri
        && message.params.version === 2,
      timeoutMs,
    )
    session.changeDocument({
      uri: renameConsumerReference.uri,
      version: 2,
      text: renamedConsumerSource,
    })
    assert.deepEqual((await consumerDiagnosticsV2).params.diagnostics, [])

    session.openDocument({
      uri: renameOrigin.uri,
      languageId: "arkts",
      version: 3,
      text: definitionSource,
    })
    const renamedOriginName = "InstalledAccount"
    const renamedOrigin = await session.request("textDocument/rename", {
      textDocument: { uri: renameOrigin.uri },
      position: midpoint(renameOrigin.range),
      newName: renamedOriginName,
    }, { timeoutMs })
    assert.equal(renamedOrigin.error, undefined, JSON.stringify(renamedOrigin.error))
    assert.equal(renamedOrigin.result.changes, undefined)
    const expectedOriginChanges = [
      {
        textDocument: { uri: renameOrigin.uri, version: 3 },
        edits: [{ range: renameOrigin.range, newText: renamedOriginName }],
      },
      {
        textDocument: { uri: renameBarrel.uri, version: null },
        edits: [{
          range: renameBarrel.range,
          newText: `${renamedOriginName} as Profile`,
        }],
      },
    ].sort((left, right) => left.textDocument.uri.localeCompare(right.textDocument.uri))
    assert.deepEqual(renamedOrigin.result.documentChanges, expectedOriginChanges)
    const renamedOriginDocuments = applyWorkspaceEdit(
      new Map([
        [renameOrigin.uri, definitionSource],
        [renameBarrel.uri, barrelSource],
        [renameConsumerReference.uri, renamedConsumerSource],
      ]),
      renamedOrigin.result,
      {
        documentVersions: new Map([
          [renameOrigin.uri, 3],
          [renameBarrel.uri, null],
          [renameConsumerReference.uri, 2],
        ]),
      },
    )
    assert.equal(
      renamedOriginDocuments.get(renameOrigin.uri),
      definitionSource.replace("interface Profile", `interface ${renamedOriginName}`),
    )
    assert.equal(
      renamedOriginDocuments.get(renameBarrel.uri),
      `export { ${renamedOriginName} as Profile } from "./Profile"\n`,
    )
    assert.equal(
      renamedOriginDocuments.get(renameConsumerReference.uri),
      renamedConsumerSource,
      "renaming an origin must preserve the barrel's public consumer API",
    )
    const renamedOriginSource = renamedOriginDocuments.get(renameOrigin.uri)
    const renamedBarrelSource = renamedOriginDocuments.get(renameBarrel.uri)
    const renamedOriginRange = replacementRange(renameOrigin.range, renamedOriginName)
    const renamedBarrelOriginRange = replacementRange(renameBarrel.range, renamedOriginName)
    const originDiagnosticsV4 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === renameOrigin.uri && message.params.version === 4,
      timeoutMs,
    )
    fs.writeFileSync(fileURLToPath(renameBarrel.uri), renamedBarrelSource, "utf8")
    session.transport.send({
      jsonrpc: "2.0",
      method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: renameBarrel.uri, type: 2 }] },
    })
    session.changeDocument({
      uri: renameOrigin.uri,
      version: 4,
      text: renamedOriginSource,
    })
    assert.deepEqual((await originDiagnosticsV4).params.diagnostics, [])

    const appliedDefinition = await session.request("textDocument/definition", {
      textDocument: { uri: renameConsumerReference.uri },
      position: midpoint(renamedConsumerReferenceRange),
    }, { timeoutMs })
    assert.equal(appliedDefinition.error, undefined, JSON.stringify(appliedDefinition.error))
    const appliedDefinitionLocations = Array.isArray(appliedDefinition.result)
      ? appliedDefinition.result
      : [appliedDefinition.result]
    assert.deepEqual(appliedDefinitionLocations, [{
      uri: renameOrigin.uri,
      range: renamedOriginRange,
    }])

    const appliedReferences = await session.request("textDocument/references", {
      textDocument: { uri: renameOrigin.uri },
      position: midpoint(renamedOriginRange),
      context: { includeDeclaration: true },
    }, { timeoutMs })
    assert.equal(appliedReferences.error, undefined, JSON.stringify(appliedReferences.error))
    const publicAliasOffset = renamedBarrelSource.indexOf("Profile")
    assert.notEqual(publicAliasOffset, -1)
    const renamedBarrelPublicRange = {
      start: positionAt(renamedBarrelSource, publicAliasOffset),
      end: positionAt(renamedBarrelSource, publicAliasOffset + "Profile".length),
    }
    const expectedAppliedReferences = [
      { uri: renameBarrel.uri, range: renamedBarrelOriginRange },
      { uri: renameBarrel.uri, range: renamedBarrelPublicRange },
      { uri: renameOrigin.uri, range: renamedOriginRange },
      { uri: renameConsumerImport.uri, range: renameConsumerImport.range },
      { uri: renameConsumerImport.uri, range: renamedConsumerAliasRange },
      { uri: renameConsumerReference.uri, range: renamedConsumerReferenceRange },
    ]
    assert.deepEqual(appliedReferences.result, expectedAppliedReferences)
    const renamedSourceByUri = new Map([
      [renameOrigin.uri, renamedOriginSource],
      [renameBarrel.uri, renamedBarrelSource],
      [renameConsumerReference.uri, renamedConsumerSource],
    ])
    assert.deepEqual(appliedReferences.result.map((location) => (
      textInRange(renamedSourceByUri.get(location.uri), location.range)
    )), [
      renamedOriginName,
      "Profile",
      renamedOriginName,
      "Profile",
      renamedProfile,
      renamedProfile,
    ])
    assert.deepEqual(
      appliedReferences.result.filter((location) => location.uri === renameOrigin.uri),
      [{ uri: renameOrigin.uri, range: renamedOriginRange }],
      "the renamed declaration identity must not retain its old origin range",
    )
    verifiedClaims.push(
      "rename.artifact.immutable-versioned-alias-conflict-applied-semantic-recheck",
    )

    session.openDocument({
      uri: signature.uri,
      languageId: "arkts",
      version: 1,
      text: signatureSource,
    })
    const signatureResponse = await session.request("textDocument/signatureHelp", {
      textDocument: { uri: signature.uri },
      position: signature.position,
      context: {
        triggerKind: 2,
        triggerCharacter: ",",
        isRetrigger: false,
      },
    }, { timeoutMs })
    assert.equal(signatureResponse.error, undefined, JSON.stringify(signatureResponse.error))
    assert.equal(signatureResponse.result.activeSignature, 1)
    assert.equal(signatureResponse.result.activeParameter, 1)
    assert.equal(
      signatureResponse.result.signatures[1].label,
      "format(value: string, suffix: string): string",
    )
    verifiedClaims.push("signature-help.artifact.immutable-unopened-overload")
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: signature.uri } },
    })

    const diskGreeterResponse = await session.request(
      "workspace/symbol",
      { query: "Greeter" },
      { timeoutMs },
    )
    assert.equal(
      diskGreeterResponse.error,
      undefined,
      JSON.stringify(diskGreeterResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(diskGreeterResponse.result, greeterDefinition.uri, "Greeter"),
      [{ name: "Greeter", uri: greeterDefinition.uri, range: greeterDefinition.range }],
      "the lifecycle tracer requires a catalog-backed disk symbol",
    )

    const overlayName = "InstalledOverlayGreeter"
    const overlaySource = applyTextEdits(greeterSource, [{
      range: greeterDefinition.range,
      newText: overlayName,
    }])
    const overlayRange = {
      start: greeterDefinition.range.start,
      end: {
        line: greeterDefinition.range.start.line,
        character: greeterDefinition.range.start.character + overlayName.length,
      },
    }
    assert.equal(textInRange(overlaySource, overlayRange), overlayName)
    session.openDocument({
      uri: greeterDefinition.uri,
      languageId: "arkts",
      version: 1,
      text: greeterSource,
    })
    session.changeDocument({
      uri: greeterDefinition.uri,
      version: 2,
      contentChanges: [{
        range: greeterDefinition.range,
        text: overlayName,
      }],
    })

    const changedSymbolResponse = await session.request(
      "workspace/symbol",
      { query: overlayName },
      { timeoutMs },
    )
    assert.equal(
      changedSymbolResponse.error,
      undefined,
      JSON.stringify(changedSymbolResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(changedSymbolResponse.result, greeterDefinition.uri, overlayName),
      [{ name: overlayName, uri: greeterDefinition.uri, range: overlayRange }],
    )
    const staleDiskSymbolResponse = await session.request(
      "workspace/symbol",
      { query: "Greeter" },
      { timeoutMs },
    )
    assert.equal(
      staleDiskSymbolResponse.error,
      undefined,
      JSON.stringify(staleDiskSymbolResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(staleDiskSymbolResponse.result, greeterDefinition.uri, "Greeter"),
      [],
      "an open incrementally changed overlay must hide the stale indexed disk symbol",
    )

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: greeterDefinition.uri } },
    })
    const closedOverlayResponse = await session.request(
      "workspace/symbol",
      { query: overlayName },
      { timeoutMs },
    )
    assert.equal(
      closedOverlayResponse.error,
      undefined,
      JSON.stringify(closedOverlayResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(closedOverlayResponse.result, greeterDefinition.uri, overlayName),
      [],
      "didClose must remove the in-memory overlay",
    )
    const restoredDiskSymbolResponse = await session.request(
      "workspace/symbol",
      { query: "Greeter" },
      { timeoutMs },
    )
    assert.equal(
      restoredDiskSymbolResponse.error,
      undefined,
      JSON.stringify(restoredDiskSymbolResponse.error),
    )
    const restoredDiskSymbols = exactWorkspaceSymbols(
      restoredDiskSymbolResponse.result,
      greeterDefinition.uri,
      "Greeter",
    )
    assert.deepEqual(restoredDiskSymbols, [{
      name: "Greeter",
      uri: greeterDefinition.uri,
      range: greeterDefinition.range,
    }])
    assert.equal(textInRange(greeterSource, restoredDiskSymbols[0].range), "Greeter")
    verifiedClaims.push("document-sync.artifact.immutable-incremental-overlay-lifecycle")

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: reference.uri } },
    })
    session.openDocument({
      uri: completion.uri,
      languageId: "arkts",
      version: 1,
      text: homeSource,
    })
    const completionResponse = await session.request("textDocument/completion", {
      textDocument: { uri: completion.uri },
      position: completion.position,
    }, { timeoutMs })
    assert.equal(completionResponse.error, undefined, JSON.stringify(completionResponse.error))
    const items = Array.isArray(completionResponse.result)
      ? completionResponse.result
      : completionResponse.result?.items ?? []
    const greeters = items.filter((item) => item.label === "Greeter")
    assert.equal(greeters.length, 1, `Expected one Greeter in ${JSON.stringify(items)}`)
    assert.equal(greeters[0].kind, CompletionItemKind.Class)
    assert.deepEqual(greeters[0].textEdit, {
      range: completion.range,
      newText: "Greeter",
    })

    const [greeter] = greeters
    assert.deepEqual(Object.keys(greeter.data ?? {}), ["arktsCompletionId"])
    assert.match(
      greeter.data.arktsCompletionId,
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
    )

    const resolvedResponse = await session.request(
      "completionItem/resolve",
      greeter,
      { timeoutMs },
    )
    assert.equal(resolvedResponse.error, undefined, JSON.stringify(resolvedResponse.error))
    const resolved = resolvedResponse.result
    assert.deepEqual(resolved.data, greeter.data)
    assert.match(resolved.detail, /class Greeter/)
    assert.equal(
      resolved.documentation,
      "Builds a deterministic greeting for the supplied name.",
    )
    assert.deepEqual(resolved.textEdit, greeter.textEdit)
    assert.deepEqual(resolved.additionalTextEdits, [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      newText: 'import { Greeter } from "../services/Greeter.ets";\n\n',
    }])

    const updatedHome = applyTextEdits(homeSource, [
      resolved.textEdit,
      ...resolved.additionalTextEdits,
    ])
    assert.match(updatedHome, /^import \{ Greeter \} from "\.\.\/services\/Greeter\.ets";\n\n/)
    assert.match(updatedHome, /const face = '😀'; const value = Greeter/)

    const diagnosticsV2 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === completion.uri && message.params.version === 2,
      timeoutMs,
    )
    session.changeDocument({
      uri: completion.uri,
      version: 2,
      text: updatedHome,
    })
    const updatedDiagnostics = await diagnosticsV2
    assert.deepEqual(updatedDiagnostics.params.diagnostics, [])

    const usageOffset = updatedHome.lastIndexOf("Greeter")
    assert.notEqual(usageOffset, -1)
    const greeterDefinitionResponse = await session.request("textDocument/definition", {
      textDocument: { uri: completion.uri },
      position: positionAt(updatedHome, usageOffset + 1),
    }, { timeoutMs })
    assert.equal(
      greeterDefinitionResponse.error,
      undefined,
      JSON.stringify(greeterDefinitionResponse.error),
    )
    const greeterLocations = Array.isArray(greeterDefinitionResponse.result)
      ? greeterDefinitionResponse.result
      : [greeterDefinitionResponse.result]
    assert.deepEqual(greeterLocations, [{
      uri: greeterDefinition.uri,
      range: greeterDefinition.range,
    }])
    assert.equal(textInRange(greeterSource, greeterLocations[0].range), "Greeter")
    verifiedClaims.push("completion-resolve.artifact.immutable-auto-import")

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: completion.uri } },
    })
    const diagnosticsV1 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === quickFix.uri
        && message.params.version === 1
        && message.params.diagnostics.some((diagnostic) => (
          diagnostic.code === 2552 && sameRange(diagnostic.range, quickFix.range)
        )),
      timeoutMs,
    )
    session.openDocument({
      uri: quickFix.uri,
      languageId: "arkts",
      version: 1,
      text: quickFixSource,
    })
    const publishedQuickFix = await diagnosticsV1
    const diagnostics = publishedQuickFix.params.diagnostics.filter((diagnostic) => (
      diagnostic.code === 2552 && sameRange(diagnostic.range, quickFix.range)
    ))
    assert.deepEqual(diagnostics.map(({ range, severity, source, code }) => ({
      range,
      severity,
      source,
      code,
    })), [{
      range: quickFix.range,
      severity: 1,
      source: "arkts",
      code: 2552,
    }])

    const listedResponse = await session.request("textDocument/codeAction", {
      textDocument: { uri: quickFix.uri },
      range: quickFix.range,
      context: { diagnostics, only: ["quickfix"] },
    }, { timeoutMs })
    assert.equal(listedResponse.error, undefined, JSON.stringify(listedResponse.error))
    assert.equal(listedResponse.result.length, 1, JSON.stringify(listedResponse.result))
    const [action] = listedResponse.result
    assert.deepEqual({
      title: action.title,
      kind: action.kind,
      diagnostics: action.diagnostics,
    }, {
      title: "Change spelling to 'greeting'",
      kind: "quickfix",
      diagnostics,
    })
    assert.deepEqual(Object.keys(action.data ?? {}), ["arktsCodeActionId"])
    assert.match(
      action.data.arktsCodeActionId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    assert.equal("edit" in action, false)
    assert.equal("command" in action, false)

    const resolvedActionResponse = await session.request(
      "codeAction/resolve",
      action,
      { timeoutMs },
    )
    assert.equal(
      resolvedActionResponse.error,
      undefined,
      JSON.stringify(resolvedActionResponse.error),
    )
    const resolvedAction = resolvedActionResponse.result
    assert.deepEqual(resolvedAction.data, action.data)
    assert.deepEqual(resolvedAction.edit, {
      documentChanges: [{
        textDocument: { uri: quickFix.uri, version: 1 },
        edits: [{ range: quickFix.range, newText: "greeting" }],
      }],
    })
    assert.equal("changes" in resolvedAction.edit, false)
    assert.equal("command" in resolvedAction, false)

    const updatedQuickFixDocuments = applyWorkspaceEdit(
      new Map([[quickFix.uri, quickFixSource]]),
      resolvedAction.edit,
      { documentVersions: new Map([[quickFix.uri, 1]]) },
    )
    const updatedQuickFix = updatedQuickFixDocuments.get(quickFix.uri)
    assert.equal(updatedQuickFix, quickFixSource.replace("greting", "greeting"))
    const quickFixDiagnosticsV2 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === quickFix.uri && message.params.version === 2,
      timeoutMs,
    )
    session.changeDocument({ uri: quickFix.uri, version: 2, text: updatedQuickFix })
    const clearedQuickFixDiagnostics = await quickFixDiagnosticsV2
    assert.deepEqual(clearedQuickFixDiagnostics.params.diagnostics, [])
    verifiedClaims.push("code-actions.artifact.immutable-list-resolve-apply")

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: quickFix.uri } },
    })

    const resourceDiagnosticsV1 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === resourceCompletion.uri
        && message.params.version === 1,
      timeoutMs,
    )
    session.openDocument({
      uri: resourceCompletion.uri,
      languageId: "arkts",
      version: 1,
      text: resourcePageSource,
    })
    const publishedResourceDiagnostics = await resourceDiagnosticsV1
    assert.deepEqual(
      publishedResourceDiagnostics.params.diagnostics
        .filter(({ code }) => code === "arkui.resource.not-found")
        .map(({ code, severity, source, range }) => ({ code, severity, source, range })),
      [{
        code: "arkui.resource.not-found",
        severity: 1,
        source: "arkts",
        range: missingResource.range,
      }],
    )

    const resourceCompletionResponse = await session.request("textDocument/completion", {
      textDocument: { uri: resourceCompletion.uri },
      position: resourceCompletion.position,
      context: { triggerKind: 1 },
    }, { timeoutMs })
    assert.equal(
      resourceCompletionResponse.error,
      undefined,
      JSON.stringify(resourceCompletionResponse.error),
    )
    const resourceCompletionItems = Array.isArray(resourceCompletionResponse.result)
      ? resourceCompletionResponse.result
      : resourceCompletionResponse.result?.items ?? []
    assert.deepEqual(
      resourceCompletionItems
        .filter(({ label }) => label === "title")
        .map(({ label, kind, detail, textEdit }) => ({ label, kind, detail, textEdit })),
      [{
        label: "title",
        kind: CompletionItemKind.Property,
        detail: "ArkUI string resource app.string.title",
        textEdit: { range: resourceCompletion.range, newText: "title" },
      }],
    )

    const resourceDefinitionResponse = await session.request("textDocument/definition", {
      textDocument: { uri: resourceDefinition.uri },
      position: midpoint(resourceDefinition.range),
    }, { timeoutMs })
    assert.equal(
      resourceDefinitionResponse.error,
      undefined,
      JSON.stringify(resourceDefinitionResponse.error),
    )
    const resourceDefinitionLocations = normalizeLocations(resourceDefinitionResponse.result)
    const resourceNameRange = rangeInAnchor(resourceSource, '"name": "title"', "title")
    assert.deepEqual(resourceDefinitionLocations, [{ uri: resourceUri, range: resourceNameRange }])
    assert.equal(textInRange(resourceSource, resourceNameRange), "title")
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: resourceCompletion.uri } },
    })

    const builderDiagnosticsV1 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === builderWidth.uri && message.params.version === 1,
      timeoutMs,
    )
    session.openDocument({
      uri: builderWidth.uri,
      languageId: "arkts",
      version: 1,
      text: builderPageSource,
    })
    const publishedBuilderDiagnostics = await builderDiagnosticsV1
    assert.deepEqual(
      publishedBuilderDiagnostics.params.diagnostics
        .filter(({ code }) => code === 1128 || code === 2304)
        .map(({ code, severity, source, range }) => ({ code, severity, source, range })),
      [],
    )

    const builderHoverResponse = await session.request("textDocument/hover", {
      textDocument: { uri: builderWidth.uri },
      position: midpoint(builderWidth.range),
    }, { timeoutMs })
    assert.equal(builderHoverResponse.error, undefined, JSON.stringify(builderHoverResponse.error))
    assert.equal(builderHoverResponse.result?.contents?.kind, "markdown")
    assert.match(
      builderHoverResponse.result.contents.value,
      /ArkUICommonAttribute\.width\(value: ArkUILength\): ColumnAttribute/,
    )
    assert.deepEqual(builderHoverResponse.result.range, builderWidth.range)

    const builderDefinitionResponse = await session.request("textDocument/definition", {
      textDocument: { uri: builderWidth.uri },
      position: midpoint(builderWidth.range),
    }, { timeoutMs })
    assert.equal(
      builderDefinitionResponse.error,
      undefined,
      JSON.stringify(builderDefinitionResponse.error),
    )
    assert.deepEqual(
      normalizeLocations(builderDefinitionResponse.result).filter(({ uri }) => uri === sdkUri),
      [{
        uri: sdkUri,
        range: rangeInAnchor(sdkSource, "width(value: ArkUILength)", "width"),
      }],
    )

    const builderCompletionSource = builderPageSource.replace('.width("100%")', ".wi")
    assert.notEqual(builderCompletionSource, builderPageSource)
    const builderCompletionRange = rangeInAnchor(builderCompletionSource, "}.wi", "wi")
    session.changeDocument({
      uri: builderWidth.uri,
      version: 2,
      text: builderCompletionSource,
    })
    const builderCompletionResponse = await session.request("textDocument/completion", {
      textDocument: { uri: builderWidth.uri },
      position: builderCompletionRange.end,
      context: { triggerKind: 1 },
    }, { timeoutMs })
    assert.equal(
      builderCompletionResponse.error,
      undefined,
      JSON.stringify(builderCompletionResponse.error),
    )
    const builderCompletionItems = Array.isArray(builderCompletionResponse.result)
      ? builderCompletionResponse.result
      : builderCompletionResponse.result?.items ?? []
    assert.deepEqual(
      builderCompletionItems
        .filter(({ label }) => label === "width")
        .map(({ label, kind, textEdit }) => ({ label, kind, textEdit })),
      [{
        label: "width",
        kind: CompletionItemKind.Method,
        textEdit: { range: builderCompletionRange, newText: "width" },
      }],
    )
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: builderWidth.uri } },
    })

    verifiedClaims.push("diagnostics.artifact.immutable-versioned-arkui-resource-builder")

    session.openDocument({
      uri: arkuiSdkCompletionUri,
      languageId: "arkts",
      version: 1,
      text: arkuiSdkCompletionSource,
    })
    for (const scenario of arkuiSdkScenarios) {
      const sdkCompletionResponse = await session.request("textDocument/completion", {
        textDocument: { uri: arkuiSdkCompletionUri },
        position: scenario.completion.position,
        context: { triggerKind: 1 },
      }, { timeoutMs })
      assert.equal(
        sdkCompletionResponse.error,
        undefined,
        `${scenario.label} completion: ${JSON.stringify(sdkCompletionResponse.error)}`,
      )
      const sdkCompletionItems = Array.isArray(sdkCompletionResponse.result)
        ? sdkCompletionResponse.result
        : sdkCompletionResponse.result?.items ?? []
      assert.deepEqual(
        sdkCompletionItems
          .filter(({ label }) => label === scenario.label)
          .map(({ label, kind, textEdit }) => ({ label, kind, textEdit })),
        [{
          label: scenario.label,
          kind: scenario.kind,
          textEdit: { range: scenario.completion.range, newText: scenario.label },
        }],
        `${scenario.label} completion: ${JSON.stringify(sdkCompletionItems)}`,
      )
    }
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: arkuiSdkCompletionUri } },
    })
    verifiedClaims.push("completion.artifact.immutable-typescript-arkui-sdk-resource-builder")

    session.openDocument({
      uri: documentSymbolPage.uri,
      languageId: "arkts",
      version: 10,
      text: documentSymbolSource,
    })
    for (const scenario of arkuiSdkScenarios) {
      const sdkHoverResponse = await session.request("textDocument/hover", {
        textDocument: { uri: scenario.usage.uri },
        position: midpoint(scenario.usage.range),
      }, { timeoutMs })
      assert.equal(
        sdkHoverResponse.error,
        undefined,
        `${scenario.label} hover: ${JSON.stringify(sdkHoverResponse.error)}`,
      )
      assert.equal(
        sdkHoverResponse.result?.contents?.kind,
        "markdown",
        `${scenario.label} hover markup kind`,
      )
      assert.match(sdkHoverResponse.result.contents.value, scenario.hoverPattern)
      assert.deepEqual(
        sdkHoverResponse.result.range,
        scenario.usage.range,
        `${scenario.label} hover range`,
      )

      const sdkDefinitionResponse = await session.request("textDocument/definition", {
        textDocument: { uri: scenario.usage.uri },
        position: midpoint(scenario.usage.range),
      }, { timeoutMs })
      assert.equal(
        sdkDefinitionResponse.error,
        undefined,
        `${scenario.label} definition: ${JSON.stringify(sdkDefinitionResponse.error)}`,
      )
      assert.deepEqual(
        normalizeLocations(sdkDefinitionResponse.result).filter(({ uri }) => uri === sdkUri),
        [{
          uri: sdkUri,
          range: rangeInAnchor(sdkSource, scenario.definitionAnchor, scenario.label),
        }],
        `${scenario.label} SDK definition`,
      )
    }
    verifiedClaims.push("definition.artifact.immutable-typescript-arkui-sdk-resource-builder-ranges")

    const expectedWorkspaceSymbols = [
      {
        name: "ArkuiPage",
        kind: 23,
        location: { uri: documentSymbolPage.uri, range: documentSymbolPage.range },
      },
      {
        name: "title",
        kind: 7,
        location: { uri: documentSymbolTitle.uri, range: documentSymbolTitle.range },
      },
      {
        name: "build",
        kind: 6,
        location: { uri: documentSymbolBuild.uri, range: documentSymbolBuild.range },
      },
    ]
    const actualWorkspaceSymbols = []
    for (const expectedSymbol of expectedWorkspaceSymbols) {
      const response = await session.request("workspace/symbol", {
        query: expectedSymbol.name,
      }, { timeoutMs })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      actualWorkspaceSymbols.push(...exactWorkspaceSymbolDetails(
        response.result,
        expectedSymbol.location.uri,
        expectedSymbol.name,
      ))
    }
    assert.deepEqual(actualWorkspaceSymbols, expectedWorkspaceSymbols)
    workspaceSymbolKindUriNameRange = {
      actual: actualWorkspaceSymbols,
      expected: expectedWorkspaceSymbols,
    }
    const firstDocumentSymbols = await session.request("textDocument/documentSymbol", {
      textDocument: { uri: documentSymbolPage.uri },
    }, { timeoutMs })
    const repeatedDocumentSymbols = await session.request("textDocument/documentSymbol", {
      textDocument: { uri: documentSymbolPage.uri },
    }, { timeoutMs })
    assert.equal(
      firstDocumentSymbols.error,
      undefined,
      JSON.stringify(firstDocumentSymbols.error),
    )
    assert.equal(
      repeatedDocumentSymbols.error,
      undefined,
      JSON.stringify(repeatedDocumentSymbols.error),
    )
    assert.deepEqual(
      repeatedDocumentSymbols.result,
      firstDocumentSymbols.result,
      "installed document symbols must retain stable source order",
    )
    assert.equal(firstDocumentSymbols.result.length, 1)
    const [pageSymbol] = firstDocumentSymbols.result
    assert.deepEqual({
      name: pageSymbol.name,
      kind: pageSymbol.kind,
      selectionRange: pageSymbol.selectionRange,
    }, {
      name: "ArkuiPage",
      kind: 23,
      selectionRange: documentSymbolPage.range,
    })
    assert.deepEqual(pageSymbol.children.map(({ name, kind, selectionRange }) => ({
      name,
      kind,
      selectionRange,
    })), [
      { name: "title", kind: 7, selectionRange: documentSymbolTitle.range },
      { name: "build", kind: 6, selectionRange: documentSymbolBuild.range },
    ])

    session.openDocument({
      uri: symbolKindsUri,
      languageId: "arkts",
      version: 1,
      text: symbolKindsSource,
    })
    const modernDocumentSymbolResponse = await session.request("textDocument/documentSymbol", {
      textDocument: { uri: symbolKindsUri },
    }, { timeoutMs })
    assert.equal(
      modernDocumentSymbolResponse.error,
      undefined,
      JSON.stringify(modernDocumentSymbolResponse.error),
    )
    assert.ok(Array.isArray(modernDocumentSymbolResponse.result))
    const modernDocumentSymbols = flattenDocumentSymbols(modernDocumentSymbolResponse.result)
    assert.deepEqual(
      negotiatedSymbolKinds.map(({ name, modernKind, range }) => {
        const symbol = modernDocumentSymbols.find((candidate) => candidate.name === name)
        return { name: symbol?.name, kind: symbol?.kind, selectionRange: symbol?.selectionRange }
      }),
      negotiatedSymbolKinds.map(({ name, modernKind, range }) => ({
        name,
        kind: modernKind,
        selectionRange: range,
      })),
    )
    const modernMode = modernDocumentSymbolResponse.result.find(
      ({ name }) => name === "InstalledSymbolMode",
    )
    assert.deepEqual(
      modernMode?.children?.map(({ name, kind }) => ({ name, kind })),
      [{ name: "InstalledSymbolReady", kind: 22 }],
    )

    const expectedModernWorkspaceKinds = negotiatedSymbolKinds.map(({
      name,
      modernKind,
      range,
    }) => ({
      name,
      kind: modernKind,
      location: { uri: symbolKindsUri, range },
    }))
    const actualModernWorkspaceKinds = []
    for (const expectedSymbol of expectedModernWorkspaceKinds) {
      const response = await session.request("workspace/symbol", {
        query: expectedSymbol.name,
      }, { timeoutMs })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      actualModernWorkspaceKinds.push(...exactWorkspaceSymbolDetails(
        response.result,
        symbolKindsUri,
        expectedSymbol.name,
      ))
    }
    assert.deepEqual(actualModernWorkspaceKinds, expectedModernWorkspaceKinds)
    workspaceSymbolKindUriNameRange = {
      actual: [...workspaceSymbolKindUriNameRange.actual, ...actualModernWorkspaceKinds],
      expected: [...workspaceSymbolKindUriNameRange.expected, ...expectedModernWorkspaceKinds],
    }
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: symbolKindsUri } },
    })

    await assertInstalledLegacyNegotiation({
      installedCommand,
      externalCwd,
      env,
      materialized,
      hoverUri: documentSymbolPage.uri,
      hoverSource: documentSymbolSource,
      hoverRange: rangeInAnchor(documentSymbolSource, '.width("100%")', "width"),
      symbolKindsUri,
      symbolKindsSource,
      negotiatedSymbolKinds,
      timeoutMs,
    })
    verifiedClaims.push(
      "hover.artifact.immutable-negotiated-markdown-plaintext-typescript-arkui-range",
    )
    verifiedClaims.push(
      "workspace-symbol.artifact.immutable-modern-legacy-kind-uri-name-range",
    )
    verifiedClaims.push("document-symbol.artifact.immutable-modern-legacy-kind-hierarchy")
  } finally {
    try {
      await session.close({ timeoutMs })
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  }
  return {
    verifiedClaims: Object.freeze([...verifiedClaims]),
    workspaceSymbolKindUriNameRange,
  }
}

async function assertInstalledLegacyNegotiation({
  installedCommand,
  externalCwd,
  env,
  materialized,
  hoverUri,
  hoverSource,
  hoverRange,
  symbolKindsUri,
  symbolKindsSource,
  negotiatedSymbolKinds,
  timeoutMs,
}) {
  const legacySession = new LspSession({
    command: installedCommand,
    args: ["--stdio"],
    cwd: externalCwd,
    env: {
      ...env,
      HOME: env.HOME ?? path.join(materialized.root, "missing-legacy-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-legacy-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_INDEX_SIDECAR_PATH: "",
      ARKTS_INDEX_CACHE_DIR: path.join(materialized.root, "legacy-index-cache"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      workspace: { symbol: {} },
      textDocument: {
        hover: { contentFormat: ["plaintext"] },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      },
    },
  })

  try {
    const initialized = await legacySession.initialize({ timeoutMs })
    assert.equal(initialized.result.capabilities.hoverProvider, true)
    assert.equal(initialized.result.capabilities.documentSymbolProvider, true)
    assert.equal(initialized.result.capabilities.workspaceSymbolProvider, true)

    legacySession.openDocument({
      uri: hoverUri,
      languageId: "arkts",
      version: 1,
      text: hoverSource,
    })
    const plaintextHover = await legacySession.request("textDocument/hover", {
      textDocument: { uri: hoverUri },
      position: midpoint(hoverRange),
    }, { timeoutMs })
    assert.equal(plaintextHover.error, undefined, JSON.stringify(plaintextHover.error))
    assert.deepEqual(plaintextHover.result?.contents, {
      kind: "plaintext",
      value: "(method) ArkUICommonAttribute.width(value: ArkUILength): TextAttribute",
    })
    assert.doesNotMatch(plaintextHover.result.contents.value, /```/)
    assert.deepEqual(plaintextHover.result.range, hoverRange)
    legacySession.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: hoverUri } },
    })

    legacySession.openDocument({
      uri: symbolKindsUri,
      languageId: "arkts",
      version: 1,
      text: symbolKindsSource,
    })
    const documentSymbolResponse = await legacySession.request("textDocument/documentSymbol", {
      textDocument: { uri: symbolKindsUri },
    }, { timeoutMs })
    assert.equal(
      documentSymbolResponse.error,
      undefined,
      JSON.stringify(documentSymbolResponse.error),
    )
    assert.ok(Array.isArray(documentSymbolResponse.result))
    const legacyDocumentSymbols = flattenDocumentSymbols(documentSymbolResponse.result)
    assert.ok(legacyDocumentSymbols.every(({ kind }) => kind >= 1 && kind <= 18))
    assert.deepEqual(
      negotiatedSymbolKinds.map(({ name }) => {
        const symbol = legacyDocumentSymbols.find((candidate) => candidate.name === name)
        return { name: symbol?.name, kind: symbol?.kind, selectionRange: symbol?.selectionRange }
      }),
      negotiatedSymbolKinds.map(({ name, legacyKind, range }) => ({
        name,
        kind: legacyKind,
        selectionRange: range,
      })),
    )
    const legacyMode = documentSymbolResponse.result.find(
      ({ name }) => name === "InstalledSymbolMode",
    )
    assert.deepEqual(
      legacyMode?.children?.map(({ name, kind }) => ({ name, kind })),
      [{ name: "InstalledSymbolReady", kind: 10 }],
    )

    const expectedLegacyWorkspaceKinds = negotiatedSymbolKinds.map(({
      name,
      legacyKind,
      range,
    }) => ({
      name,
      kind: legacyKind,
      location: { uri: symbolKindsUri, range },
    }))
    const actualLegacyWorkspaceKinds = []
    for (const expectedSymbol of expectedLegacyWorkspaceKinds) {
      const response = await legacySession.request("workspace/symbol", {
        query: expectedSymbol.name,
      }, { timeoutMs })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.ok(response.result.every(({ kind }) => kind >= 1 && kind <= 18))
      actualLegacyWorkspaceKinds.push(...exactWorkspaceSymbolDetails(
        response.result,
        symbolKindsUri,
        expectedSymbol.name,
      ))
    }
    assert.deepEqual(actualLegacyWorkspaceKinds, expectedLegacyWorkspaceKinds)
    legacySession.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: symbolKindsUri } },
    })
  } finally {
    await legacySession.close({ timeoutMs })
  }
}

function midpoint(range) {
  assert.equal(range.start.line, range.end.line, "fixture range must be single-line")
  return {
    line: range.start.line,
    character: range.start.character + Math.floor(
      (range.end.character - range.start.character) / 2,
    ),
  }
}

function replacementRange(range, replacement) {
  assert.equal(range.start.line, range.end.line, "fixture range must be single-line")
  return {
    start: range.start,
    end: {
      line: range.start.line,
      character: range.start.character + replacement.length,
    },
  }
}

function textInRange(source, range) {
  assert.equal(range.start.line, range.end.line, "fixture range must be single-line")
  return source
    .split("\n")[range.start.line]
    .slice(range.start.character, range.end.character)
}

function positionAt(source, offset) {
  const before = source.slice(0, offset)
  const line = before.split("\n").length - 1
  const lineStart = before.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}

function rangesOf(source, name) {
  const ranges = []
  let offset = 0
  while ((offset = source.indexOf(name, offset)) >= 0) {
    ranges.push({
      start: positionAt(source, offset),
      end: positionAt(source, offset + name.length),
    })
    offset += name.length
  }
  return ranges
}

function lineRange(source, startAnchor, endAnchor) {
  const lines = source.split("\n")
  const startLine = lines.findIndex((line) => line.includes(startAnchor))
  const endLine = lines.findLastIndex((line) => line === endAnchor)
  assert.notEqual(startLine, -1, `missing folding start anchor: ${startAnchor}`)
  assert.ok(endLine > startLine, `missing folding end anchor after ${startAnchor}`)
  return { startLine, endLine }
}

function rangeInAnchor(source, anchor, token) {
  const anchorOffset = source.indexOf(anchor)
  assert.notEqual(anchorOffset, -1, `missing anchor: ${anchor}`)
  const tokenOffset = anchor.indexOf(token)
  assert.notEqual(tokenOffset, -1, `${token} is absent from ${anchor}`)
  const start = anchorOffset + tokenOffset
  return {
    start: positionAt(source, start),
    end: positionAt(source, start + token.length),
  }
}

function normalizeLocations(result) {
  return result === null || result === undefined
    ? []
    : Array.isArray(result)
      ? result
      : [result]
}

function sameRange(left, right) {
  return left?.start?.line === right.start.line
    && left.start.character === right.start.character
    && left?.end?.line === right.end.line
    && left.end.character === right.end.character
}

function exactWorkspaceSymbols(symbols, uri, name) {
  return symbols
    .filter((symbol) => symbol.name === name && symbol.location?.uri === uri)
    .map((symbol) => ({
      name: symbol.name,
      uri: symbol.location.uri,
      range: symbol.location.range,
    }))
}

function exactWorkspaceSymbolDetails(symbols, uri, name) {
  return symbols
    .filter((symbol) => symbol.name === name && symbol.location?.uri === uri)
    .map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      location: {
        uri: symbol.location.uri,
        range: symbol.location.range,
      },
    }))
}

function flattenDocumentSymbols(symbols) {
  return symbols.flatMap((symbol) => [
    symbol,
    ...flattenDocumentSymbols(symbol.children ?? []),
  ])
}

function hoverSignature(markdown) {
  const match = /^```arkts\n([\s\S]*?)\n```/.exec(markdown)
  assert.ok(match, "hover must start with an ArkTS signature fence")
  return match[1]
}
