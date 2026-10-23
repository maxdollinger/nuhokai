import { describe, expect, test } from "bun:test";
import { endpoints, HealthResponse } from "@nuhokai/shared/api";
import { Compile } from "typebox/compile";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

describe("server", () => {
  const app = createApp({ db: openDatabase(":memory:") });

  test("health matches the shared contract", async () => {
    const res = await app.request(endpoints.health.path);
    expect(res.status).toBe(200);
    expect(Compile(HealthResponse).Check(await res.json())).toBe(true);
  });
});
