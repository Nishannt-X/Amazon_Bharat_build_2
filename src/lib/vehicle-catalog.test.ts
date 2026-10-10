/**
 * Verification for the typed vehicle catalog (src/lib/vehicle-catalog.ts).
 *
 * No test runner is installed in this repo, so this file uses the Node
 * built-in test runner (`node:test`, no dependencies). Run
 * `npm run test:vehicles` (scripts/run-vehicle-catalog-tests.mjs,
 * dependency-free) to execute it via a temp copy.
 *
 * IMPORTANT: all spec values in FIXTURE rows below are TEST FIXTURES
 * (`sourceClass: "test-fixture"`, example.invalid URLs). They exercise the
 *  schema and the exact-match boundary only and are NEVER real OEM claims.
 *  The live catalog (`VERIFIED_SPEC_ROWS`, curated in
 *  `verified-spec-rows.ts`) is CURRENTLY EMPTY: the 2026-10-10 audit
 *  found every researched row carried edition-dating only (PDF
 *  date/title/footer), which cannot verify an exact model year, so all
 *  46 researched combinations were quarantined to
 *  `UNVERIFIED_SPEC_CANDIDATES` (`unverified-spec-candidates.ts`, a
 *  shape that cannot validate: `editionYear`, never `modelYear`;
 *  `verified: false`). The "live catalog" suites below assert the empty
 *  verified set, the intact quarantine, and the unchanged
 *  unsupported/blank-year behavior.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findNameEntry,
  listMakes,
  lookupVehicleSpecs,
  normalizeName,
  suggestMakes,
  suggestModels,
  toSpecDisplay,
  validateVerifiedSpecRow,
  VEHICLE_NAMES,
  VERIFIED_SPEC_ROWS,
  type SpecProvenance,
  type VerifiedSpecRow,
} from "./vehicle-catalog";
import { UNVERIFIED_SPEC_CANDIDATES } from "./unverified-spec-candidates";

/** Fixture provenance: unmistakably fake, never an OEM claim. */
function fixtureProvenance(
  overrides: Partial<SpecProvenance> = {},
): SpecProvenance {
  return {
    sourceUrl: "https://example.invalid/fixtures/spec-sheet",
    sourceClass: "test-fixture",
    accessedOn: "2026-01-15",
    market: "IN",
    modelYear: "2020",
    variant: null,
    basis: "fixture published",
    verified: true,
    ...overrides,
  };
}

/** Fixture row: invented numbers for boundary tests only. Uses a real
 *  catalog name (Honda Activa 6G) so the name layer resolves and the
 *  year/variant exactness boundary is what gets exercised. */
function fixtureRow(overrides: Partial<VerifiedSpecRow> = {}): VerifiedSpecRow {
  return {
    vehicleId: "honda-activa-6g",
    make: "Honda",
    model: "Activa 6G",
    year: "2020",
    variant: "",
    market: "IN",
    tyreFront: { value: "100/90-10", provenance: fixtureProvenance() },
    tyreRear: { value: "110/90-10", provenance: fixtureProvenance() },
    groundClearanceMm: { value: 150, provenance: fixtureProvenance() },
    exhaustHeightMm: { value: 400, provenance: fixtureProvenance() },
    exhaustPosition: { value: "right, low", provenance: fixtureProvenance() },
    wadingMm: null,
    ...overrides,
  };
}

/** Explicit test mechanism: pass this as the validation options whenever
 *  fixture rows are MEANT to count as valid. Production calls omit it,
 *  so `sourceClass: "test-fixture"` rows can never verify a live lookup. */
const FIXTURES = { allowTestFixtures: true };

/** Fixture row whose per-field provenance applicability (market, model
 *  year, variant) is rewritten to match the row itself. Use this when
 *  the test is about lookup exactness, not about provenance mismatch. */
function consistentFixtureRow(
  overrides: Partial<VerifiedSpecRow> = {},
): VerifiedSpecRow {
  const row = fixtureRow(overrides);
  const provenance = fixtureProvenance({
    market: row.market,
    modelYear: row.year,
    variant: row.variant === "" ? null : row.variant,
  });
  for (const field of [
    "tyreFront",
    "tyreRear",
    "groundClearanceMm",
    "exhaustHeightMm",
    "exhaustPosition",
  ] as const) {
    const slot = row[field];
    if (slot !== null && slot !== undefined) {
      // Indexed write across the string/number field union: assign
      // through a record view (same runtime shape, keeps tsc happy).
      (row as unknown as Record<string, unknown>)[field] = {
        value: slot.value,
        provenance: { ...provenance },
      };
    }
  }
  return row;
}

describe("name catalog", () => {
  it("keeps the baseline five names with make/model separated and stable ids (additions allowed)", () => {
    const entry = findNameEntry("Royal Enfield", "Himalayan");
    assert.ok(entry);
    assert.equal(entry?.id, "royal-enfield-himalayan");
    assert.equal(entry?.displayName, "Royal Enfield Himalayan");
    assert.ok(findNameEntry("Honda", "Activa 6G"));
    assert.ok(findNameEntry("Hyundai", "Creta"));
    assert.ok(findNameEntry("Maruti", "Alto K10"));
    assert.ok(findNameEntry("DTC", "Low-Floor Bus"));
    // Sourced names-only additions never remove the baseline.
    assert.ok(VEHICLE_NAMES.length >= 5);
  });

  it("never auto-expands ambiguous names to a generation/year", () => {
    assert.equal(findNameEntry("Royal Enfield", "Himalayan 411"), null);
    assert.equal(findNameEntry("Royal Enfield", "Himalayan 450"), null);
    const models = suggestModels("Royal Enfield");
    // Catalog growth adds sibling models, never generation/year splits:
    // "Himalayan" stays bare and no "Himalayan <digits>" entry may appear.
    assert.ok(models.includes("Himalayan"));
    for (const model of models) {
      assert.ok(
        !/^himalayan\s+\d/i.test(model),
        `generation-expanded model: ${model}`,
      );
    }
  });

  it("lists manufacturers separately from models", () => {
    const makes = listMakes();
    assert.ok(makes.includes("Honda"));
    assert.ok(makes.includes("Royal Enfield"));
    assert.ok(!makes.includes("Activa 6G"));
    assert.ok(!makes.includes("Himalayan"));
  });

  it("filters model suggestions when the make is known", () => {
    assert.ok(suggestModels("honda").includes("Activa 6G"));
    assert.ok(suggestModels("  HONDA  ").includes("Activa 6G"));
    // Unknown make: every catalog model offered, freeform input still allowed.
    assert.equal(suggestModels("Some Unknown Maker").length, VEHICLE_NAMES.length);
    assert.equal(suggestModels("").length, VEHICLE_NAMES.length);
  });

  it("matches suggestions independent of case/whitespace", () => {
    assert.deepEqual(suggestMakes("royal"), ["Royal Enfield"]);
    assert.equal(normalizeName("  Himalayan   "), "himalayan");
    assert.ok(findNameEntry("  honda ", " activa   6g "));
  });
});

describe("exact lookup boundary (fixtures only, never OEM claims)", () => {
  it("matches despite case/whitespace variance", () => {
    const rows = [fixtureRow()];
    const result = lookupVehicleSpecs(
      {
        make: "  HONDA ",
        model: "activa   6G",
        year: "2020",
        variant: "",
      },
      rows,
      FIXTURES,
    );
    assert.equal(result.status, "verified");
    assert.ok(result.row);
  });

  it("rejects year mismatch with no nearest-year fallback", () => {
    const rows = [fixtureRow({ year: "2020" })];
    const result = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2021", variant: "" },
      rows,
      FIXTURES,
    );
    assert.equal(result.status, "no-verified-row");
    assert.equal(result.row, null);
    // The known name is still recognised: only specs are missing.
    assert.ok(result.entry);
  });

  it("never verifies a blank year (optional-year input invents no specs)", () => {
    const rows = [fixtureRow({ year: "2020" })];
    for (const year of ["", "   "]) {
      const result = lookupVehicleSpecs(
        { make: "Honda", model: "Activa 6G", year, variant: "" },
        rows,
        FIXTURES,
      );
      assert.equal(result.status, "no-verified-row");
      assert.equal(result.row, null);
      // The known name is still recognised: only specs are missing.
      assert.ok(result.entry);
      assert.deepEqual(toSpecDisplay(result, FIXTURES), {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      });
    }
  });

  it("rejects variant mismatch in both directions", () => {
    const rows = [consistentFixtureRow({ variant: "vxi" })];
    const missingVariant = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
      rows,
      FIXTURES,
    );
    assert.equal(missingVariant.status, "no-verified-row");
    const otherVariant = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "Zxi" },
      rows,
      FIXTURES,
    );
    assert.equal(otherVariant.status, "no-verified-row");
    const exactVariant = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: " VXI " },
      rows,
      FIXTURES,
    );
    assert.equal(exactVariant.status, "verified");
  });

  it("falls back to freeform for unknown vehicles", () => {
    const rows = [fixtureRow()];
    const result = lookupVehicleSpecs(
      { make: "Imaginary Motors", model: "Floater", year: "2022", variant: "" },
      rows,
    );
    assert.equal(result.status, "unknown-vehicle");
    assert.equal(result.entry, null);
    assert.equal(result.row, null);
    assert.deepEqual(toSpecDisplay(result), {
      tyre: "Not available",
      groundClearance: "Not available",
      exhaust: "Not available",
    });
  });
});

describe("provenance validation", () => {
  it("accepts a fully provenanced fixture row", () => {
    assert.deepEqual(validateVerifiedSpecRow(fixtureRow(), FIXTURES), []);
  });

  it("accepts all-null specs as unknown (never default 0)", () => {
    const row = fixtureRow({
      tyreFront: null,
      tyreRear: null,
      groundClearanceMm: null,
      exhaustHeightMm: null,
      exhaustPosition: null,
      wadingMm: null,
    });
    assert.deepEqual(validateVerifiedSpecRow(row, FIXTURES), []);
    const display = toSpecDisplay(
      { status: "verified", entry: null, row },
      FIXTURES,
    );
    assert.equal(display.tyre, "Not available");
    assert.equal(display.groundClearance, "Not available");
    assert.equal(display.exhaust, "Not available");
  });

  it("rejects a non-null field with missing provenance", () => {
    const row = fixtureRow({
      groundClearanceMm: {
        value: 170,
        provenance: { ...fixtureProvenance(), sourceUrl: "   " },
      },
    });
    const issues = validateVerifiedSpecRow(row, FIXTURES);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].field, "groundClearanceMm");
  });

  it("rejects a non-digit year", () => {
    const issues = validateVerifiedSpecRow(
      fixtureRow({ year: "20xx" }),
      FIXTURES,
    );
    assert.ok(issues.some((issue) => issue.field === "year"));
  });
});

describe("fail-closed lookup (fixtures only, never OEM claims)", () => {
  it("defaults the query market to IN and matches market exactly", () => {
    const rows = [consistentFixtureRow()];
    const implicit = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
      rows,
      FIXTURES,
    );
    assert.equal(implicit.status, "verified");
    const explicit = lookupVehicleSpecs(
      {
        make: "Honda",
        model: "Activa 6G",
        year: "2020",
        variant: "",
        market: " in ",
      },
      rows,
      FIXTURES,
    );
    assert.equal(explicit.status, "verified");
    const wrongMarket = lookupVehicleSpecs(
      {
        make: "Honda",
        model: "Activa 6G",
        year: "2020",
        variant: "",
        market: "US",
      },
      rows,
      FIXTURES,
    );
    assert.equal(wrongMarket.status, "no-verified-row");
    assert.equal(wrongMarket.row, null);
  });

  it("never matches a foreign-market row from an IN query", () => {
    const rows = [consistentFixtureRow({ market: "US" })];
    const implicit = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
      rows,
      FIXTURES,
    );
    assert.equal(implicit.status, "no-verified-row");
    const explicit = lookupVehicleSpecs(
      {
        make: "Honda",
        model: "Activa 6G",
        year: "2020",
        variant: "",
        market: "US",
      },
      rows,
      FIXTURES,
    );
    assert.equal(explicit.status, "verified");
  });

  it("rejects rows with unverified (verified: false) provenance", () => {
    // Applicable in every way EXCEPT reviewer confirmation.
    const row = consistentFixtureRow();
    row.groundClearanceMm = {
      value: 150,
      provenance: {
        ...fixtureProvenance({
          market: "IN",
          modelYear: "2020",
          variant: null,
        }),
        verified: false,
      },
    };
    const issues = validateVerifiedSpecRow(row, FIXTURES);
    assert.ok(
      issues.some((issue) => issue.field === "groundClearanceMm"),
      "expected a groundClearanceMm provenance issue",
    );
    const result = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
      [row],
      FIXTURES,
    );
    assert.equal(result.status, "no-verified-row");
    assert.equal(result.row, null);
  });

  it("rejects field provenance whose market/year/variant mismatch the row", () => {
    const yearMismatch = consistentFixtureRow();
    yearMismatch.groundClearanceMm = {
      value: 150,
      provenance: fixtureProvenance({
        market: "IN",
        modelYear: "2019",
        variant: null,
      }),
    };
    assert.ok(
      validateVerifiedSpecRow(yearMismatch, FIXTURES).some(
        (issue) => issue.field === "groundClearanceMm",
      ),
    );

    const variantMismatch = consistentFixtureRow();
    variantMismatch.groundClearanceMm = {
      value: 150,
      provenance: fixtureProvenance({
        market: "IN",
        modelYear: "2020",
        variant: "vxi",
      }),
    };
    assert.ok(
      validateVerifiedSpecRow(variantMismatch, FIXTURES).some(
        (issue) => issue.field === "groundClearanceMm",
      ),
    );

    const marketMismatch = consistentFixtureRow();
    marketMismatch.groundClearanceMm = {
      value: 150,
      provenance: fixtureProvenance({
        market: "US",
        modelYear: "2020",
        variant: null,
      }),
    };
    assert.ok(
      validateVerifiedSpecRow(marketMismatch, FIXTURES).some(
        (issue) => issue.field === "groundClearanceMm",
      ),
    );

    for (const row of [yearMismatch, variantMismatch, marketMismatch]) {
      const result = lookupVehicleSpecs(
        { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
        [row],
        FIXTURES,
      );
      assert.equal(result.status, "no-verified-row");
      assert.equal(result.row, null);
    }
  });

  it("rejects ambiguous duplicate exact matches (never first-wins)", () => {
    const rows = [consistentFixtureRow(), consistentFixtureRow()];
    const result = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
      rows,
      FIXTURES,
    );
    assert.equal(result.status, "no-verified-row");
    assert.equal(result.row, null);
    assert.equal(result.reason, "ambiguous-match");
    assert.ok(result.entry);
  });

  it("rejects malformed numeric values (NaN, zero, negative, Infinity)", () => {
    for (const bad of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      const row = consistentFixtureRow({
        groundClearanceMm: { value: bad, provenance: fixtureProvenance() },
      });
      // Keep applicability exact so the ONLY defect is the value.
      if (row.groundClearanceMm) {
        row.groundClearanceMm.provenance = fixtureProvenance({
          market: "IN",
          modelYear: "2020",
          variant: null,
        });
      }
      assert.ok(
        validateVerifiedSpecRow(row, FIXTURES).some(
          (issue) => issue.field === "groundClearanceMm",
        ),
        `expected a groundClearanceMm issue for value ${String(bad)}`,
      );
      const result = lookupVehicleSpecs(
        { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
        [row],
        FIXTURES,
      );
      assert.equal(result.status, "no-verified-row");
      assert.equal(result.row, null);
    }
  });

  it("rejects empty tyre strings and undefined (missing) fields", () => {
    const emptyTyre = consistentFixtureRow({
      tyreFront: { value: "   ", provenance: fixtureProvenance() },
    });
    if (emptyTyre.tyreFront) {
      emptyTyre.tyreFront.provenance = fixtureProvenance({
        market: "IN",
        modelYear: "2020",
        variant: null,
      });
    }
    assert.ok(
      validateVerifiedSpecRow(emptyTyre, FIXTURES).some(
        (issue) => issue.field === "tyreFront",
      ),
    );

    const missing = consistentFixtureRow() as unknown as Record<
      string,
      unknown
    >;
    delete missing.tyreFront;
    const missingIssues = validateVerifiedSpecRow(
      missing as unknown as VerifiedSpecRow,
      FIXTURES,
    );
    assert.ok(
      missingIssues.some((issue) => issue.field === "tyreFront"),
      "expected a tyreFront issue for an undefined field",
    );

    // Display stays safe on malformed rows: no crash, no numbers.
    const display = toSpecDisplay(
      {
        status: "verified",
        entry: null,
        row: missing as unknown as VerifiedSpecRow,
      },
      FIXTURES,
    );
    assert.deepEqual(display, {
      tyre: "Not available",
      groundClearance: "Not available",
      exhaust: "Not available",
    });
  });

  it("rejects bad source URLs, bad access dates, and fixture class by default", () => {
    const badUrl = consistentFixtureRow();
    if (badUrl.tyreFront) {
      badUrl.tyreFront.provenance = {
        ...fixtureProvenance({
          market: "IN",
          modelYear: "2020",
          variant: null,
        }),
        sourceUrl: "ftp://example.invalid/fixtures/spec-sheet",
      };
    }
    assert.ok(
      validateVerifiedSpecRow(badUrl, FIXTURES).some(
        (issue) => issue.field === "tyreFront",
      ),
    );

    const badDate = consistentFixtureRow();
    if (badDate.tyreFront) {
      badDate.tyreFront.provenance = {
        ...fixtureProvenance({
          market: "IN",
          modelYear: "2020",
          variant: null,
        }),
        accessedOn: "2026-13-40",
      };
    }
    assert.ok(
      validateVerifiedSpecRow(badDate, FIXTURES).some(
        (issue) => issue.field === "tyreFront",
      ),
    );

    // Without the explicit test mechanism, fixture-class rows are invalid
    // — they can never verify a production lookup.
    assert.ok(validateVerifiedSpecRow(consistentFixtureRow()).length > 0);
    const production = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
      [consistentFixtureRow()],
    );
    assert.equal(production.status, "no-verified-row");
    assert.equal(production.row, null);
  });

  it("rejects rows whose vehicleId disagrees with the name catalog", () => {
    const wrongId = validateVerifiedSpecRow(
      consistentFixtureRow({ vehicleId: "honda-activa-125" }),
      FIXTURES,
    );
    assert.ok(wrongId.some((issue) => issue.field === "vehicleId"));
    const unknownName = validateVerifiedSpecRow(
      consistentFixtureRow({ make: "Imaginary Motors", model: "Floater" }),
      FIXTURES,
    );
    assert.ok(unknownName.some((issue) => issue.field === "vehicleId"));
  });

  it("renders numbers only for verified + validated rows", () => {
    const row = consistentFixtureRow();
    const verified = lookupVehicleSpecs(
      { make: "Honda", model: "Activa 6G", year: "2020", variant: "" },
      [row],
      FIXTURES,
    );
    assert.equal(verified.status, "verified");
    assert.deepEqual(toSpecDisplay(verified, FIXTURES), {
      tyre: "100/90-10 / 110/90-10",
      groundClearance: "150 mm",
      exhaust: "right, low · 400 mm",
    });
    // A hand-built result carrying a row under the wrong status shows
    // nothing — the boundary cannot be bypassed with a bare row.
    assert.deepEqual(
      toSpecDisplay({ ...verified, status: "no-verified-row" }, FIXTURES),
      {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      },
    );
  });
});

describe("live curated catalog (quarantined: no verified rows)", () => {
  /** The live catalog currently supports NO combinations (empty by
   *  audit: brochure-edition dating cannot verify an exact model year).
   *  A row may be added only with archived year-specific primary OEM
   *  documentation proving the exact same trim AND every field for that
   *  exact model year — and any addition must update SUPPORTED AND
   *  docs/vehicle-coverage.md. */
  const SUPPORTED: Array<[string, string, string, string]> = [];
  /** Every combination the 46 quarantined candidates RESEARCHED
   *  (verbatim, variant in display case). Each must resolve to
   *  "no-verified-row" until exact-model-year proof graduates it to
   *  SUPPORTED. */
  const QUARANTINED: Array<[string, string, string, string]> = [
    ["Maruti", "Swift", "2024", "LXi"],
    ["Maruti", "Swift", "2024", "VXi"],
    ["Maruti", "Swift", "2024", "VXi (O)"],
    ["Maruti", "Swift", "2024", "ZXi"],
    ["Maruti", "Swift", "2024", "ZXi+"],
    ["Maruti", "Dzire", "2026", "LXI"],
    ["Maruti", "Dzire", "2026", "VXI"],
    ["Maruti", "Dzire", "2026", "ZXI"],
    ["Maruti", "Dzire", "2026", "ZXI+"],
    ["Maruti", "Ertiga", "2024", "LXi"],
    ["Maruti", "Ertiga", "2024", "VXi"],
    ["Maruti", "Ertiga", "2024", "ZXi"],
    ["Maruti", "Ertiga", "2024", "ZXi+"],
    ["Hyundai", "Creta", "2023", "E"],
    ["Hyundai", "Creta", "2023", "EX"],
    ["Hyundai", "Creta", "2023", "S"],
    ["Hyundai", "Creta", "2023", "SX"],
    ["Hyundai", "Creta", "2023", "SX(O)"],
    ["Hyundai", "Creta", "2023", "SX Executive"],
    ["Hyundai", "Exter", "2026", "HX 2"],
    ["Hyundai", "Exter", "2026", "HX 3"],
    ["Hyundai", "Exter", "2026", "HX 4"],
    ["Hyundai", "Exter", "2026", "HX 4+"],
    ["Hyundai", "Exter", "2026", "HX 6"],
    ["Hyundai", "Exter", "2026", "HX 6 Knight"],
    ["Hyundai", "Exter", "2026", "HX 8"],
    ["Hyundai", "Exter", "2026", "HX 10"],
    ["Hyundai", "Exter", "2026", "HX 10 Knight"],
    ["Hyundai", "i20", "2026", "Era"],
    ["Hyundai", "i20", "2026", "Magna"],
    ["Hyundai", "i20", "2026", "Sportz"],
    ["Hyundai", "i20", "2026", "Sportz (O)"],
    ["Hyundai", "i20", "2026", "Sportz (O) Knight"],
    ["Hyundai", "i20", "2026", "Asta"],
    ["Hyundai", "i20", "2026", "Asta (O)"],
    ["Hyundai", "i20", "2026", "Asta (O) Knight"],
    ["Hyundai", "Verna", "2026", "HX 2"],
    ["Hyundai", "Verna", "2026", "HX 4"],
    ["Hyundai", "Verna", "2026", "HX 6"],
    ["Hyundai", "Verna", "2026", "HX 6+"],
    ["Hyundai", "Verna", "2026", "HX 8"],
    ["Hyundai", "Verna", "2026", "HX 10"],
    ["Hyundai", "Verna", "2026", "Turbo"],
    ["Mahindra", "Thar", "2025", "AXT"],
    ["Mahindra", "Thar", "2025", "LXT"],
    ["Royal Enfield", "Himalayan", "2026", ""],
  ];

  it("publishes no verified rows: edition dating cannot verify model year", () => {
    assert.equal(VERIFIED_SPEC_ROWS.length, 0);
    assert.equal(SUPPORTED.length, 0);
    // Every researched combination fails closed with honest display.
    for (const [make, model, year, variant] of QUARANTINED) {
      const result = lookupVehicleSpecs({ make, model, year, variant });
      assert.equal(
        result.status,
        "no-verified-row",
        `expected no-verified-row for ${make} ${model} ${year} "${variant}"`,
      );
      assert.equal(result.row, null);
      assert.ok(result.entry);
      assert.deepEqual(toSpecDisplay(result), {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      });
    }
  });

  it("keeps 46 researched candidates quarantined (never verified, never wired in)", () => {
    assert.equal(UNVERIFIED_SPEC_CANDIDATES.length, 46);
    const ids = UNVERIFIED_SPEC_CANDIDATES.map((c) => c.candidateId);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of UNVERIFIED_SPEC_CANDIDATES) {
      assert.equal(c.verified, false);
      assert.match(c.editionYear, /^\d{4}$/);
      assert.ok(c.sourceUrl.startsWith("https://"));
      assert.match(c.accessedOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(c.market, "IN");
      assert.ok(c.editionEvidence.trim().length > 0);
      assert.ok(c.disqualifier.trim().length > 0);
      // Quarantine shape cannot satisfy the verified-row validator: it
      // carries editionYear (never modelYear) and no provenance object.
      assert.ok(!("modelYear" in c));
      assert.ok(!("provenance" in c));
      // And no candidate leaks into the live verified set.
      assert.ok(
        !VERIFIED_SPEC_ROWS.some(
          (row) => row.make === c.make && row.model === c.model,
        ),
      );
    }
  });

  it("preserves the researched candidate facts (spot-check, still unverified)", () => {
    const byId = new Map(
      UNVERIFIED_SPEC_CANDIDATES.map((c) => [c.candidateId, c]),
    );
    assert.equal(byId.get("swift-vxi")?.groundClearanceMm, 163);
    assert.equal(byId.get("swift-vxi")?.tyreFront, "165/80 R14");
    assert.equal(byId.get("thar-lxt")?.wadingMm, 650);
    assert.equal(byId.get("thar-axt")?.tyreFront, "245/75 R16");
    assert.equal(byId.get("himalayan-base")?.groundClearanceMm, 230);
    // Hyundai brochures print no GC line: candidates honestly carry null.
    for (const id of ["creta-sx", "exter-hx-4", "i20-asta-o", "verna-turbo"]) {
      assert.equal(byId.get(id)?.groundClearanceMm, null);
    }
  });

  it("validates the (empty) verified set and keeps researched names known", () => {
    for (const row of VERIFIED_SPEC_ROWS) {
      // Production validation: no test-mechanism flag, so fixture-class
      // rows could never slip into the live catalog. (Vacuous while the
      // set is empty; guards every future addition.)
      assert.deepEqual(validateVerifiedSpecRow(row), []);
    }
    // Quarantine removed specs, never names: every researched
    // combination still resolves to a known catalog name.
    for (const [make, model] of QUARANTINED) {
      assert.ok(
        findNameEntry(make, model),
        `expected a catalog name for ${make} ${model}`,
      );
    }
  });

  it("renders researched combinations as Not available (never numbers)", () => {
    const cases: Array<{
      query: { make: string; model: string; year: string; variant: string };
    }> = [
      {
        query: { make: "Maruti", model: "Swift", year: "2024", variant: "VXi" },
      },
      {
        query: { make: "Maruti", model: "Dzire", year: "2026", variant: "ZXI" },
      },
      {
        query: { make: "Hyundai", model: "Creta", year: "2023", variant: "SX" },
      },
      {
        query: {
          make: "Hyundai",
          model: "Exter",
          year: "2026",
          variant: "HX 4",
        },
      },
      {
        query: {
          make: "Hyundai",
          model: "i20",
          year: "2026",
          variant: "Asta (O)",
        },
      },
      {
        query: {
          make: "Hyundai",
          model: "Verna",
          year: "2026",
          variant: "Turbo",
        },
      },
      {
        query: {
          make: "Mahindra",
          model: "Thar",
          year: "2025",
          variant: "LXT",
        },
      },
      {
        query: {
          make: "Royal Enfield",
          model: "Himalayan",
          year: "2026",
          variant: "",
        },
      },
    ];
    for (const { query } of cases) {
      const result = lookupVehicleSpecs(query);
      assert.equal(result.status, "no-verified-row");
      assert.equal(result.row, null);
      assert.ok(result.entry);
      assert.deepEqual(toSpecDisplay(result), {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      });
    }
  });

  it("candidates carry no exhaust facts and wading only for Thar", () => {
    for (const c of UNVERIFIED_SPEC_CANDIDATES) {
      assert.ok(!("exhaustHeightMm" in c));
      assert.ok(!("exhaustPosition" in c));
      if (c.candidateId === "thar-axt" || c.candidateId === "thar-lxt") {
        assert.equal(c.wadingMm, 650);
      } else {
        assert.equal(c.wadingMm, null);
      }
    }
  });

  it("never verifies across variants, years, models, or markets", () => {
    // Researched-variant spellings, wrong years: no nearest-year fallback.
    for (const query of [
      { make: "Maruti", model: "Swift", year: "2023", variant: "VXi" },
      { make: "Maruti", model: "Swift", year: "2025", variant: "VXi" },
      { make: "Hyundai", model: "Creta", year: "2024", variant: "SX" },
      { make: "Mahindra", model: "Thar", year: "2024", variant: "LXT" },
      { make: "Royal Enfield", model: "Himalayan", year: "2021", variant: "" },
    ]) {
      const result = lookupVehicleSpecs(query);
      assert.equal(result.status, "no-verified-row");
      assert.equal(result.row, null);
      assert.ok(result.entry);
    }
    // CNG/fuel-split variants were never published: they must not
    // inherit petrol-variant specs.
    for (const query of [
      { make: "Maruti", model: "Swift", year: "2024", variant: "VXi CNG" },
      { make: "Maruti", model: "Dzire", year: "2026", variant: "VXI CNG" },
      { make: "Maruti", model: "Ertiga", year: "2024", variant: "VXi CNG" },
    ]) {
      const result = lookupVehicleSpecs(query);
      assert.equal(result.status, "no-verified-row");
      assert.equal(result.row, null);
    }
    // Nearby-but-different models never share rows.
    for (const query of [
      { make: "Mahindra", model: "Thar Roxx", year: "2025", variant: "LXT" },
      { make: "Maruti", model: "Baleno", year: "2024", variant: "Zeta" },
      { make: "Hyundai", model: "Venue", year: "2026", variant: "SX" },
    ]) {
      const result = lookupVehicleSpecs(query);
      assert.equal(result.status, "no-verified-row");
      assert.equal(result.row, null);
    }
    // Foreign-market queries never match IN rows.
    const us = lookupVehicleSpecs({
      make: "Maruti",
      model: "Swift",
      year: "2024",
      variant: "VXi",
      market: "US",
    });
    assert.equal(us.status, "no-verified-row");
    assert.equal(us.row, null);
  });

  it("never verifies a blank year, even for researched combinations", () => {
    for (const [make, model, , variant] of QUARANTINED) {
      for (const year of ["", "   "]) {
        const result = lookupVehicleSpecs({ make, model, year, variant });
        assert.equal(result.status, "no-verified-row");
        assert.equal(result.row, null);
        assert.ok(result.entry);
        assert.deepEqual(toSpecDisplay(result), {
          tyre: "Not available",
          groundClearance: "Not available",
          exhaust: "Not available",
        });
      }
    }
  });
});

describe("live catalog honesty (unsupported combinations)", () => {
  it("ships an empty verified set (quarantine holds; no fixtures, no ad-hoc values)", () => {
    // The audit quarantined every researched row: edition dating cannot
    // verify a model year, so the live verified set is empty and every
    // lookup fails closed until exact-model-year proof graduates a row.
    assert.equal(VERIFIED_SPEC_ROWS.length, 0);
    for (const row of VERIFIED_SPEC_ROWS) {
      for (const field of [
        "tyreFront",
        "tyreRear",
        "groundClearanceMm",
        "exhaustHeightMm",
        "exhaustPosition",
        "wadingMm",
      ] as const) {
        const slot = row[field] as
          | { value: unknown; provenance: SpecProvenance }
          | null;
        if (slot !== null) {
          assert.notEqual(
            slot.provenance.sourceClass,
            "test-fixture",
            `${field} must never be fixture-class in the live catalog`,
          );
        }
      }
    }
  });

  it("resolves every current name to no-verified-row with Not available specs", () => {
    const baseline = [
      { make: "Honda", model: "Activa 6G", year: "2022", variant: "" },
      { make: "Royal Enfield", model: "Himalayan", year: "2021", variant: "" },
      { make: "Hyundai", model: "Creta", year: "2023", variant: "" },
      { make: "Maruti", model: "Alto K10", year: "2022", variant: "" },
      { make: "DTC", model: "Low-Floor Bus", year: "2020", variant: "" },
    ];
    for (const query of baseline) {
      const result = lookupVehicleSpecs(query);
      assert.equal(result.status, "no-verified-row");
      assert.deepEqual(toSpecDisplay(result), {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      });
    }
    // Every catalog name — baseline plus sourced additions — carries no
    // verified specs. New names must never seed numbers.
    for (const name of VEHICLE_NAMES) {
      const result = lookupVehicleSpecs({
        make: name.make,
        model: name.model,
        year: "2022",
        variant: "",
      });
      assert.equal(
        result.status,
        "no-verified-row",
        `expected no-verified-row for ${name.displayName}`,
      );
      assert.deepEqual(toSpecDisplay(result), {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      });
    }
  });
});

describe("sourced names coverage (India current passenger names; specs only where curated)", () => {
  it("covers multiple makes without claiming worldwide completeness", () => {
    const makes = listMakes();
    for (const make of [
      "Maruti",
      "Hyundai",
      "Honda",
      "Toyota",
      "Kia",
      "Mahindra",
      "Royal Enfield",
      "DTC",
    ]) {
      assert.ok(makes.includes(make), `expected make ${make}`);
    }
    // Sourced additions: spot-check one model per new make.
    assert.ok(findNameEntry("Maruti", "Swift"));
    assert.ok(findNameEntry("Hyundai", "Exter"));
    assert.ok(findNameEntry("Honda", "City"));
    assert.ok(findNameEntry("Toyota", "Glanza"));
    assert.ok(findNameEntry("Kia", "Sonet"));
    assert.ok(findNameEntry("Mahindra", "Scorpio-N"));
  });

  it("narrows model suggestions to the typed make", () => {
    const maruti = suggestModels("Maruti");
    assert.ok(maruti.includes("Swift"));
    assert.ok(maruti.includes("Alto K10"));
    assert.ok(!maruti.includes("Creta"));
    const hyundai = suggestModels("Hyundai");
    assert.ok(hyundai.includes("Exter"));
    assert.ok(hyundai.includes("Creta"));
    assert.ok(!hyundai.includes("Swift"));
    const toyota = suggestModels("toyota");
    assert.ok(toyota.includes("Glanza"));
    assert.ok(toyota.includes("Fortuner"));
    assert.ok(!toyota.includes("Sonet"));
  });

  it("keeps stable unique ids with displayName built as make + model", () => {
    const ids = VEHICLE_NAMES.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const entry of VEHICLE_NAMES) {
      assert.equal(entry.displayName, `${entry.make} ${entry.model}`);
    }
  });

  it("leaves unlisted cars to freeform with Not available specs (any year)", () => {
    // Ford F-150 is deliberately NOT in the catalog: a full-size pickup
    // never officially sold in India (listed Fords are the India-sold
    // historical passenger models), so it must stay freeform, never invented.
    for (const year of ["2022", "2024"]) {
      const result = lookupVehicleSpecs({
        make: "Ford",
        model: "F-150",
        year,
        variant: "",
      });
      assert.equal(result.status, "unknown-vehicle");
      assert.equal(result.entry, null);
      assert.deepEqual(toSpecDisplay(result), {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      });
    }
    // Listed names stay spec-less for combinations outside the curated
    // set (exact match only — a nearby year/variant invents nothing).
    for (const query of [
      { make: "Maruti", model: "Swift", year: "2023", variant: "" },
      { make: "Hyundai", model: "Exter", year: "2024", variant: "" },
      { make: "Kia", model: "Sonet", year: "2023", variant: "HTX" },
    ]) {
      const result = lookupVehicleSpecs(query);
      assert.equal(result.status, "no-verified-row");
      assert.ok(result.entry);
      assert.deepEqual(toSpecDisplay(result), {
        tyre: "Not available",
        groundClearance: "Not available",
        exhaust: "Not available",
      });
    }
  });
});
