/** Manufacturer references describe the currently offered car, never an aged owner's exact variant. */
export interface VehicleReferenceStats {
  label: string;
  startingPriceInr: number;
  groundClearanceMm: number | null;
  clearanceBasis: string | null;
  checkedAt: string;
  sources: { label: string; url: string }[];
}

const REFERENCES: Record<string, VehicleReferenceStats> = {
  "maruti/swift": {
    label: "Current India Swift range",
    startingPriceInr: 583900,
    groundClearanceMm: 163,
    clearanceBasis: "Unladen · current-generation brochure",
    checkedAt: "2026-10-11",
    sources: [
      { label: "Maruti Suzuki price", url: "https://www.marutisuzuki.com/arena/configurator/swift" },
      { label: "Maruti Suzuki brochure", url: "https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/brochures/Vertical%20Brochure%20revised_5.pdf" },
    ],
  },
  "hyundai/creta": {
    label: "Current India CRETA range",
    startingPriceInr: 1090700,
    groundClearanceMm: null,
    clearanceBasis: null,
    checkedAt: "2026-10-11",
    sources: [{ label: "Hyundai India price", url: "https://org2.hyundai.com/in/en/find-a-car/creta/price" }],
  },
};

export function lookupVehicleReference(make: string, model: string): VehicleReferenceStats | null {
  const normalizedMake = make.trim().toLowerCase().replace(/^maruti suzuki$/, "maruti");
  return REFERENCES[`${normalizedMake}/${model.trim().toLowerCase()}`] ?? null;
}

/** Age is an explicit whole-year input, not a depreciation or specification estimate. */
export function modelYearFromAge(age: string, currentYear: number): string | null {
  if (!/^\d{1,2}$/.test(age)) return null;
  const years = Number(age);
  if (years < 0 || years > 46) return null;
  return String(currentYear - years);
}
