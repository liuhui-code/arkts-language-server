function inlayFormat(value: string, count: number): string {
  return value.repeat(count)
}

@Entry
@Component
struct InlayHintsPage {
  build() {
    Column() {
      const prefix = "😀"; const message/*@case.inlay-hint.type*/ = inlayFormat(/*@case.inlay-hint.value*/"ok", /*@case.inlay-hint.count*/2)
      Text(prefix + message)
    }
  }
}
