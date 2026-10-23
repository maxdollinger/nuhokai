import { type Endpoint, eventsPath, type ResponseOf, ServerEvent } from "@nuhokai/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Compile } from "typebox/compile";

/** Fetch an endpoint from the shared contract and validate the response. */
export async function call<E extends Endpoint>(endpoint: E): Promise<ResponseOf<E>> {
  const res = await fetch(endpoint.path, { method: endpoint.method });
  if (!res.ok) throw new Error(`${endpoint.method} ${endpoint.path}: ${res.status}`);
  const body: unknown = await res.json();
  const validator = Compile(endpoint.response);
  if (!validator.Check(body)) throw new Error(`${endpoint.path}: response does not match contract`);
  return body as ResponseOf<E>;
}

const checkEvent = Compile(ServerEvent);
export const lastServerEventKey = ["server-events", "last"] as const;

/** Subscribe to server-sent events and push them into the query cache. */
export function useServerEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource(eventsPath);
    const onEvent = (msg: MessageEvent<string>) => {
      const event: unknown = JSON.parse(msg.data);
      if (checkEvent.Check(event)) queryClient.setQueryData(lastServerEventKey, event);
    };
    for (const type of ["hello", "heartbeat"] satisfies ServerEvent["type"][]) {
      source.addEventListener(type, onEvent);
    }
    return () => source.close();
  }, [queryClient]);
}
