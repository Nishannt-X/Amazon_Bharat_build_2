/**
 * Curated verified specification rows (FloodFlow India passenger catalog).
 *
 * CURRENTLY EMPTY — by audit, not by omission.
 *
 * Audit (2026-10-10, re-checked against freshly fetched OEM documents):
 * the prior 46 rows carried years taken from brochure-edition evidence
 * (PDF creation dates, document titles, printed copyright/footer months).
 * Publication dating alone DOES NOT establish the exact vehicle
 * model year a figure applies to — a text search of all 10 extracted
 * source documents for "model year", "model-year", "MY20xx", and
 * "20xx model" returns zero hits — and the live schema
 * (`SpecProvenance.modelYear` in `./vehicle-catalog`) means "the model
 * year this reading was published for". Promoting edition-dated rows
 * would silently equate edition year with model year, so all 46
 * researched combinations were moved to `UNVERIFIED_SPEC_CANDIDATES` in
 * `./unverified-spec-candidates` (a shape that cannot validate:
 * `editionYear`, never `modelYear`; `verified: false`). That file is
 * NEVER imported by the lookup boundary, the UI, or this module.
 *
 * A row belongs here only with archived year-specific primary OEM
 * spec/launch documentation proving the exact same trim AND every field
 * for that exact model year — never on edition dating alone, never by
 * inference across generations (bare "Himalayan" stays out while it is
 * ambiguous across the 411 / 450 generations).
 *
 * Unknown fields stay null — never 0, never a guess. In particular,
 * exhaust outlet height has no OEM consumer-brochure publisher found, and
 * ground-clearance/wading figures are published only where the source
 * prints the exact line with its basis recorded verbatim.
 *
 * Only facts (short numeric/string values) are stored here, each with its
 * source URL — no copyrighted document content is bundled.
 */

import type { VerifiedSpecRow } from "./vehicle-catalog";

export const CURATED_SPEC_ROWS: VerifiedSpecRow[] = [];
