@/*@case.arkui.decorator.entry.start*/Entry/*@case.arkui.decorator.entry.end*/
@/*@case.arkui.decorator.component.start*/Component/*@case.arkui.decorator.component.end*/
struct /*@case.document-symbol.arkui-page.start*/ArkuiPage/*@case.document-symbol.arkui-page.end*/ {
  @/*@case.arkui.decorator.state.start*/State/*@case.arkui.decorator.state.end*/ /* 😀 */ private /*@case.document-symbol.title.start*/title/*@case.document-symbol.title.end*/: string = "Ready"

  /*@case.document-symbol.build.start*/build/*@case.document-symbol.build.end*/() {
    /*@case.arkui.component.column.start*/Column/*@case.arkui.component.column.end*/() {
      /*@case.arkui.component.text.start*/Text/*@case.arkui.component.text.end*/(this.title)
        ./*@case.arkui.attribute.width.start*/width/*@case.arkui.attribute.width.end*/("100%")
    }
  }
}
