import Type, { type Static } from "typebox";

/**
 * PLACEHOLDER: the real node format is defined by the bootstrap world.
 * Keep `NodeSpec` (the plain type) and `NodeSpecSchema` in sync; the
 * compile-time check below fails if they drift apart.
 */
export interface NodeSpec {
  id: string;
  name: string;
  description?: string;
}

export const NodeSpecSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
  },
  { $id: "NodeSpec", additionalProperties: false },
);

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _nodeSpecInSync: Equals<NodeSpec, Static<typeof NodeSpecSchema>> = true;
void _nodeSpecInSync;
