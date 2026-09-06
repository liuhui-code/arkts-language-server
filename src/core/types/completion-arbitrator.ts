import type {
  SemanticCompletionItem,
  SemanticCompletionItemList,
} from "../protocol.js"

const MAX_ITEMS_PER_PROVIDER = 128

export function arbitrateCompletionLists(
  arkui: SemanticCompletionItemList,
  typescript: SemanticCompletionItemList,
): SemanticCompletionItemList {
  const arkuiItems = arkui.items.slice(0, MAX_ITEMS_PER_PROVIDER)
  const typescriptItems = typescript.items.slice(0, MAX_ITEMS_PER_PROVIDER)
  const isIncomplete = arkui.isIncomplete
    || typescript.isIncomplete
    || arkui.items.length > arkuiItems.length
    || typescript.items.length > typescriptItems.length
  if (arkuiItems.length === 0) return { items: typescriptItems, isIncomplete }

  const arkuiLabels = new Set(arkuiItems.map(({ label }) => label))
  const items: SemanticCompletionItem[] = [...arkuiItems]
  for (const item of typescriptItems) {
    if (!arkuiLabels.has(item.label)) items.push(item)
  }
  return { items, isIncomplete }
}
