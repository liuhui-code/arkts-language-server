import { /*@case.profile.import.start*//*@case.rename.consumer-import.start*/Profile/*@case.rename.consumer-import.end*//*@case.profile.import.end*/ } from "../model"

export function displayName(profile: /* 😀 */ /*@case.profile.reference.start*//*@case.rename.consumer-reference.start*/Profile/*@case.rename.consumer-reference.end*//*@case.profile.reference.end*/): string {
  return /*@case.profile.type-definition.start*/profile/*@case.profile.type-definition.end*/.name
}

export function unrelatedProfileLabel(): string {
  const Profile = "unrelated symbol"
  return /*@case.profile.shadow.start*/Profile/*@case.profile.shadow.end*/
}
