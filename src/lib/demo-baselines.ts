/** User-supplied examples, not surveyed references or verified live incidents. */
export const DEMO_BASELINES = [
  {
    id: "mural-underpass-demo-v1",
    label: "Mural underpass",
    imageUrl: "/demo/dry-underpass.png",
    roadType: "Underpass",
    location: null,
    referenceHeightMm: 250,
  },
  {
    id: "delhi-highway-demo-v1",
    label: "Delhi highway · user-supplied dry reference",
    imageUrl: "/demo/dry-highway-delhi.png",
    roadType: "Highway",
    location: { lat: 28.63470286, lng: 77.22210794 },
    referenceHeightMm: null,
  },
] as const;

export type DemoBaseline = (typeof DEMO_BASELINES)[number];
