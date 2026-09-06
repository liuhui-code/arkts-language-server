import { Formatter, Validator } from "./NavigationContracts"

export class /*@case.implementation.interface-target.start*/JsonFormatter/*@case.implementation.interface-target.end*/ implements Formatter {
  format(value: string): string {
    return value
  }
}

export class /*@case.implementation.abstract-class-target.start*/RequiredValidator/*@case.implementation.abstract-class-target.end*/ extends Validator {
  validate(value: string): boolean {
    return value.length > 0
  }
}
