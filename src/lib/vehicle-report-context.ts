import references from "../data/vehicle-oem-references.json";
/** Manufacturer references describe the currently offered car, never an aged owner's exact variant. */
export interface VehicleReferenceStats {
  label: string;
  startingPriceInr: number | null;
  groundClearanceMm: number | null;
  clearanceBasis: string | null;
  checkedAt: string;
  sources: { label: string; url: string }[];
  market?: string;
  modelYear?: string | null;
  variant?: string | null;
  publishedOn?: string | null;
  intakeHeightMm?: number | null;
  exhaustHeightMm?: number | null;
  wadingMm?: number | null;
  priceBasis?: string;
  provenance?: Record<string, {sourceUrl:string;sourceClass:string;retrievedOn:string;unit:string;scope:string;market:string;modelYear:string|null;variant:string|null;basis:string|null;publishedOn:string|null} | null>;
}

export function lookupVehicleReference(make: string, model: string): VehicleReferenceStats | null {
  const normalizedMake = make.trim().toLowerCase().replace(/^maruti suzuki$/, "maruti");
  return references.find(row=>row.make.toLowerCase()===normalizedMake && row.model.toLowerCase()===model.trim().toLowerCase()) ?? null;
}

/** Age is an explicit whole-year input, not a depreciation or specification estimate. */
export function modelYearFromAge(age: string, currentYear: number): string | null {
  if (!/^\d{1,2}$/.test(age)) return null;
  const years = Number(age);
  if (years < 0 || years > 46) return null;
  return String(currentYear - years);
}
