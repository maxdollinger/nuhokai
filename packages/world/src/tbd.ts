import type { Forbidden, PortKind, UnresolvedPortRef } from "./types.ts";

export interface TbdSpec {
  /** What the missing port has to do. Required, not blank: a hole without a description cannot be filled. */
  readonly description: string;
}

/** What `String.prototype.trim()` removes: ECMAScript WhiteSpace and LineTerminator. */
type Whitespace =
  | " "
  | "\t"
  | "\n"
  | "\v"
  | "\f"
  | "\r"
  | "\u00a0"
  | "\u1680"
  | "\u2000"
  | "\u2001"
  | "\u2002"
  | "\u2003"
  | "\u2004"
  | "\u2005"
  | "\u2006"
  | "\u2007"
  | "\u2008"
  | "\u2009"
  | "\u200a"
  | "\u2028"
  | "\u2029"
  | "\u202f"
  | "\u205f"
  | "\u3000"
  | "\ufeff";
type Trim<S extends string> = S extends `${Whitespace}${infer Rest}`
  ? Trim<Rest>
  : S extends `${infer Rest}${Whitespace}`
    ? Trim<Rest>
    : S;

/** Rejects a literal empty or whitespace-only description at compile time. */
type NonEmpty<S extends string> = Trim<S> extends "" ? Forbidden<"description must not be empty or whitespace"> : S;

function hole<K extends PortKind>(kind: K, spec: TbdSpec): UnresolvedPortRef<K> {
  return Object.freeze({ $ref: "unresolved", kind, description: spec.description }) as unknown as UnresolvedPortRef<K>;
}

/**
 * Typed holes: unresolved references to ports that are not designed yet.
 * Declare them at module level and export them, so several nodes can depend on
 * the same hole and find-references lists every dependent:
 *
 * ```ts
 * export const notifyCustomer = tbd.call({ description: "Tell the customer their order changed" });
 * ```
 */
export const tbd = {
  call: <D extends string>(spec: TbdSpec & { readonly description: D & NonEmpty<D> }): UnresolvedPortRef<"call"> =>
    hole("call", spec),
  event: <D extends string>(spec: TbdSpec & { readonly description: D & NonEmpty<D> }): UnresolvedPortRef<"event"> =>
    hole("event", spec),
};
