import Type, { type Static, type TSchema } from "typebox";

/**
 * The contract between web and server. Both sides depend only on this
 * module, never on each other. Responses are TypeBox schemas, so either
 * side can validate what crosses the wire.
 */
export interface Endpoint<Res extends TSchema = TSchema> {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  response: Res;
}

export type ResponseOf<E extends Endpoint> = Static<E["response"]>;

export const HealthResponse = Type.Object(
  { status: Type.Literal("ok"), version: Type.String() },
  { additionalProperties: false },
);

export const endpoints = {
  health: { method: "GET", path: "/api/health", response: HealthResponse },
} as const satisfies Record<string, Endpoint>;

/** Server-sent events on `eventsPath`: world updates and chat streams go here. */
export const eventsPath = "/api/events";

export const ServerEvent = Type.Union([
  Type.Object({ type: Type.Literal("hello"), serverTime: Type.Number() }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("heartbeat"), serverTime: Type.Number() }, { additionalProperties: false }),
]);
export type ServerEvent = Static<typeof ServerEvent>;
