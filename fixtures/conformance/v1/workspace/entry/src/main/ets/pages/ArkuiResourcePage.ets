@Entry
@Component
struct ArkuiResourcePage {
  build() {
    const face = "😀"; Text($r("app.string./*@case.arkui.resource.completion.start*/ti/*@case.arkui.resource.completion.end*//*@case.arkui.resource.completion*/tle"))
    Text($r("app.string./*@case.arkui.resource.definition.start*/title/*@case.arkui.resource.definition.end*/"))
    const missingFace = "😀"; Text($r("app.string./*@case.arkui.resource.missing.start*/missing_title/*@case.arkui.resource.missing.end*/"))
  }
}
