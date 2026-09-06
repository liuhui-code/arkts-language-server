import { receiveProfile } from "./IncomingTarget"

export function renderIncoming(): string {
  const first: string = `😀${receiveProfile()}`
  const second: string = `😀${receiveProfile()}`
  return first + second
}
