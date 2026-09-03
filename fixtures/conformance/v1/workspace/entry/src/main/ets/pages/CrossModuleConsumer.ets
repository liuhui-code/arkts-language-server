import { SharedProfile } from "../../../../../shared/src/main/ets/model/SharedProfile"

export function crossModuleName(profile: /* 😀 */ /*@case.cross-module.reference.start*/SharedProfile/*@case.cross-module.reference.end*/): string {
  return profile.name
}
