import { node } from "@nuhokai/world";
import { Code } from "./code.ts";
import { Errors } from "./errors.ts";
import { Specs } from "./specs.ts";

/** `nuhokai check`. Inside: Specs (spec rules), Code (planned), Errors (shared by both). */
export const Check = node({
  id: "01a18319-89bb-7640-a85c-2a46040966af",
  purpose: "Ensure the specs follow the rules.",
  status: "planned",
  source: [],
  children: { specs: Specs, code: Code, errors: Errors },
}).edges({});
