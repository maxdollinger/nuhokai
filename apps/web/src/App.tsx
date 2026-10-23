import { endpoints, type ServerEvent } from "@nuhokai/shared/api";
import { useQuery } from "@tanstack/react-query";
import { call, lastServerEventKey, useServerEvents } from "./api.ts";
import { Scene } from "./scene/Scene.tsx";

export function App() {
  useServerEvents();
  const health = useQuery({ queryKey: ["health"], queryFn: () => call(endpoints.health) });
  const lastEvent = useQuery<ServerEvent | null>({
    queryKey: lastServerEventKey,
    queryFn: () => null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <>
      <Scene />
      <div className="hud">
        <strong>Nuhokai</strong>
        <span>server: {health.isPending ? "…" : health.isError ? "offline" : `ok (v${health.data.version})`}</span>
        <span>events: {lastEvent.data?.type ?? "waiting"}</span>
      </div>
    </>
  );
}
