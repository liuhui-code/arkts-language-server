import { /* 😀 */ /*@case.cross-module.import.start*/SharedProfile/*@case.cross-module.import.end*/ } from "shared"

export function crossModuleName(profile: /* 😀 */ /*@case.cross-module.reference.start*//*@case.cross-module.references-query.start*/SharedProfile/*@case.cross-module.references-query.end*//*@case.cross-module.reference.end*/): string {
  return profile.name
}
