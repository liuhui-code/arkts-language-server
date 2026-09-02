struct Panel {
  title: string = ""

  refresh(): void {}

  build(): void {
    this.refresh()
  }
}
