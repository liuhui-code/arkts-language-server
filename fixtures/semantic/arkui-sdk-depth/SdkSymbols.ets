@Ent
class EntryCompletionTarget {}

@Com
class ComponentCompletionTarget {}

class StateCompletionTarget {
  @Sta value: number = 0
}

const columnCandidate = Col
const textCandidate = Te

@Entry
@Component
struct SdkSymbolsPage {
  @State private title: string = "Ready"

  build() {
    Column()
    Text(this.title).width("100%")
  }
}
