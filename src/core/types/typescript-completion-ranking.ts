export const COMPLETION_PREFIX_MATCH = 0
export const COMPLETION_CAMEL_MATCH = 1
export const COMPLETION_SUBSEQUENCE_MATCH = 2

export type CompletionMatchQuality =
  | typeof COMPLETION_PREFIX_MATCH
  | typeof COMPLETION_CAMEL_MATCH
  | typeof COMPLETION_SUBSEQUENCE_MATCH

export function completionMatchQuality(
  candidate: string,
  normalizedPrefix: string,
): CompletionMatchQuality | undefined {
  if (normalizedPrefix.length === 0) return COMPLETION_PREFIX_MATCH
  const normalizedCandidate = candidate.toLowerCase()
  if (normalizedCandidate.startsWith(normalizedPrefix)) return COMPLETION_PREFIX_MATCH
  let prefixIndex = 0
  for (let candidateIndex = 0; candidateIndex < normalizedCandidate.length; candidateIndex += 1) {
    if (
      normalizedCandidate.charCodeAt(candidateIndex)
      !== normalizedPrefix.charCodeAt(prefixIndex)
    ) continue
    prefixIndex += 1
    if (prefixIndex === normalizedPrefix.length) {
      return matchesCamelCompletion(candidate, normalizedCandidate, normalizedPrefix)
        ? COMPLETION_CAMEL_MATCH
        : COMPLETION_SUBSEQUENCE_MATCH
    }
  }
  return undefined
}

function matchesCamelCompletion(
  candidate: string,
  normalizedCandidate: string,
  normalizedPrefix: string,
): boolean {
  let searchStart = 0
  let previousMatch = -2
  for (let prefixIndex = 0; prefixIndex < normalizedPrefix.length; prefixIndex += 1) {
    let match = -1
    for (let candidateIndex = searchStart; candidateIndex < normalizedCandidate.length; candidateIndex += 1) {
      if (
        normalizedCandidate.charCodeAt(candidateIndex)
          !== normalizedPrefix.charCodeAt(prefixIndex)
        || (
          prefixIndex === 0
            ? !isCompletionWordBoundary(candidate, candidateIndex)
            : candidateIndex !== previousMatch + 1
              && !isCompletionWordBoundary(candidate, candidateIndex)
        )
      ) continue
      match = candidateIndex
      break
    }
    if (match < 0) return false
    previousMatch = match
    searchStart = match + 1
  }
  return true
}

function isCompletionWordBoundary(candidate: string, index: number): boolean {
  if (index === 0) return true
  const previous = candidate.charCodeAt(index - 1)
  const current = candidate.charCodeAt(index)
  if (previous === 0x5f || previous === 0x2d || previous === 0x2e || previous === 0x2f) {
    return true
  }
  const previousIsLower = previous >= 0x61 && previous <= 0x7a
  const previousIsUpper = previous >= 0x41 && previous <= 0x5a
  const previousIsDigit = previous >= 0x30 && previous <= 0x39
  const currentIsLower = current >= 0x61 && current <= 0x7a
  const currentIsUpper = current >= 0x41 && current <= 0x5a
  if (previousIsDigit && (currentIsLower || currentIsUpper)) return true
  if (!currentIsUpper) return false
  if (previousIsLower) return true
  const next = candidate.charCodeAt(index + 1)
  const nextIsLower = next >= 0x61 && next <= 0x7a
  return previousIsUpper && nextIsLower
}

