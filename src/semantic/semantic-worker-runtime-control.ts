import type { MessagePort } from "node:worker_threads"

interface RegisterRootControl {
  readonly control: "registerRoot"
  readonly epoch: number
  readonly rootUri: string
}

type ConfigurationControl =
  | { readonly control: "configureProject"; readonly value: unknown }
  | { readonly control: "configureSdk"; readonly value: unknown }

interface MemoryPressureControl {
  readonly control: "applyMemoryPressure"
  readonly value: "level2" | "level3"
}

interface RecycleWitnessControl {
  readonly control: "recycleWitness"
  readonly token: string
}

export type WorkerControl = RegisterRootControl | ConfigurationControl
  | MemoryPressureControl | RecycleWitnessControl

export function isWorkerControl(value: unknown): value is WorkerControl {
  if (!value || typeof value !== "object") return false
  const control = (value as { control?: unknown }).control
  if (control === "registerRoot") {
    const candidate = value as Partial<RegisterRootControl>
    return Number.isSafeInteger(candidate.epoch)
      && typeof candidate.rootUri === "string"
      && candidate.rootUri.startsWith("file:")
  }
  if (control === "applyMemoryPressure") {
    return ["level2", "level3"].includes((value as Partial<MemoryPressureControl>).value ?? "")
  }
  if (control === "recycleWitness") {
    return typeof (value as Partial<RecycleWitnessControl>).token === "string"
  }
  return control === "configureProject" || control === "configureSdk"
}

export function requireParentPort(candidate: MessagePort | null): MessagePort {
  if (!candidate) throw new Error("semantic worker requires a parent port")
  return candidate
}
