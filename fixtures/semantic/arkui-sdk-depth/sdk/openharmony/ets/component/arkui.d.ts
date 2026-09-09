interface ArkUIResourceValue {
  readonly id: string
}

type ArkUILength = number | string

/** Marks the application entry component. */
declare const Entry: (target: object) => void
/** Marks a reusable ArkUI component. */
declare const Component: (target: object) => void
/** Marks reactive component state. */
declare const State: (target: object, propertyKey: string) => void

interface ArkUICommonAttribute {
  /** Sets the component width. */
  width(value: ArkUILength): this
}

interface ColumnAttribute extends ArkUICommonAttribute {}
interface TextAttribute extends ArkUICommonAttribute {}

/** Resolves an application resource. */
declare function $r(name: string): ArkUIResourceValue
/** Creates a column builder. */
declare function Column(): ColumnAttribute
/** Creates a text builder. */
declare function Text(value: string | ArkUIResourceValue): TextAttribute
