import type { Blank, Forbidden, UnresolvedPortRef } from "./types.ts";

export interface TbdSpec {
  /** What the missing port has to do. Required, not blank: a hole without a description cannot be filled. */
  readonly description: string;
}

/** Rejects a literal empty or whitespace-only description at compile time. */
type NonEmpty<S extends string> = Blank<S> extends true ? Forbidden<"description must not be empty or whitespace"> : S;

/**
 * Typed holes: unresolved references to ports that are not designed yet.
 * Declare them at module level and export them, so several nodes can depend on
 * the same hole and find-references lists every dependent:
 *
 * ```ts
 * export const notifyCustomer = tbd.call({ description: "Tell the customer their order changed" });
 * ```
 */
export declare const tbd: {
  readonly call: <D extends string>(
    spec: TbdSpec & { readonly description: D & NonEmpty<D> },
  ) => UnresolvedPortRef<"call">;
  readonly event: <D extends string>(
    spec: TbdSpec & { readonly description: D & NonEmpty<D> },
  ) => UnresolvedPortRef<"event">;
};
