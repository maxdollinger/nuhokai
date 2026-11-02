import { node } from "@nuhokai/world";

/** The 3D library the map draws with, inlined into every map. */
export const ThreeJs = node({
  id: "01a19d0d-f3ce-7579-af2c-a929efcd4856",
  external: true,
  externalType: "api",
  purpose:
    "three.js with OrbitControls, at the exactly pinned dev-dependency version: scene graph, WebGL renderer and " +
    "camera controls the Viewer draws with. Inlined into every map at build time; not built by us.",
  status: "built",
  source: [],
  ports: {
    render: {
      kind: "call",
      purpose: "Build a 3D scene, render it to a WebGL canvas and orbit, pan and zoom its camera",
      input: "meshes, materials, lights, camera; pointer input for the controls",
      output: "the drawn frame",
    },
  },
  requirements: [
    { id: "R1", text: "One classic script setting THREE, so the map inlines it and loads nothing." },
    { id: "R2", text: "Its license header stays in every map." },
  ],
}).edges({});
