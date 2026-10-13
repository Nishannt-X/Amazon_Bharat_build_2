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

/** Any dry reference the CV pipeline can compare against: a bundled demo image or a fetched Street View view. */
export interface ReferenceCandidate {
  id: string;
  label: string;
  imageUrl: string;
  roadType: string;
  location: { lat: number; lng: number } | null;
  referenceHeightMm: number | null;
  /** Server-side file path when the image does not live under public/. */
  imagePath?: string;
}

/**
 * Local demo incident: a published news photo of waterlogging at Connaught Place,
 * New Delhi, paired with the dry Street View reference above. The coordinate is
 * the Street View capture point, supplied by the team. Demo runs are never
 * published to the shared map.
 */
export const DEMO_INCIDENT = {
  id: "connaught-place",
  description: "Waterlogged inner circle road in front of the white colonnade, with a car and a motorcyclist wading through.",
  photoUrl: "/demo/wet-cp.jpg",
  fileName: "connaught-place-waterlog-demo.jpg",
  label: "Connaught Place, New Delhi",
  location: { lat: 28.63470286, lng: 77.22210794 },
  accuracyMeters: 10,
  expectedBaselineId: "delhi-highway-demo-v1",
} as const;

/** Incidents offered by the demo popup. Add entries here to offer more. */
export const DEMO_INCIDENTS = [DEMO_INCIDENT] as const;
export type DemoIncident = (typeof DEMO_INCIDENTS)[number];
