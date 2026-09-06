@Entry
@Component
struct FormattingPage {
  @State
  title: string = "😀"

  build() {
    Column() {
      Text( this.title )
    }.width( "100%" )    
  }
}
