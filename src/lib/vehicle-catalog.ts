/**
 * Typed local vehicle catalog foundation (FloodFlow frontend milestone).
 *
 * Two layers, deliberately separated:
 *
 * 1. Name catalog (`src/data/vehicles.json`): manufacturer + model names
 *    with stable ids. Names only — no specifications, verified or otherwise.
 *    Suggestion matching normalizes case/whitespace independently and never
 *    implies specifications. Ambiguous names stay bare (e.g. "Himalayan" is
 *    never auto-expanded to a generation/year such as 411/450).
 *
 * 2. Verified spec rows (`VERIFIED_SPEC_ROWS` below): curated, provenance-
 *    backed numeric specifications matched by EXACT normalized
 *    make/model/year/variant/market only (market defaults to "IN"). No fuzzy matching, no nearest-year
 *    fallback, no generation guessing. The live catalog is intentionally
 *    empty — no verified numeric rows exist yet — so every lookup today
 *    resolves to "unknown / not available" and the UI must say so honestly.
 *
 * Device-local only. No backend, no database, no network.
 */

import vehicleNames from "../data/vehicles.json";

// ---------------------------------------------------------------------------
// Name catalog
// ---------------------------------------------------------------------------

export interface VehicleNameEntry {
  /** Stable id, never renamed once referenced. */
  id: string;
  /** Manufacturer/operator name as shown, e.g. "Royal Enfield". */
  make: string;
  /** Model name as shown, e.g. "Himalayan" (never a generation/year). */
  model: string;
  /** Full display string, e.g. "Royal Enfield Himalayan". */
  displayName: string;
}

function isVehicleNameEntry(value: unknown): value is VehicleNameEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.make === "string" &&
    typeof v.model === "string" &&
    typeof v.displayName === "string" &&
    v.id.length > 0 &&
    v.make.length > 0 &&
    v.model.length > 0 &&
    v.displayName.length > 0
  );
}

/** Name catalog in file order. Throws on malformed entries (fail loud). */
export const VEHICLE_NAMES: VehicleNameEntry[] = (
  vehicleNames as unknown[]
).map((entry, index) => {
  if (!isVehicleNameEntry(entry)) {
    throw new Error(`Vehicle name catalog entry ${index} is malformed.`);
  }
  return entry;
});

/** Normalize a freeform name: trim, collapse inner whitespace, lowercase.
 *  Used for suggestion filtering and lookup keys — never shown to users. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalize a year: digits only, trimmed. "2021 " => "2021". */
export function normalizeYear(value: string): string {
  return value.trim();
}

/** Normalize a variant: like a name, but empty stays empty (base trim). */
export function normalizeVariant(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Unique manufacturer names in catalog order. */
export function listMakes(): string[] {
  const seen = new Set<string>();
  const makes: string[] = [];
  for (const entry of VEHICLE_NAMES) {
    if (!seen.has(entry.make)) {
      seen.add(entry.make);
      makes.push(entry.make);
    }
  }
  return makes;
}

/** Manufacturer names matching a typed prefix (normalized contains).
 *  Empty prefix returns all makes. Freeform input is always allowed —
 *  suggestions only. */
export function suggestMakes(prefix: string): string[] {
  const needle = normalizeName(prefix);
  if (!needle) return listMakes();
  return listMakes().filter((make) =>
    normalizeName(make).includes(needle),
  );
}

/** Model names, filtered to the given manufacturer when it exactly matches
 *  (normalized) a catalog make; otherwise all models. `modelPrefix`
 *  narrows by normalized contains. Suggestions only — never spec-implying,
 *  never generation-expanded. */
export function suggestModels(
  makeQuery: string,
  modelPrefix = "",
): string[] {
  const wantMake = normalizeName(makeQuery);
  const known = VEHICLE_NAMES.some(
    (entry) => normalizeName(entry.make) === wantMake,
  );
  const pool = known
    ? VEHICLE_NAMES.filter(
        (entry) => normalizeName(entry.make) === wantMake,
      )
    : VEHICLE_NAMES;
  const needle = normalizeName(modelPrefix);
  const models = pool.map((entry) => entry.model);
  const unique = Array.from(new Set(models));
  if (!needle) return unique;
  return unique.filter((model) => normalizeName(model).includes(needle));
}

/** Exact normalized make+model lookup in the name catalog.
 *  Null when the pair is not a known name (freeform fallback). */
export function findNameEntry(
  make: string,
  model: string,
): VehicleNameEntry | null {
  const wantMake = normalizeName(make);
  const wantModel = normalizeName(model);
  if (!wantMake || !wantModel) return null;
  return (
    VEHICLE_NAMES.find(
      (entry) =>
        normalizeName(entry.make) === wantMake &&
        normalizeName(entry.model) === wantModel,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Verified specifications (curated rows + exact lookup boundary)
// ---------------------------------------------------------------------------

/** Where a spec value was read from. `test-fixture` exists so unit tests
 *  can exercise the schema without making real OEM claims. */
export type SpecSourceClass =
  | "oem-spec-sheet"
  | "oem-owner-manual"
  | "test-fixture";

/** Per-field provenance. Required whenever the field value is non-null:
 *  a non-null spec without complete provenance is invalid (see
 *  `validateVerifiedSpecRow`). */
export interface SpecProvenance {
  /** Direct source URL (or fixture placeholder, never a guessed OEM URL). */
  sourceUrl: string;
  sourceClass: SpecSourceClass;
  /** ISO access date, e.g. "2026-03-14". */
  accessedOn: string;
  /** Applicability: market this reading was published for, e.g. "IN". */
  market: string;
  /** Applicability: model year this reading was published for. */
  modelYear: string;
  /** Applicability: normalized variant, or null for the base trim. */
  variant: string | null;
  /** Measurement basis, e.g. "kerb", "laden", "OEM published". */
  basis: string;
  /** Whether a reviewer confirmed value + provenance against the source. */
  verified: boolean;
}

/** A single spec field: a value WITH its provenance, or null for unknown.
 *  Null means "not available" — never 0, never "", never a guess. */
export type SpecField<T> = { value: T; provenance: SpecProvenance } | null;

export interface VerifiedSpecRow {
  /** Stable id of the name-catalog entry this row documents. */
  vehicleId: string;
  /** Canonical (display-case) make/model, e.g. "Honda" / "Activa 6G". */
  make: string;
  model: string;
  /** 4-digit model year this row was published for, e.g. "2021". */
  year: string;
  /** Canonical variant, or "" for the base trim. */
  variant: string;
  /** Market this row was published for, e.g. "IN". */
  market: string;
  tyreFront: SpecField<string>;
  tyreRear: SpecField<string>;
  /** Ground clearance in mm. Basis (kerb/laden/…) lives in provenance. */
  groundClearanceMm: SpecField<number>;
  /** Exhaust outlet height in mm, with position (e.g. "right, high"). */
  exhaustHeightMm: SpecField<number>;
  exhaustPosition: SpecField<string>;
  /** OEM-published wading depth in mm, when the OEM publishes one. */
  wadingMm: SpecField<number>;
}

/**
 * Live verified-spec catalog. Intentionally EMPTY: no verified numeric
 * rows exist yet. Numeric RE/Thar/Activa/Creta/Alto values must NOT be
 * seeded here without proven exact market/model-year/variant provenance.
 * Test fixtures carrying `sourceClass: "test-fixture"` live only in
 * `vehicle-catalog.test.ts` and are never real OEM claims.
 */
export const VERIFIED_SPEC_ROWS: VerifiedSpecRow[] = [];

export interface VehicleSpecQuery {
  make: string;
  model: string;
  year: string;
  variant: string;
  /** Market code, e.g. "IN". Omitted means "IN" — never a wildcard. */
  market?: string;
}

/** Default query market. The IN market is the only market this product
 *  serves; an explicit unknown/empty market never matches (fail closed). */
export const DEFAULT_SPEC_MARKET = "IN";

/** Normalize a market code: trim + uppercase. " in " => "IN". */
export function normalizeMarket(value: string): string {
  return value.trim().toUpperCase();
}

/** Validation context. `test-fixture` provenance is accepted ONLY when
 *  `allowTestFixtures` is explicitly true (unit tests). Production
 *  callers leave it unset so fixture rows can never verify a lookup. */
export interface SpecValidationOptions {
  allowTestFixtures?: boolean;
}

export type SpecLookupStatus =
  | "unknown-vehicle"
  | "no-verified-row"
  | "verified";

export interface SpecLookupResult {
  status: SpecLookupStatus;
  /** Name-catalog entry when the make/model pair is known, else null
   *  (caller keeps freeform input; nothing is auto-corrected). */
  entry: VehicleNameEntry | null;
  /** The exact verified row on "verified", else null. */
  row: VerifiedSpecRow | null;
  /** Fail-closed detail (e.g. "ambiguous-match"). Diagnostic only —
   *  never rendered by the UI. */
  reason?: string;
}

function rowMatchesQuery(
  row: VerifiedSpecRow,
  query: VehicleSpecQuery,
): boolean {
  const queryMarket =
    query.market === undefined ? DEFAULT_SPEC_MARKET : query.market;
  if (queryMarket.trim().length === 0) return false;
  return (
    normalizeName(row.make) === normalizeName(query.make) &&
    normalizeName(row.model) === normalizeName(query.model) &&
    normalizeYear(row.year) === normalizeYear(query.year) &&
    normalizeVariant(row.variant) === normalizeVariant(query.variant) &&
    normalizeMarket(row.market) === normalizeMarket(queryMarket)
  );
}

/**
 * Honest spec lookup boundary. EXACT normalized make/model/year/variant/
 * market match against curated rows — no fuzzy matching, no nearest-year
 * fallback, no generation guessing, and a blank variant never acts as a
 * wildcard (it matches only a row explicitly published for the base
 * trim). A row counts ONLY when it passes `validateVerifiedSpecRow`
 * (verified provenance, applicable market/year/variant, sane values);
 * duplicate exact matches are rejected, never first-wins. The UI must
 * route ALL spec display through this function instead of ad-hoc values.
 */
export function lookupVehicleSpecs(
  query: VehicleSpecQuery,
  rows: readonly VerifiedSpecRow[] = VERIFIED_SPEC_ROWS,
  options: SpecValidationOptions = {},
): SpecLookupResult {
  const entry = findNameEntry(query.make, query.model);
  if (!entry) return { status: "unknown-vehicle", entry: null, row: null };
  const valid = rows.filter(
    (candidate) =>
      rowMatchesQuery(candidate, query) &&
      validateVerifiedSpecRow(candidate, options).length === 0,
  );
  if (valid.length === 1) return { status: "verified", entry, row: valid[0] };
  if (valid.length > 1) {
    return {
      status: "no-verified-row",
      entry,
      row: null,
      reason: "ambiguous-match",
    };
  }
  return { status: "no-verified-row", entry, row: null };
}

/** UI-ready spec lines. Every line reads "Not available" unless an exact
 *  verified row provides that field. No safe-to-cross formula exists. */
export interface SpecDisplay {
  tyre: string;
  groundClearance: string;
  exhaust: string;
}

const NOT_AVAILABLE = "Not available";

export function toSpecDisplay(
  result: SpecLookupResult,
  options: SpecValidationOptions = {},
): SpecDisplay {
  const row = result.row;
  // Belt and suspenders: numbers render ONLY for a "verified" result
  // whose row still validates. A hand-built result carrying a row with
  // any other status (or an invalid row) shows "Not available".
  if (
    result.status !== "verified" ||
    !row ||
    validateVerifiedSpecRow(row, options).length > 0
  ) {
    return {
      tyre: NOT_AVAILABLE,
      groundClearance: NOT_AVAILABLE,
      exhaust: NOT_AVAILABLE,
    };
  }
  const tyreParts = [row.tyreFront?.value, row.tyreRear?.value].filter(
    (part): part is string =>
      typeof part === "string" && part.trim().length > 0,
  );
  return {
    tyre: tyreParts.length > 0 ? tyreParts.join(" / ") : NOT_AVAILABLE,
    groundClearance:
      row.groundClearanceMm != null
        ? `${row.groundClearanceMm.value} mm`
        : NOT_AVAILABLE,
    exhaust:
      row.exhaustPosition != null || row.exhaustHeightMm != null
        ? [
            row.exhaustPosition?.value,
            row.exhaustHeightMm != null
              ? `${row.exhaustHeightMm.value} mm`
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || NOT_AVAILABLE
        : NOT_AVAILABLE,
  };
}

// ---------------------------------------------------------------------------
// Row validation (keeps future curated rows honest)
// ---------------------------------------------------------------------------

export interface RowValidationIssue {
  field: string;
  message: string;
}

const SPEC_NUMBER_FIELDS: readonly string[] = [
  "groundClearanceMm",
  "exhaustHeightMm",
  "wadingMm",
];

const SPEC_STRING_FIELDS: readonly string[] = [
  "tyreFront",
  "tyreRear",
  "exhaustPosition",
];

function isValidHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Strict ISO date (YYYY-MM-DD) that names an actual calendar date. */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const [year, month, day] = value.trim().split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isCompleteProvenance(
  value: unknown,
  options: SpecValidationOptions,
): value is SpecProvenance {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  const sourceClassOk =
    p.sourceClass === "oem-spec-sheet" ||
    p.sourceClass === "oem-owner-manual" ||
    (options.allowTestFixtures === true && p.sourceClass === "test-fixture");
  return (
    typeof p.sourceUrl === "string" &&
    isValidHttpUrl(p.sourceUrl) &&
    sourceClassOk &&
    typeof p.accessedOn === "string" &&
    isValidIsoDate(p.accessedOn) &&
    typeof p.market === "string" &&
    p.market.trim().length > 0 &&
    typeof p.modelYear === "string" &&
    p.modelYear.trim().length > 0 &&
    (typeof p.variant === "string" || p.variant === null) &&
    typeof p.basis === "string" &&
    p.basis.trim().length > 0 &&
    p.verified === true
  );
}

function checkSpecField(
  issues: RowValidationIssue[],
  row: VerifiedSpecRow,
  field: string,
  options: SpecValidationOptions,
): void {
  const slot = (row as unknown as Record<string, unknown>)[field] as
    | SpecField<unknown>
    | null
    | undefined;
  // Null is the ONLY unknown marker — undefined (a missing key) is a
  // malformed row, never silent "unknown".
  if (slot === undefined) {
    issues.push({
      field,
      message: "Spec field must be null when unknown, never undefined.",
    });
    return;
  }
  if (slot === null) return; // unknown: valid
  if (
    typeof slot !== "object" ||
    slot === null ||
    !("value" in slot) ||
    !("provenance" in slot)
  ) {
    issues.push({ field, message: "Non-null spec field must carry provenance." });
    return;
  }
  const { value, provenance } = slot as {
    value: unknown;
    provenance: unknown;
  };
  if (SPEC_NUMBER_FIELDS.includes(field)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      issues.push({
        field,
        message:
          "Spec value must be a positive finite number in mm (never 0, negative, NaN, or Infinity).",
      });
    }
  } else if (SPEC_STRING_FIELDS.includes(field)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push({
        field,
        message: "Spec value must be a non-empty string.",
      });
    }
  }
  if (!isCompleteProvenance(provenance, options)) {
    issues.push({
      field,
      message:
        "Non-null spec field needs complete verified provenance (http(s) sourceUrl, oem sourceClass, real ISO accessedOn, market, modelYear, variant, basis, verified === true).",
    });
    return;
  }
  const p = provenance as SpecProvenance;
  if (normalizeMarket(p.market) !== normalizeMarket(row.market)) {
    issues.push({
      field,
      message: `Provenance market "${p.market}" does not match row market "${row.market}".`,
    });
  }
  if (normalizeYear(p.modelYear) !== normalizeYear(row.year)) {
    issues.push({
      field,
      message: `Provenance modelYear "${p.modelYear}" does not match row year "${row.year}".`,
    });
  }
  if (normalizeVariant(p.variant ?? "") !== normalizeVariant(row.variant ?? "")) {
    issues.push({
      field,
      message: `Provenance variant "${p.variant ?? ""}" does not match row variant "${row.variant}".`,
    });
  }
}

/** Validate a candidate curated row. Fails closed: null spec fields are
 *  valid (unknown); every non-null field MUST carry verified (`verified
 *  === true`) provenance whose market/model-year/variant applicability
 *  matches the row, with sane physical values. The row's vehicleId must
 *  resolve to its make/model in the name catalog. */
export function validateVerifiedSpecRow(
  row: VerifiedSpecRow,
  options: SpecValidationOptions = {},
): RowValidationIssue[] {
  const issues: RowValidationIssue[] = [];
  if (!/^\d{4}$/.test(row.year ?? "")) {
    issues.push({ field: "year", message: "Year must be a 4-digit string." });
  }
  if (typeof row.market !== "string" || row.market.trim().length === 0) {
    issues.push({ field: "market", message: "Market must be non-empty." });
  }
  if (typeof row.variant !== "string") {
    issues.push({
      field: "variant",
      message: 'Variant must be a string ("" for the base trim).',
    });
  }
  if (
    typeof row.make !== "string" ||
    row.make.trim().length === 0 ||
    typeof row.model !== "string" ||
    row.model.trim().length === 0
  ) {
    issues.push({
      field: "vehicleId",
      message: "Row make/model must be non-empty.",
    });
  } else {
    const entry = findNameEntry(row.make, row.model);
    if (!entry) {
      issues.push({
        field: "vehicleId",
        message: "Row make/model is not a known catalog name.",
      });
    } else if (entry.id !== row.vehicleId) {
      issues.push({
        field: "vehicleId",
        message: `Row vehicleId "${row.vehicleId}" does not match catalog id "${entry.id}".`,
      });
    }
  }
  for (const field of [...SPEC_STRING_FIELDS, ...SPEC_NUMBER_FIELDS]) {
    checkSpecField(issues, row, field, options);
  }
  return issues;
}
