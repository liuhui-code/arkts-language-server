export class Person {
  name: string

  constructor(name: string) {
    this.name = name
  }

  displayName(): string {
    return this.name
  }
}
