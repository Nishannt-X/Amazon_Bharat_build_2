/**
 * Muse-produced ground-clearance research layer (UNVERIFIED).
 *
 * Source: `docs/research/vehicle-ground-clearance-evidence.json` (327 records,
 * 316 catalog ids). Every record is a research candidate: exact model-year,
 * variant and market applicability is unresolved, so none of it feeds
 * `lookupVehicleSpecs` or the verified-spec path. It is shown only as a
 * clearly labelled reference. Ground clearance is never a flood-crossing limit.
 */

import research from "../data/vehicle-ground-clearance-research.json";
import { findNameEntry, type VehicleNameEntry } from "./vehicle-catalog";

export interface ResearchRecord {
  groundClearanceMm: number | null;
  basis: string;
  sourceKind: string;
  sourceUrl: string;
  fetchVerified: boolean;
  accessedOn: string;
  scope: string;
  note: string;
}

type AuditStatus =
  | "searched-value-found"
  | "searched-no-reliable-value"
  | "conflicting";

interface ResearchEntry {
  status: AuditStatus;
  records: ResearchRecord[];
}

const BY_ID = research.byCatalogId as unknown as Record<string, ResearchEntry>;

/** Number of catalog ids covered by the research file (with or without a value). */
export const RESEARCH_COVERED_IDS = Object.keys(BY_ID).length;

export type ResearchClearanceStatus =
  | "unknown-vehicle"
  | "no-reliable-value"
  | "single-value"
  | "sources-disagree";

export interface ResearchClearance {
  status: ResearchClearanceStatus;
  entry: VehicleNameEntry | null;
  /** Set only for "single-value". Always unverified research. */
  groundClearanceMm: number | null;
  /** Distinct non-null values across records ("sources-disagree" lists several). */
  values: number[];
  /** Records that carry a number. */
  records: ResearchRecord[];
  sourceClass: "oem" | "secondary" | "mixed" | null;
  basis: string | null;
  verified: false;
  accessDate: string;
}

function none(
  status: ResearchClearanceStatus,
  entry: VehicleNameEntry | null,
): ResearchClearance {
  return {
    status,
    entry,
    groundClearanceMm: null,
    values: [],
    records: [],
    sourceClass: null,
    basis: null,
    verified: false,
    accessDate: research.accessDate,
  };
}

/** Exact make+model lookup. Model year is deliberately not an input: the
 *  research cannot confirm any year, so it never narrows or "verifies". */
export function lookupResearchClearance(
  make: string,
  model: string,
): ResearchClearance {
  const entry = findNameEntry(make, model);
  if (!entry) return none("unknown-vehicle", null);
  const found = BY_ID[entry.id];
  const records = (found?.records ?? []).filter(
    (record) => record.groundClearanceMm != null,
  );
  if (found?.status === "conflicting") {
    // Audit marked the sources as conflicting: withhold every number.
    return { ...none("sources-disagree", entry), records };
  }
  if (!found || records.length === 0) return none("no-reliable-value", entry);
  const values = Array.from(
    new Set(records.map((record) => record.groundClearanceMm as number)),
  ).sort((a, b) => a - b);
  const oem = records.filter((record) => record.sourceKind.startsWith("oem"));
  const sourceClass =
    oem.length === 0 ? "secondary" : oem.length === records.length ? "oem" : "mixed";
  const single = values.length === 1;
  const bases = new Set(records.map((record) => record.basis));
  return {
    status: single ? "single-value" : "sources-disagree",
    entry,
    groundClearanceMm: single ? values[0] : null,
    values,
    records,
    sourceClass,
    basis: bases.size === 1 ? Array.from(bases)[0] : null,
    verified: false,
    accessDate: research.accessDate,
  };
}

const NON_CAR_MAKES = new Set([
  "Ather", "Bajaj", "Hero", "KTM", "Ola", "Royal Enfield", "TVS", "Yamaha", "Suzuki", "DTC",
]);
const NON_CAR_HONDA = new Set([
  "Activa 6G", "Activa 125", "Dio", "Shine", "SP 125", "Unicorn", "Hornet 2.0", "H'ness CB350", "CB350RS",
]);

/** Car-selection filter for the car-only UI (two-wheelers and the bus are excluded). */
export function isCarEntry(entry: VehicleNameEntry): boolean {
  if (NON_CAR_MAKES.has(entry.make)) return false;
  if (entry.make === "Honda" && NON_CAR_HONDA.has(entry.model)) return false;
  return true;
}

/** Plain-language description of the research value for display. */
export function describeResearchClearance(result: ResearchClearance): {
  value: string;
  caption: string;
} {
  if (result.status === "single-value") {
    const origin =
      result.sourceClass === "oem"
        ? "Manufacturer-class source"
        : result.sourceClass === "mixed"
          ? "Manufacturer and secondary sources"
          : "Secondary (non-manufacturer) source";
    const basis =
      result.basis && !["unknown", "unstated", "secondary"].includes(result.basis)
        ? `${result.basis} basis`
        : "measurement basis not stated";
    return {
      value: `${result.groundClearanceMm} mm`,
      caption: `Unverified research. ${origin}, ${basis}. Model year and trim not confirmed.`,
    };
  }
  if (result.status === "sources-disagree") {
    return result.values.length > 0
      ? {
          value: `${result.values.join(" / ")} mm`,
          caption: "Unverified research. Sources or editions disagree, so no single figure is shown as the reference.",
        }
      : {
          value: "Sources conflict",
          caption: "Researched sources conflict for this model, so no figure is shown.",
        };
  }
  return {
    value: "Unavailable",
    caption: "No reliable ground-clearance figure was found for this model.",
  };
}
