export interface Formatter {
  format(value: string): string
}

export abstract class Validator {
  abstract validate(value: string): boolean
}
