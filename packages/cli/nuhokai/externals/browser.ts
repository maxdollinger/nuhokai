import { node } from "@nuhokai/world";

/** Where the map is looked at; nuhokai never opens it. */
export const Browser = node({
  id: "01a19d0d-f3c8-74cc-b38d-ebccaea7dbe5",
  external: true,
  externalType: "api",
  purpose:
    "Whichever web browser the user opens nuhokai/.generated/map.html in, offline from a file URL. Runs the Viewer " +
    "and keeps its saved layout. nuhokai never starts it.",
  status: "built",
  source: [],
  ports: {
    page: {
      kind: "call",
      purpose:
        "Run a local HTML page: inline scripts, a WebGL canvas, pointer, wheel and keyboard input, media queries, a live region for screen readers",
      input: "one self-contained HTML file",
      output: "the rendered, interactive page",
      errors: ["no WebGL"],
    },
    storage: {
      kind: "call",
      purpose: "localStorage: string values by key, per browser and origin, kept across page loads",
      input: "key, and the value to set",
      output: "the stored value, or none",
      errors: ["storage unavailable, blocked or full"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Storage can be missing, blocked or full: the page then forgets moved islands and still works.",
    },
    { id: "R2", text: "Nothing is fetched: the page and its scripts are one file." },
  ],
}).edges({});
