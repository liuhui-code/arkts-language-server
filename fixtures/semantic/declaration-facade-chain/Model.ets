export class Model<T> {
  value!: T

  update(value: T): void {
    this.value = value
  }

  reduce(values: T[], reducer: (left: T, right: T) => T): T {
    let current = this.value
    for (const value of values) {
      current = reducer(current, value)
    }
    return current
  }
}
