@Entry
@Component
struct BuilderTailPage {
  @State private title: string = "Ready"

  build() {
    Column() {
      Column() {
        Text(this.title)
      }
    }.width("100%")
  }
}
