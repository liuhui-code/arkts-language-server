import { Alpha } from "./Alpha"
import { Beta } from "./Beta"

/*
 * A multiline comment for folding.
 * It stays separate from the import group.
 */

@Entry
@Component
struct FoldingPage {
  private readonly labels: string[] = [
    "Alpha",
    "Beta",
  ] // labels

  build() {
    Column() {
      Row() {
        Text(this.labels[0])
        Text(this.labels[1])
      } // Row

      if (this.labels.length > 0) {
        Text("Ready")
      } // if
    } // Column
  } // build
} // FoldingPage
