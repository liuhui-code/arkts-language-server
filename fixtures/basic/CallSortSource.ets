import { upperCall } from "./CallZTarget"
import { lowerCall } from "./CallaTarget"

export function sortedCalls(): void {
  lowerCall()
  upperCall()
  lowerCall()
}
