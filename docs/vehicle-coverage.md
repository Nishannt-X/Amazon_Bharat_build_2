# Vehicle catalog coverage (names vs specs)

Working assumption: "all cars" means **India passenger-car model names listed by manufacturers**,
because this product is India-focused (Photon `countrycode=IN`, IN market default).
This catalog is **not** worldwide-complete, **not** historical, and **not** a
specifications database.

Two layers, kept separate:

1. **Names** (`src/data/vehicles.json`, 35 entries): manufacturer + model names
   only, with stable ids. Suggestions only — they imply nothing about
   specifications. Freeform entry always works for any missing model.
2. **Specs** (`VERIFIED_SPEC_ROWS` in `src/lib/vehicle-catalog.ts`): **zero**
   verified numeric rows. Every spec surface reads "Not available". No years,
   variants, or numeric fields are guessed.

## Scope (bounded, primary-proven only)

Kept the original 5 (Honda Activa 6G, Royal Enfield Himalayan, Hyundai Creta,
Maruti Alto K10, DTC Low-Floor Bus — 2-wheelers + bus preserved).

Added 30 names checked on the manufacturers' own India directories on
2026-10-09 (marketing prefixes such as "New"/"All New" stripped). N Line,
electric, and taxi-fleet entries were not included in this bounded pass;
some are distinct models, and all remain enterable as freeform text.
Directory presence does not establish that a car is already on sale:

- Maruti (shown as "Maruti" for Maruti Suzuki India Arena/Nexa models — existing
  "Maruti Alto K10" spelling preserved, no mixed "Maruti Suzuki" display names):
  Swift, Dzire, Brezza, Ertiga, Wagon R, Baleno, Fronx, Grand Vitara —
  https://www.marutisuzuki.com/
- Hyundai: Exter, Venue, Alcazar, Verna, Aura, Grand i10 Nios, i20, Bayon
  (plus existing Creta) — https://www.hyundai.com/in/en (Find a Car)
  Bayon is an announced upcoming model with bookings open, rather than
  confirmed on-sale coverage: https://www.hyundai.com/in/en/hyundai-story/media-center/press-release/bookings-on-for-hyundai-bayon
- Honda (cars; 2-wheeler Activa 6G kept under the same make): City, Amaze,
  Elevate — https://www.hondacarindia.com/ (lineup lists New City / New Amaze /
  New Elevate)
- Toyota: Glanza, Urban Cruiser Hyryder, Innova Hycross, Fortuner —
  https://www.toyotabharat.com/ (Discover the Toyota range)
- Kia: Sonet, Seltos, Carens — https://www.kia.com/in/ (The Range)
- Mahindra: Thar Roxx, Scorpio-N, XUV 3XO, Bolero —
  https://auto.mahindra.com/suv

Out of scope (freeform covers them; no invention): Tata (primary directory
https://cars.tatamotors.com/ blocked direct fetch on check date — Punch/Nexon/
Harrier etc. not added without verifiable primary read), MG / Skoda / VW,
commercial/taxi-only entries, discontinued generations, and all years/variants/
numeric specs.

## What is NOT claimed

- No "all cars complete" claim — global, historical, and unlisted-current-model
  coverage is explicitly absent. An unlisted car is normal: type it freeform.
- No verified specs exist for any name, old or new. Lookup stays exact
  make/model/year/variant/market and fail-closed.
