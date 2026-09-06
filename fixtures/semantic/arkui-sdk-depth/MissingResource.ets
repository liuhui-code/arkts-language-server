@Entry
@Component
struct MissingResourcePage {
  build() {
    const face = "😀"; Text($r("app.string.missing_title"))
  }
}
