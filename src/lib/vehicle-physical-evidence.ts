import evidence from "../data/vehicle-physical-evidence.json";

export interface PhysicalHeightEvidence {
  valueMm: number | null;
  status: string;
  note: string;
}
export interface VehiclePhysicalEvidence {
  vehicleId: string;
  checkedAt: string | null;
  reviewStatus: string;
  manuals: {
    label: string;
    url: string;
    yearFrom: number;
    yearTo: number | null;
    variants: string[];
    scope: string;
  }[];
  wading: {
    valueMm: number;
    label: string;
    url: string;
    scope: string;
    modelYears: number[];
    variants: string[];
    conditions: string;
  } | null;
  intake: PhysicalHeightEvidence;
  exhaust: PhysicalHeightEvidence;
  notes: string[];
}

/** Every catalog vehicle has a persisted coverage record; an unreviewed row is not a negative research finding. */
export function lookupPhysicalEvidence(vehicleId: string): VehiclePhysicalEvidence {
  const rows = evidence.byCatalogId as Record<string, VehiclePhysicalEvidence>;
  const row = rows[vehicleId];
  if (row) return row;
  return {
    vehicleId,
    checkedAt: null,
    reviewStatus: "awaiting-source-review",
    manuals: [],
    wading: null,
    intake: { valueMm: null, status: "not-sourced", note: "A documented intake height or physical measurement is still needed." },
    exhaust: { valueMm: null, status: "not-sourced", note: "A documented exhaust-outlet height or physical measurement is still needed." },
    notes: ["Exact year/trim and physical-height sources have not been reviewed for this model."],
  };
}

export function physicalEvidenceForSelection(evidence: VehiclePhysicalEvidence, year: string, variant: string) {
  const selectedYear = Number(year);
  const manuals = evidence.manuals.filter(manual => selectedYear >= manual.yearFrom && selectedYear <= (manual.yearTo ?? new Date().getFullYear()));
  const exactTrim = variant.trim() !== "" && manuals.some(manual => manual.variants.some(trim => trim.toLowerCase() === variant.trim().toLowerCase()));
  return {
    ...evidence,
    matchingManuals: manuals,
    yearLabel: manuals.length ? `Production-period manual found for ${year}` : "Exact production-period reference needed",
    trimLabel: exactTrim ? "Trim covered by the documented manual" : "Exact trim not documented in this reference",
    transitionYear: manuals.length > 1,
  };
}
