import type { TSchema } from "typebox";
import { Compile } from "typebox/compile";
import { err, ok, type Result } from "../result.ts";
import { type NodeSpec, NodeSpecSchema } from "./node-spec.ts";

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Strict reader: unknown keys, missing keys and wrong types are all rejected. */
export function createReader<T>(schema: TSchema) {
  const validator = Compile(schema);
  return (value: unknown): Result<T, ValidationIssue[]> => {
    if (validator.Check(value)) return ok(value as T);
    return err(validator.Errors(value).map((e) => ({ path: e.instancePath || "/", message: e.message })));
  };
}

export const readNodeSpec = createReader<NodeSpec>(NodeSpecSchema);

export function parseNodeSpecJson(json: string): Result<NodeSpec, ValidationIssue[]> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    return err([{ path: "/", message: `invalid JSON: ${(e as Error).message}` }]);
  }
  return readNodeSpec(value);
}

export function writeNodeSpecJson(spec: NodeSpec): string {
  return `${JSON.stringify(spec, null, 2)}\n`;
}
