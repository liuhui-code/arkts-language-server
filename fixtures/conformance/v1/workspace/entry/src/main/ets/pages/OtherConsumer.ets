import { Profile } from "../model"

export function displayName(profile: /*@case.profile.reference.start*/Profile/*@case.profile.reference.end*/): string {
  return profile.name
}

export function unrelatedProfileLabel(): string {
  const Profile = "unrelated symbol"
  return /*@case.profile.shadow.start*/Profile/*@case.profile.shadow.end*/
}
