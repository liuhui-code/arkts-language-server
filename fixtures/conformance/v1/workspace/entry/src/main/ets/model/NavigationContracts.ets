export interface /*@case.implementation.interface.start*/Formatter/*@case.implementation.interface.end*/ {
  format(value: string): string
}

export abstract class /*@case.implementation.abstract-class.start*/Validator/*@case.implementation.abstract-class.end*/ {
  abstract validate(value: string): boolean
}
