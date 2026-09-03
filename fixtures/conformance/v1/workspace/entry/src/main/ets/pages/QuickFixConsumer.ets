export struct QuickFixConsumer {
  build(): string {
    const greeting = "Hello"
    return "😀 " + /*@case.quickfix.greeting.start*/greting/*@case.quickfix.greeting.end*/
  }
}
