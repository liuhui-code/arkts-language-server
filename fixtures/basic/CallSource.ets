import { loadProfile } from "./CallTarget"

export function renderProfile(): string {
  const first: string = `😀${loadProfile()}`
  const second: string = `😀${loadProfile()}`
  return first + second
}
