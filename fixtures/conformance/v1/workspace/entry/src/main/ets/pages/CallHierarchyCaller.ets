import { artifactTarget } from '../services/CallHierarchyTarget'

/*@case.call-hierarchy.caller-declaration.start*//* 😀 */ export function /*@case.call-hierarchy.caller-selection.start*/artifactCaller/*@case.call-hierarchy.caller-selection.end*/(): string {
  return `😀${/*@case.call-hierarchy.outgoing-callsite.start*//*@case.call-hierarchy.incoming-callsite.start*/artifactTarget/*@case.call-hierarchy.incoming-callsite.end*//*@case.call-hierarchy.outgoing-callsite.end*/()}`
}/*@case.call-hierarchy.caller-declaration.end*/
