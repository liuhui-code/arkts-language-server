import { childExit } from "./reference-replay-evidence.mjs"

// Called only after the sampled target has exited. SIGTERM is a fallback
// request, not a hard wall-clock bound if the sampler cannot handle it.
export async function waitForSamplerExit(sampler, sampleIntervalMs) {
  // The target has exited; let its sampler observe that exit and flush naturally.
  // A late SIGINT can race native teardown and turn a clean sampler into failure.
  // Honor the configured polling interval without overflowing Node's timer limit.
  const samplerGraceMs = Math.max(5_000, Math.min(sampleIntervalMs, 2_147_482_647) + 1_000)
  const samplerTimeout = setTimeout(() => sampler.kill("SIGTERM"), samplerGraceMs)
  samplerTimeout.unref()
  try { await childExit(sampler) }
  finally { clearTimeout(samplerTimeout) }
}
