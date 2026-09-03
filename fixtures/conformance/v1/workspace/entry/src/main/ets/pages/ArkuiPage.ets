@/*@case.arkui.decorator.entry.start*/Entry/*@case.arkui.decorator.entry.end*/
@/*@case.arkui.decorator.component.start*/Component/*@case.arkui.decorator.component.end*/
struct ArkuiPage {
  @/*@case.arkui.decorator.state.start*/State/*@case.arkui.decorator.state.end*/ private title: string = "Ready"

  build() {
    /*@case.arkui.component.column.start*/Column/*@case.arkui.component.column.end*/() {
      /*@case.arkui.component.text.start*/Text/*@case.arkui.component.text.end*/(this.title)
        ./*@case.arkui.attribute.width.start*/width/*@case.arkui.attribute.width.end*/("100%")
    }
  }
}
