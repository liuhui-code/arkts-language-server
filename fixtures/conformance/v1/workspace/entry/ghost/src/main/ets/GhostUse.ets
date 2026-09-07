import { /*@case.cross-module.nested-ghost-import.start*/SharedProfile/*@case.cross-module.nested-ghost-import.end*/ } from "shared"

export const nestedGhostProfile: /*@case.cross-module.nested-ghost-use.start*/SharedProfile/*@case.cross-module.nested-ghost-use.end*/ = { name: "must-not-be-indexed" }
