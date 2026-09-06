import { LspSession } from "./lsp-session.mjs"

const profileSource = [
  "struct Profile {",
  "  title: string = \"Ada\"",
  "  save(): void {}",
  "  build(): void {",
  "    this.",
  "  }",
  "}",
].join("\n")

export async function runThisCompletionScenario(target) {
  const capabilities = {
    ...target.capabilities,
    general: {
      ...target.capabilities?.general,
      positionEncodings: target.capabilities?.general?.positionEncodings ?? ["utf-16"],
    },
  }
  const session = new LspSession({ ...target, capabilities })

  try {
    await session.initialize()
    const root = target.rootUri.endsWith("/") ? target.rootUri : `${target.rootUri}/`
    const documentUri = new URL("Profile.ets", root).href
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: documentUri,
          languageId: "arkts",
          version: 1,
          text: profileSource,
        },
      },
    })
    session.transport.send({
      jsonrpc: "2.0",
      id: 1_000,
      method: "textDocument/completion",
      params: {
        textDocument: { uri: documentUri },
        position: { line: 4, character: 9 },
      },
    })

    const response = await session.transport.response(1_000)
    if (response.error) throw new Error(`LSP completion failed: ${JSON.stringify(response.error)}`)
    const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
    const closed = await session.close()
    return { labels: items.map((item) => item.label), exit: closed.exit }
  } finally {
    await session.close()
  }
}
