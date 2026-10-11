# Vehicle physical-reference coverage

Checked: 2026-10-12. Market: India. Coverage records: 318 catalog vehicles; sourced physical-reference entries: 14. The other 304 records are explicitly awaiting source review, not described as researched or verified.

## What is available

- Eleven Hyundai models have production-period manual links from the [Hyundai India manual index](https://www.hyundai.com/in/en/connect-to-service/hyundai-service/owners-manual). A selected year identifies applicable document candidates, not an exact trim. Transition years can return two editions; build month is then required.
- [Mahindra Thar 2025 brochure](https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw1a6fc272/brochure/Thar-Brochure-2025-NEW.pdf): 650 mm wading reference, within that brochure's vehicle scope.
- [Mahindra Thar ROXX India launch specification](https://auto.mahindra.com/press-release/mahindra-launches-the-suv-thar-roxx.html): 650 mm wading reference.
- [Toyota Hilux India 2022 launch specification](https://www.toyotabharat.com/news/2022/tkm-launches-indias-much-awaited-lifestyle-utility-vehicle-the-hilux.html): 700 mm wading reference for the launch 4x4 range. Later editions are not automatically matched.
- Hyundai IONIQ 5 and Kona Electric are battery-electric models, so combustion intake and exhaust heights are not applicable; this does not establish water tolerance.

Wading references are stored with source URLs, scope and handbook conditions. They are not intake heights, exhaust heights or guarantees for urban floodwater. No new numeric intake/exhaust heights were found in the reviewed sources. The catalog does not manufacture them from ground clearance.

## Storage and API

`src/data/vehicle-physical-evidence.json` contains the sourced entries. `lookupPhysicalEvidence` provides explicit pending records for every remaining catalog ID. Migration `vehicle-physical-evidence-2026-10-12-v4` persists these as `vehicle_catalog.physical_json` without altering vehicle IDs, accounts or reports.

`GET /api/vehicles` returns `physicalEvidence`, including matching manuals, separate intake/exhaust statuses, and any OEM wading reference. The vehicle panel displays these fields. Recommendations receive the same stored physical-evidence payload.

## Completing the missing measurements

An exact reference needs India model generation, model year/build month, engine, drivetrain, trim and suspension/load state. A year derived from vehicle age and a free-text trim cannot establish these alone.

When OEM service or homologation documents provide no numerical intake/exhaust heights, obtain physical measurements on a level surface. Record the actual combustion-air inlet and exhaust outlet, suspension/load state, uncertainty, measurement date and supporting photos. Keep measured provenance separate from OEM-published provenance. Do not use a bonnet/grille height, ground clearance, or generic vehicle-class height as a substitute.

The older [OEM physical-spec research](vehicle-oem-physical-specs.md) provides a proposed measurement protocol, not a source of verified measurements.
