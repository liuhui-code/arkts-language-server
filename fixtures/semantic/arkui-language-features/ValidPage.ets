@Entry
@Component
struct ValidPage {
  @State private title: string = "Ready"

  build() {
    Column() {
      Text($r("app.string.title"))
        .width("100%")
    }
  }
}
