interface ArkUIResourceValue {
  readonly id: string
}

type ArkUILength = number | string

declare const Entry: (target: object) => void
declare const Component: (target: object) => void
declare const State: (target: object, propertyKey: string) => void

interface ArkUICommonAttribute {
  width(value: ArkUILength): this
}

interface ArkUIColumnAttribute extends ArkUICommonAttribute {}
interface ArkUITextAttribute extends ArkUICommonAttribute {}

declare function $r(name: string): ArkUIResourceValue
declare function Column(): ArkUIColumnAttribute
declare function Text(value: string | ArkUIResourceValue): ArkUITextAttribute
