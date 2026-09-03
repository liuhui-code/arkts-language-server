import { format } from "../services/Formatter"

export function installedSignature(): string {
  return "😀" + format<string>("value",/*@case.signature.format-call*/ "!")
}
