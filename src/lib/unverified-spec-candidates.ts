/**
 * QUARANTINED research candidates — NOT verified specifications.
 *
 * Audit finding (2026-10-10, re-checked against freshly fetched OEM
 * documents): every value below was genuinely read from the cited primary
 * OEM brochure / spec-sheet PDF text layer, and the edition facts check
 * out (tyre strings, GC lines, variant tokens all confirmed present or
 * absent as noted). BUT none of the 10 source documents states an exact
 * vehicle model year the figures apply to — a PDF creation date, document
 * title, or printed copyright/footer month is PUBLICATION evidence, not
 * model-year applicability evidence. A text search of all 10 extracted
 * documents for "model year", "model-year", "MY20xx", and "20xx model"
 * returns zero hits.
 *
 * The live catalog schema (`SpecProvenance.modelYear` in
 * `./vehicle-catalog`) means "the model year this reading was published
 * for", so promoting these edition-dated rows would silently equate
 * edition year with model year. All 46 researched combinations therefore
 * live HERE, in a shape that CANNOT satisfy `validateVerifiedSpecRow`:
 * `editionYear` (never `modelYear`) and `verified: false`.
 *
 * NEVER import this file from `vehicle-catalog.ts`, the lookup boundary,
 * any UI component, or any test that counts verified rows. A candidate
 * graduates to `CURATED_SPEC_ROWS` only with archived year-specific
 * primary OEM spec/launch documentation proving the exact same trim AND
 * every field for that exact model year — never on edition dating alone,
 * never by inference across generations (bare "Himalayan" stays out while
 * it is ambiguous across the 411 / 450 generations).
 *
 * Exhaust outlet height/position: no source below publishes either, so no
 * candidate carries exhaust facts. Hyundai PDFs print no ground-clearance
 * line at all (the commonly quoted Creta 190 mm appears nowhere in the
 * extracted text of either Creta PDF), so those candidates carry null GC.
 * Only short fact values + source URLs are stored — no document content.
 */

export interface UnverifiedSpecCandidate {
  /** Stable candidate id. Never a catalog vehicleId (not verified). */
  candidateId: string;
  make: string;
  model: string;
  /**
   * Brochure-EDITION year only (PDF date/title/footer evidence below).
   * Explicitly NOT a proven vehicle model year.
   */
  editionYear: string;
  /** Canonical variant, or "" for the base trim. */
  variant: string;
  market: string;
  tyreFront: string | null;
  tyreRear: string | null;
  groundClearanceMm: number | null;
  /** Verbatim basis tagging, or null when the source states no basis. */
  groundClearanceBasis: string | null;
  /**
   * OEM-published capability figure only (Thar). NOT an intake/exhaust
   * height, NOT a safe-crossing depth.
   */
  wadingMm: number | null;
  sourceUrl: string;
  accessedOn: string;
  /** What dates the EDITION (never the model year). */
  editionEvidence: string;
  /** Why this candidate cannot be a verified row. */
  disqualifier: string;
  readonly verified: false;
}

const ACCESSED_ON = "2026-10-10";

const NO_MODEL_YEAR =
  "No explicit model-year applicability in the source: year is brochure-edition dating only (PDF date/title/footer). Publication date does not establish the exact vehicle model year.";

const SWIFT_SRC =
  "https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/document/Swift_SCNG_VerticalBrochure.pdf";
const SWIFT_EDITION =
  "PDF LastModified 2024-11-20; cites JATO certificate dated 2024-08-27; 'Epic New Swift' (4th-gen Z12E) marketing.";
const SWIFT_NO_MY = `${NO_MODEL_YEAR} Additional: S-CNG vertical brochure used for grade-level tyre/GC lines; fuel-split (CNG) rows never mapped explicitly.`;

const DZIRE_SRC =
  "https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/dzire/brochures/DZire-brochure_.pdf";
const DZIRE_EDITION =
  "PDF title '25082026Dzire6 page brochure', created 2026-09-18; Z12E 4th-gen marketing.";

const ERTIGA_SRC =
  "https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/ertiga/document/ErtigaBrochure_6_Pgs_High_Res.pdf";
const ERTIGA_EDITION =
  "PDF title '2282024MS Ertiga Brochure' (22-08-2024 edition). Text extraction confirms NO ground-clearance line.";

const CRETA_SRC =
  "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/Creta-brochure-new.pdf";
const CRETA_EDITION =
  "PDF created 2023-06-15; printed copyright 'Jan-Feb, 2023'. Text extraction confirms NO ground-clearance line ('190' absent).";
const CRETA_FEB_SRC =
  "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta-suv-brochure.pdf";
const CRETA_FEB_EDITION =
  "PDF created 2023-02-01; printed 'Copyright 2023 ... Jan-Feb, 2023'. Only edition mapping the SX Executive trim.";

const EXTER_SRC =
  "https://org3.hyundai.com/content/dam/hyundai/in/en/data/brochure/exter.pdf";
const EXTER_EDITION =
  "PDF created 2026-09-16; printed footer 'Aug, 2026'; HX-series trim nomenclature. Text extraction confirms NO ground-clearance line.";

const I20_SRC =
  "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/i20.pdf";
const I20_EDITION =
  "PDF created 2026-09-22; printed footer 'Sep, 2026'. Text extraction confirms NO ground-clearance line.";

const VERNA_SRC =
  "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/verna.pdf";
const VERNA_EDITION =
  "PDF created 2026-03-09; printed footer 'Mar, 2026'. Text extraction confirms NO ground-clearance line.";

const THAR_SRC =
  "https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw1a6fc272/brochure/Thar-Brochure-2025-NEW.pdf";
const THAR_EDITION =
  "PDF title 'Thar Brochure 2025 NEW', created 2025-12-09. Dimensions block (GC 226, wading 650) sits under the AXT/LXT variant table.";

const HIMALAYAN_SRC =
  "https://www.royalenfield.com/content/dam/open-pdf/royal-enfield-himalayan-450-technical-specifications-english-2026.pdf";
const HIMALAYAN_EDITION =
  "Single spec block, no mechanical trim split; filename carries '2026'. '411' appears nowhere in the extracted text.";

function candidate(
  candidateId: string,
  make: string,
  model: string,
  editionYear: string,
  variant: string,
  facts: Pick<
    UnverifiedSpecCandidate,
    | "tyreFront"
    | "tyreRear"
    | "groundClearanceMm"
    | "groundClearanceBasis"
    | "wadingMm"
  >,
  source: Pick<
    UnverifiedSpecCandidate,
    "sourceUrl" | "editionEvidence" | "disqualifier"
  >,
): UnverifiedSpecCandidate {
  return {
    candidateId,
    make,
    model,
    editionYear,
    variant,
    market: "IN",
    ...facts,
    sourceUrl: source.sourceUrl,
    accessedOn: ACCESSED_ON,
    editionEvidence: source.editionEvidence,
    disqualifier: source.disqualifier,
    verified: false,
  };
}

const UNLADEN = "Unladen — brochure tags the figure Ground Clearance (mm) (Unladen)";

export const UNVERIFIED_SPEC_CANDIDATES: UnverifiedSpecCandidate[] = [
  // -- Maruti Swift, 2024 edition (5) --------------------------------------
  // Tyre split + "Ground Clearance (mm) (Unladen) 163" confirmed in text.
  ...["swift-lxi", "swift-vxi", "swift-vxi-o"].map((id, i) =>
    candidate(
      id,
      "Maruti",
      "Swift",
      "2024",
      ["LXi", "VXi", "VXi (O)"][i],
      {
        tyreFront: "165/80 R14",
        tyreRear: "165/80 R14",
        groundClearanceMm: 163,
        groundClearanceBasis: UNLADEN,
        wadingMm: null,
      },
      {
        sourceUrl: SWIFT_SRC,
        editionEvidence: SWIFT_EDITION,
        disqualifier: SWIFT_NO_MY,
      },
    ),
  ),
  ...["swift-zxi", "swift-zxi-plus"].map((id, i) =>
    candidate(
      id,
      "Maruti",
      "Swift",
      "2024",
      ["ZXi", "ZXi+"][i],
      {
        tyreFront: "185/65 R15",
        tyreRear: "185/65 R15",
        groundClearanceMm: 163,
        groundClearanceBasis: UNLADEN,
        wadingMm: null,
      },
      {
        sourceUrl: SWIFT_SRC,
        editionEvidence: SWIFT_EDITION,
        disqualifier: SWIFT_NO_MY,
      },
    ),
  ),

  // -- Maruti Dzire, 2026 edition (4) ---------------------------------------
  // R14 steel -> LXI/VXI, R15 alloys -> ZXI/ZXI+ per features table;
  // "Ground clearance (mm) (unladen) 163" confirmed in text.
  ...[
    ["dzire-lxi", "LXI", "165/80 R14"],
    ["dzire-vxi", "VXI", "165/80 R14"],
    ["dzire-zxi", "ZXI", "185/65 R15"],
    ["dzire-zxi-plus", "ZXI+", "185/65 R15"],
  ].map(([id, variant, tyre]) =>
    candidate(
      id,
      "Maruti",
      "Dzire",
      "2026",
      variant,
      {
        tyreFront: tyre,
        tyreRear: tyre,
        groundClearanceMm: 163,
        groundClearanceBasis: UNLADEN,
        wadingMm: null,
      },
      {
        sourceUrl: DZIRE_SRC,
        editionEvidence: DZIRE_EDITION,
        disqualifier: NO_MODEL_YEAR,
      },
    ),
  ),

  // -- Maruti Ertiga, 2024 edition (4) --------------------------------------
  // Single "185/65 R15" for all grades; NO ground-clearance line.
  ...[
    ["ertiga-lxi", "LXi"],
    ["ertiga-vxi", "VXi"],
    ["ertiga-zxi", "ZXi"],
    ["ertiga-zxi-plus", "ZXi+"],
  ].map(([id, variant]) =>
    candidate(
      id,
      "Maruti",
      "Ertiga",
      "2024",
      variant,
      {
        tyreFront: "185/65 R15",
        tyreRear: "185/65 R15",
        groundClearanceMm: null,
        groundClearanceBasis: null,
        wadingMm: null,
      },
      {
        sourceUrl: ERTIGA_SRC,
        editionEvidence: ERTIGA_EDITION,
        disqualifier: NO_MODEL_YEAR,
      },
    ),
  ),

  // -- Hyundai Creta, 2023 editions (6) --------------------------------------
  // "205 / 65 R16" (E, EX, S) and "215 / 60 R17" (SX, SX(O)) confirmed in
  // text (spaced formatting); NO ground-clearance line in either PDF.
  ...[
    ["creta-e", "E", "205/65 R16"],
    ["creta-ex", "EX", "205/65 R16"],
    ["creta-s", "S", "205/65 R16"],
    ["creta-sx", "SX", "215/60 R17"],
    ["creta-sx-o", "SX(O)", "215/60 R17"],
  ].map(([id, variant, tyre]) =>
    candidate(
      id,
      "Hyundai",
      "Creta",
      "2023",
      variant,
      {
        tyreFront: tyre,
        tyreRear: tyre,
        groundClearanceMm: null,
        groundClearanceBasis: null,
        wadingMm: null,
      },
      {
        sourceUrl: CRETA_SRC,
        editionEvidence: CRETA_EDITION,
        disqualifier: NO_MODEL_YEAR,
      },
    ),
  ),
  candidate(
    "creta-sx-executive",
    "Hyundai",
    "Creta",
    "2023",
    "SX Executive",
    {
      tyreFront: "215/60 R17",
      tyreRear: "215/60 R17",
      groundClearanceMm: null,
      groundClearanceBasis: null,
      wadingMm: null,
    },
    {
      sourceUrl: CRETA_FEB_SRC,
      editionEvidence: CRETA_FEB_EDITION,
      disqualifier: NO_MODEL_YEAR,
    },
  ),

  // -- Hyundai Exter, 2026 edition (9, HX-series trims) ----------------------
  // "165/70 R14" (HX 2, HX 3) and "175/65 R15" (rest) confirmed in text;
  // NO ground-clearance line.
  ...[
    ["exter-hx-2", "HX 2", "165/70 R14"],
    ["exter-hx-3", "HX 3", "165/70 R14"],
    ["exter-hx-4", "HX 4", "175/65 R15"],
    ["exter-hx-4-plus", "HX 4+", "175/65 R15"],
    ["exter-hx-6", "HX 6", "175/65 R15"],
    ["exter-hx-6-knight", "HX 6 Knight", "175/65 R15"],
    ["exter-hx-8", "HX 8", "175/65 R15"],
    ["exter-hx-10", "HX 10", "175/65 R15"],
    ["exter-hx-10-knight", "HX 10 Knight", "175/65 R15"],
  ].map(([id, variant, tyre]) =>
    candidate(
      id,
      "Hyundai",
      "Exter",
      "2026",
      variant,
      {
        tyreFront: tyre,
        tyreRear: tyre,
        groundClearanceMm: null,
        groundClearanceBasis: null,
        wadingMm: null,
      },
      {
        sourceUrl: EXTER_SRC,
        editionEvidence: EXTER_EDITION,
        disqualifier: NO_MODEL_YEAR,
      },
    ),
  ),

  // -- Hyundai i20, 2026 edition (8) -----------------------------------------
  // Era 185/70 R14, Magna 185/65 R15, Sportz/Asta lines 195/55 R16
  // confirmed in text; NO ground-clearance line.
  ...[
    ["i20-era", "Era", "185/70 R14"],
    ["i20-magna", "Magna", "185/65 R15"],
    ["i20-sportz", "Sportz", "195/55 R16"],
    ["i20-sportz-o", "Sportz (O)", "195/55 R16"],
    ["i20-sportz-o-knight", "Sportz (O) Knight", "195/55 R16"],
    ["i20-asta", "Asta", "195/55 R16"],
    ["i20-asta-o", "Asta (O)", "195/55 R16"],
    ["i20-asta-o-knight", "Asta (O) Knight", "195/55 R16"],
  ].map(([id, variant, tyre]) =>
    candidate(
      id,
      "Hyundai",
      "i20",
      "2026",
      variant,
      {
        tyreFront: tyre,
        tyreRear: tyre,
        groundClearanceMm: null,
        groundClearanceBasis: null,
        wadingMm: null,
      },
      {
        sourceUrl: I20_SRC,
        editionEvidence: I20_EDITION,
        disqualifier: NO_MODEL_YEAR,
      },
    ),
  ),

  // -- Hyundai Verna, 2026 edition (7) ----------------------------------------
  // HX 2 / HX 4 185/65 R15; HX 6 and up + Turbo 205/55 R16 confirmed in
  // text; NO ground-clearance line.
  ...[
    ["verna-hx-2", "HX 2", "185/65 R15"],
    ["verna-hx-4", "HX 4", "185/65 R15"],
    ["verna-hx-6", "HX 6", "205/55 R16"],
    ["verna-hx-6-plus", "HX 6+", "205/55 R16"],
    ["verna-hx-8", "HX 8", "205/55 R16"],
    ["verna-hx-10", "HX 10", "205/55 R16"],
    ["verna-turbo", "Turbo", "205/55 R16"],
  ].map(([id, variant, tyre]) =>
    candidate(
      id,
      "Hyundai",
      "Verna",
      "2026",
      variant,
      {
        tyreFront: tyre,
        tyreRear: tyre,
        groundClearanceMm: null,
        groundClearanceBasis: null,
        wadingMm: null,
      },
      {
        sourceUrl: VERNA_SRC,
        editionEvidence: VERNA_EDITION,
        disqualifier: NO_MODEL_YEAR,
      },
    ),
  ),

  // -- Mahindra Thar 3-door, 2025 edition (2) ----------------------------------
  // AXT 245/75 R16, LXT 255/65 R18, GC 226 and wading 650 confirmed in
  // text; GC/wading basis unstated in the source.
  candidate(
    "thar-axt",
    "Mahindra",
    "Thar",
    "2025",
    "AXT",
    {
      tyreFront: "245/75 R16",
      tyreRear: "245/75 R16",
      groundClearanceMm: 226,
      groundClearanceBasis: null,
      wadingMm: 650,
    },
    {
      sourceUrl: THAR_SRC,
      editionEvidence: THAR_EDITION,
      disqualifier: NO_MODEL_YEAR,
    },
  ),
  candidate(
    "thar-lxt",
    "Mahindra",
    "Thar",
    "2025",
    "LXT",
    {
      tyreFront: "255/65 R18",
      tyreRear: "255/65 R18",
      groundClearanceMm: 226,
      groundClearanceBasis: null,
      wadingMm: 650,
    },
    {
      sourceUrl: THAR_SRC,
      editionEvidence: THAR_EDITION,
      disqualifier: NO_MODEL_YEAR,
    },
  ),

  // -- Royal Enfield Himalayan 450, 2026 edition (base trim, 1) ------------------
  // "90/90-21" / "140/80 R17" and "Ground Clearance 230 mm" confirmed in
  // text; basis unstated. Bare "Himalayan" is intentionally ambiguous
  // across the 411 / 450 generations, so this stays quarantined even
  // though the source document itself covers the 450.
  candidate(
    "himalayan-base",
    "Royal Enfield",
    "Himalayan",
    "2026",
    "",
    {
      tyreFront: "90/90-21",
      tyreRear: "140/80 R17",
      groundClearanceMm: 230,
      groundClearanceBasis: null,
      wadingMm: null,
    },
    {
      sourceUrl: HIMALAYAN_SRC,
      editionEvidence: HIMALAYAN_EDITION,
      disqualifier: `${NO_MODEL_YEAR} Additional: bare "Himalayan" is ambiguous across the 411 / 450 generations; the source covers the 450 only.`,
    },
  ),
];
