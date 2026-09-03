import { transform, wrap } from "./lib/transform"

struct SignatureScreen {
  render(): number {
    return "😀".length + wrap(transform<number>(1,))
  }
}
