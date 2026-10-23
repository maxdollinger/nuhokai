import type { Database } from "bun:sqlite";
import { endpoints, eventsPath, type ResponseOf, type ServerEvent } from "@nuhokai/shared/api";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export const VERSION = "0.0.0";
const HEARTBEAT_MS = 15_000;

export function createApp({ db }: { db: Database }) {
  const app = new Hono();

  app.get(endpoints.health.path, (c) => {
    db.query("SELECT 1").get();
    const body: ResponseOf<typeof endpoints.health> = { status: "ok", version: VERSION };
    return c.json(body);
  });

  app.get(eventsPath, (c) =>
    streamSSE(c, async (stream) => {
      const send = (event: ServerEvent) => stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      await send({ type: "hello", serverTime: Date.now() });
      while (!stream.aborted) {
        await stream.sleep(HEARTBEAT_MS);
        await send({ type: "heartbeat", serverTime: Date.now() });
      }
    }),
  );

  return app;
}
