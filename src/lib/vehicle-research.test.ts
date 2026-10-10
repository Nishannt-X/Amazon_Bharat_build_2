import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VEHICLE_NAMES, VERIFIED_SPEC_ROWS, lookupVehicleSpecs, toSpecDisplay } from "./vehicle-catalog";
import {
  RESEARCH_COVERED_IDS,
  describeResearchClearance,
  isCarEntry,
  lookupResearchClearance,
} from "./vehicle-research";

describe("Muse ground-clearance research layer", () => {
  it("covers every catalog name (316) and nothing is verified", () => {
    assert.equal(VEHICLE_NAMES.length, 316);
    assert.equal(RESEARCH_COVERED_IDS, 316);
    assert.equal(VERIFIED_SPEC_ROWS.length, 0);
    for (const entry of VEHICLE_NAMES) {
      assert.equal(lookupResearchClearance(entry.make, entry.model).verified, false);
    }
  });

  it("returns sourced single values for representative cars", () => {
    const dzire = lookupResearchClearance("Maruti", "Dzire");
    assert.equal(dzire.status, "single-value");
    assert.equal(dzire.groundClearanceMm, 163);
    assert.equal(dzire.sourceClass, "oem");
    assert.equal(dzire.basis, "unladen");
    assert.ok(dzire.records[0].sourceUrl.startsWith("https://"));
    assert.equal(lookupResearchClearance("Volkswagen", "Virtus").values.includes(179), true);
    assert.equal(lookupResearchClearance("Maruti Suzuki", "Swift").groundClearanceMm, 163);
  });

  it("different models give different values (selection dependent)", () => {
    const a = lookupResearchClearance("Maruti", "Dzire").groundClearanceMm;
    const b = lookupResearchClearance("Renault", "Kwid").groundClearanceMm;
    assert.equal(b, 184);
    assert.notEqual(a, b);
  });

  it("does not pick a number when sources disagree", () => {
    const vw = lookupResearchClearance("Volkswagen", "Tiguan");
    assert.equal(vw.status, "sources-disagree");
    assert.equal(vw.groundClearanceMm, null);
    assert.deepEqual(vw.values, [176, 200]);
    assert.match(describeResearchClearance(vw).caption, /disagree/);
    const scorpio = lookupResearchClearance("Mahindra", "Scorpio-N");
    assert.equal(scorpio.status, "sources-disagree");
    assert.equal(scorpio.groundClearanceMm, null);
    assert.equal(describeResearchClearance(scorpio).value, "Sources conflict");
    const hyryder = lookupResearchClearance("Toyota", "Urban Cruiser Hyryder");
    assert.equal(hyryder.groundClearanceMm, null);
    assert.equal(describeResearchClearance(hyryder).value, "Sources conflict");
  });

  it("reports missing data truthfully", () => {
    const venue = lookupResearchClearance("Hyundai", "Venue");
    assert.equal(venue.status, "no-reliable-value");
    assert.equal(describeResearchClearance(venue).value, "Unavailable");
    assert.equal(lookupResearchClearance("Nope", "Car").status, "unknown-vehicle");
    assert.equal(lookupResearchClearance("Maruti", "Dzire 2099").status, "unknown-vehicle");
  });

  it("never marks research as verified or leaks into the verified lookup", () => {
    const text = describeResearchClearance(lookupResearchClearance("Maruti", "Dzire"));
    assert.match(text.caption, /Unverified research/);
    assert.match(text.caption, /not confirmed/);
    const specs = lookupVehicleSpecs({ make: "Maruti", model: "Dzire", year: "2024", variant: "" });
    assert.equal(specs.status, "no-verified-row");
    assert.equal(toSpecDisplay(specs).groundClearance, "Not available");
  });

  it("filters two-wheelers and the bus out of the car list", () => {
    const cars = VEHICLE_NAMES.filter(isCarEntry);
    assert.ok(cars.length > 150 && cars.length < 316);
    for (const id of ["honda-activa-6g", "royal-enfield-himalayan", "dtc-low-floor-bus", "tvs-jupiter", "honda-shine"]) {
      assert.ok(!cars.some((entry) => entry.id === id), id);
    }
    assert.ok(cars.some((entry) => entry.id === "maruti-swift"));
    assert.ok(cars.some((entry) => entry.id === "honda-city"));
  });
});
