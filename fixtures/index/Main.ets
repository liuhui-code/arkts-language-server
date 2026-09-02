@Entry
@Component
struct MainPage {
  private title: string = "Hello"

  build() {
    Text(this.title)
  }

  /* 😀 */ greet(name: string): string {
    return `Hello ${name}`
  }
}

export function makeGreeting(): string {
  return "Hello"
}
