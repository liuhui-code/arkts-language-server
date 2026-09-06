import { Formatter, Validator } from "./NavigationContracts"

export class JsonFormatter implements Formatter {
  format(value: string): string {
    return value
  }
}

export class RequiredValidator extends Validator {
  validate(value: string): boolean {
    return value.length > 0
  }
}
