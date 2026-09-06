export class Account {
  accountId: string = ""
}

export class /*@case.rename.conflict-origin.start*/Profile/*@case.rename.conflict-origin.end*/ {
  displayName: string = ""
}

export function loadProfile(value: Profile): Profile {
  return value
}
