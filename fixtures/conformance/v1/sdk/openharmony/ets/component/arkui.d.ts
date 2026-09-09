type ArkUILength = number | string

declare const Entry: (target: object) => void
declare const Component: (target: object) => void
declare const State: (target: object, propertyKey: string) => void

interface ArkUICommonAttribute {
  width(value: ArkUILength): this
}

interface ColumnAttribute extends ArkUICommonAttribute {}
interface TextAttribute extends ArkUICommonAttribute {}

declare function Column(): ColumnAttribute
declare function Text(value: string): TextAttribute
