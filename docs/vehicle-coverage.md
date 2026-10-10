# Vehicle catalog coverage (names vs specs)

Working assumption: "all cars" means **India passenger-vehicle model names**,
because this product is India-focused (Photon `countrycode=IN`, IN market default).
This catalog is **not** worldwide-complete. It spans **current and
historical passenger cars plus common motorcycles/scooters** sold in
India as *names* (316 entries); there are currently **zero verified
specification rows** — 46 researched make/model/variant combinations were
quarantined to `UNVERIFIED_SPEC_CANDIDATES` (see below) because their
sources date the brochure *edition*, which cannot verify an exact
vehicle model year. Everything else honestly reads "Not available".

Two layers, kept separate:

1. **Names** (`src/data/vehicles.json`, **316 entries** across 36 makes):
   manufacturer + model names only, with stable ids. Suggestions only — they
   imply nothing about specifications. Freeform entry always works for any
   missing model.
2. **Specs** (`CURATED_SPEC_ROWS` in `src/lib/verified-spec-rows.ts`,
   exposed as `VERIFIED_SPEC_ROWS` in `src/lib/vehicle-catalog.ts`):
   **currently empty by audit** (see "Verified specs" below). Lookup stays
   exact make/model/year/variant/market and fail-closed: anything outside
   a verified row reads "Not available". No years, variants, or numeric
   fields are guessed. Researched-but-unproven facts live separately in
   `UNVERIFIED_SPEC_CANDIDATES` (`src/lib/unverified-spec-candidates.ts`,
   46 entries, `verified: false`, a shape that cannot validate as a
   verified row) and are NEVER exposed through lookup or the UI.

## Scope (bounded, sourced)

Kept the original 35 entries byte-identical (stable ids and spellings
preserved, including "Maruti" for Maruti Suzuki Arena/Nexa models and the
DTC bus entry). Added 281 names checked 2026-10-10 (UTC) against the
sources below. Marketing prefixes such as "New"/"All New" are stripped;
generation/year suffixes are never added (e.g. "Himalayan" stays bare).

Current-lineup backbone: the **VariantWise open dataset (CC BY 4.0,
data as of 2026-09-30**, 17 brands / 130 models / 1,167 variants, sourced
per-row with manufacturer-wins conflict policy —
https://github.com/kanishkamendevell/variantwise-open-data). Every current
passenger-car name below was cross-checked against it; 2026 launches were
additionally confirmed against primary OEM newsrooms (see per-make notes).

- Maruti (31): Swift, Dzire, Brezza, Ertiga, Wagon R, Baleno, Fronx,
  Grand Vitara, Alto K10 (kept) + Celerio, S-Presso, Eeco, Invicto, Jimny,
  Victoris, XL6, e Vitara (current) + 800, Zen, Esteem, Gypsy, Omni, Versa,
  A-Star, Ritz, SX4, Kizashi, S-Cross, Alto, Ciaz, Ignis, Vitara Brezza
  (historical/delisted) — https://www.marutisuzuki.com/,
  VariantWise 2026-09-30
- Hyundai (22): Creta, Exter, Venue, Alcazar, Verna, Aura, Grand i10 Nios,
  i20 (kept) + IONIQ 5 (current) + Santro, Getz, Accent, Elantra, Sonata,
  Terracan, Santa Fe, Eon, Xcent, i10, Tucson, Kona Electric (historical/
  delisted) — https://www.hyundai.com/in/en, VariantWise 2026-09-30.
  Bayon (kept) remains an announced upcoming model with bookings open:
  https://www.hyundai.com/in/en/hyundai-story/media-center/press-release/bookings-on-for-hyundai-bayon
- Honda cars (11): City, Amaze, Elevate (kept) + Civic, Accord, CR-V, Jazz,
  Brio, Mobilio, BR-V, WR-V (historical) — https://www.hondacarindia.com/,
  VariantWise 2026-09-30
- Toyota (19): Glanza, Urban Cruiser Hyryder, Innova Hycross, Fortuner
  (kept) + Camry, Hilux, Innova Crysta, Land Cruiser 300, Rumion,
  Urban Cruiser Taisor, Urban Cruiser eBella, Vellfire (current) + Qualis,
  Etios, Etios Liva, Corolla Altis, Yaris, Innova, Prius (historical) —
  https://www.toyotabharat.com/, VariantWise 2026-09-30
- Kia (9): Sonet, Seltos, Carens (kept) + Sorento, Syros, Carens Clavis,
  Carnival, EV6, EV9 (current) — https://www.kia.com/in/ (Sorento showroom
  page), VariantWise 2026-09-30
- Mahindra (23): Thar Roxx, Scorpio-N, XUV 3XO, Bolero (kept) + Thar,
  Bolero Neo, Bolero Neo Plus, Scorpio Classic, XUV 7XO, BE 6, XEV 9e,
  XEV 9S (current) + Scorpio, XUV700, XUV500, TUV300, NuvoSport, Quanto,
  Verito, KUV100, Alturas G4, XUV400, Marazzo (historical/delisted) —
  https://auto.mahindra.com/suv, https://www.mahindra.com/news-room/
  (BE 6 / XEV 9e launch release 2024-11-26), VariantWise 2026-09-30
- Tata (21): Tiago, Altroz, Punch, Nexon, Curvv, Harrier, Safari, Sierra,
  Aeris (current) + Nano, Indica, Indica Vista, Indigo, Manza, Sumo,
  Safari Storme, Aria, Hexa, Zest, Bolt, Tigor (historical; Tigor replaced
  by Aeris Sept 2026) — https://www.tata.com/newsroom/business/tata-aeris-launch
  (Aeris launch 2026-09-25), VariantWise 2026-09-30
- MG (12): Hector, Hector Plus, Astor, Windsor EV, Comet EV, ZS EV,
  Cyberster, M9, Majestor, Hector Tomahawk EV, Hector Tomahawk PHEV
  (current) + Gloster (historical, replaced by Majestor) —
  https://www.mgmotor.co.in/, VariantWise 2026-09-30
- Skoda (10): Kylaq, Slavia, Kushaq, Kodiaq (current) + Fabia, Rapid,
  Yeti, Laura, Octavia, Superb (historical) — VariantWise 2026-09-30
- Volkswagen (11): Taigun, Virtus, Tiguan R-Line, Tayron (current) + Polo,
  Vento, Jetta, Passat, Ameo, Tiguan, T-Roc (historical) —
  https://www.volkswagen.co.in/en/models/tayron.html (Tayron),
  VariantWise 2026-09-30
- Renault (10): Kwid, Triber, Kiger, Duster (current) + Pulse, Scala,
  Fluence, Koleos, Captur, Lodgy (historical) — VariantWise 2026-09-30
- Nissan (10): Magnite, Gravite, Tekton (current; Gravite launch Feb 2026
  and Tekton launch Jul 2026 per https://india.nissanmotornews.com/ and
  https://global.nissannews.com/) + Micra, Sunny, Terrano, Teana, Evalia,
  Kicks, X-Trail (historical) — VariantWise 2026-09-30
- Datsun (3, historical): Go, Go+, Redi-Go
- Jeep (4): Compass, Meridian, Wrangler, Grand Cherokee —
  VariantWise 2026-09-30
- Citroen (4): C3, Aircross, Basalt (current; bare names — current
  marketing carries an "X" suffix per VariantWise) + C5 Aircross
  (historical) — VariantWise 2026-09-30
- BYD (4): ATTO 3, SEAL, SEALION 7, eMAX 7 — VariantWise 2026-09-30
- Tesla (1): Model Y (first and only Tesla on sale in India since Jul 2025)
- VinFast (3): VF 6, VF 7 (launched Sept 2025 per https://vinfastauto.in/),
  VF MPV 7 — VariantWise 2026-09-30
- Ford (8, historical — exited India 2021): Ikon, Fiesta, Figo, Aspire,
  EcoSport, Endeavour, Freestyle, Escort
- Chevrolet (10, historical — exited India 2017): Spark, Beat, Cruze,
  Tavera, Aveo, Optra, Captiva, Sail, Enjoy, Trailblazer
- Fiat (6, historical): Palio, Punto, Linea, Uno, Siena, 500
- Hindustan Motors (2, historical): Ambassador, Contessa
- Premier (3, historical): Padmini, 118 NE, Rio
- Mitsubishi (5, historical): Lancer, Pajero, Cedia, Outlander, Montero
- Daewoo (2, historical): Matiz, Cielo
- Opel (3, historical): Astra, Corsa, Vectra

Two-wheelers (65 names; high-volume India models; bare family names cover
Plus/XTEC/4V suffix lines — e.g. "Splendor" covers Splendor+/XTEC,
"Xtreme 160R" covers the 4V — while marketed-distinct models such as
"Pulsar NS200" vs "Pulsar RS200" stay separate):

- Honda (9 with kept Activa 6G): Activa 125, Dio, Shine, SP 125, Unicorn,
  Hornet 2.0, H'ness CB350, CB350RS
- Royal Enfield (9 with kept Himalayan): Classic 350, Bullet 350,
  Meteor 350, Hunter 350, Interceptor 650, Continental GT 650,
  Super Meteor 650, Guerrilla 450
- Hero (9): Splendor, HF Deluxe, Passion, Glamour, Xtreme 160R, XPulse 200,
  Karizma XMR, Destini 125, Xoom 125 — https://www.heromotocorp.com/
- Bajaj (9): Pulsar 150, Pulsar NS200, Pulsar RS200, Avenger, Dominar 400,
  Platina, CT 110X, Chetak, Freedom 125
- TVS (9): Jupiter, NTORQ 125, Apache RTR 160, Apache RTR 200 4V, XL100,
  Star City Plus, Raider, Sport, iQube
- Yamaha (6): FZ-S, MT-15, R15, Fascino, RayZR, Aerox 155 —
  https://www.yamaha-motor-india.com/two-wheeler.html
- Suzuki (6): Access 125, Burgman Street, Gixxer, Gixxer SF, V-Strom SX,
  Avenis
- KTM (6): 200 Duke, 390 Duke, RC 200, RC 390, 250 Adventure, 390 Adventure
- Ola (2): S1 Pro, S1 X
- Ather (2): 450X, Rizta

Rename pairs kept as separate era-accurate names (each was the marketed
name in its era, not an alias typo): Tigor → Aeris, Vitara Brezza →
Brezza, XUV700 → XUV 7XO. Powertrain derivatives share the bare model
name (e.g. Nexon EV under "Nexon") except where the OEM's own base model
name carries the suffix (Windsor EV, Comet EV, ZS EV, e Vitara, BE 6,
XEV 9e/9S, eBella, Tomahawk EV/PHEV).

## Verification method (2026-10-10)

- Current passenger cars: bulk cross-check against the VariantWise
  catalogue snapshot (CC BY 4.0, data as of 2026-09-30; file inspected
  locally, not retained in-repo), which sources every row and lets the
  manufacturer win conflicts. All 2026 launches unfamiliar to the prior
  catalog (Aeris, Gravite, Tekton, Majestor, Tayron, Sorento, VF 6/VF 7/
  VF MPV 7, Model Y, XUV 7XO, BE 6, XEV 9e/9S, Syros, Carens Clavis,
  Urban Cruiser eBella/Taisor) were additionally confirmed via primary
  OEM newsroom/showroom pages or dated launch reporting cited above.
- Delisted/recently-replaced models (Tucson, Ciaz, Ignis, X-Trail,
  Marazzo, XUV400, Gloster, Tigor): placed in the historical bucket on
  the basis of absence from the 2026-09-30 VariantWise snapshot plus
  launch-replacement reporting (Aeris replaces Tigor; Majestor replaces
  Gloster; XUV 7XO facelift replaces XUV700).
- Pre-2020 historical models and all two-wheelers: long-standing
  India-market nameplates confirmed against OEM lineup/history pages
  and model directories (Hero, Yamaha primary pages checked directly;
  remainder per established automotive record). No per-model spec was
  recorded — names only, so there is nothing numeric to misstate.
 - No trims (VXi/ZXi/LXi and equivalents), no generation/year suffixes,
   no invented models. Every id is unique, every normalized make/model
   pair is unique, every displayName equals make + model (validated by
   script; see task report).
- Verified specs (same check date): each of the 10 source PDFs above was
  fetched directly and its text layer read for variant tables, GC lines
  (+ basis tags), and edition dating (PDF title/metadata or printed
  copyright month). The follow-up audit (same date) then searched all 10
  extracted documents for explicit model-year applicability language
  ("model year", "model-year", "MY20xx", "20xx model"): **zero hits**.
  Edition/publication dating alone does not establish the exact vehicle
  model year a figure applies to, and the schema requires proven exact
  model-year applicability — so all 46 researched combinations were
  quarantined to `UNVERIFIED_SPEC_CANDIDATES`
  (`src/lib/unverified-spec-candidates.ts`), which carries `editionYear`
  (never `modelYear`) and `verified: false` and is never imported by the
  lookup boundary or the UI. The per-model evidence (including what was
  excluded and why) is the table below. No PDF content is bundled in-repo
  — only short fact values with source URLs (fair-use research notes).

## Verified specs (0 rows) + quarantined candidates (46, checked 2026-10-10)

No combination currently meets the verified bar (proven exact IN
market / model-year / variant applicability per field), so the live
verified set is EMPTY and every lookup resolves to "Not available".
The 46 researched combinations below are preserved as **unverified
candidates only**: every value was read directly from the cited primary
OEM brochure / spec-sheet PDF text layer on 2026-10-10 and re-confirmed
present (or, for null GC, confirmed absent) by text extraction during
the audit — but the year shown is the brochure-EDITION year evidenced
in/by each document, never a proven vehicle model year. A candidate
graduates to a verified row only with archived year-specific primary
OEM spec/launch documentation proving the exact same trim AND every
field for that exact model year — never on edition dating alone, never
by inference across generations.

| Make / Model | Edition year (NOT a proven model year) | Variants (researched) | Tyres F/R | Ground clearance | Wading | Source (direct URL, edition proof) |
|---|---|---|---|---|---|---|
| Maruti Swift | 2024 | LXi, VXi, VXi (O) | 165/80 R14 | 163 mm (Unladen) | — | https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/document/Swift_SCNG_VerticalBrochure.pdf (PDF created 2024-11-20; cites JATO cert 2024-08-27; 4th-gen Z12E) |
| Maruti Swift | 2024 | ZXi, ZXi+ | 185/65 R15 | 163 mm (Unladen) | — | same brochure (explicit trim split in tyre table) |
| Maruti Dzire | 2026 | LXI, VXI | 165/80 R14 | 163 mm (unladen) | — | https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/dzire/brochures/DZire-brochure_.pdf (PDF title "25082026Dzire…", created 2026-09-18) |
| Maruti Dzire | 2026 | ZXI, ZXI+ | 185/65 R15 | 163 mm (unladen) | — | same brochure (features table maps R14 steel → LXI/VXI, R15 alloys → ZXI/ZXI+) |
| Maruti Ertiga | 2024 | LXi, VXi, ZXi, ZXi+ | 185/65 R15 | Not available (no GC line in brochure) | — | https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/ertiga/document/ErtigaBrochure_6_Pgs_High_Res.pdf (PDF title "2282024MS…", i.e. 22-08-2024 edition) |
| Hyundai Creta | 2023 | E, EX, S | 205/65 R16 | Not available (no GC line in brochure) | — | https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/Creta-brochure-new.pdf (PDF created 2023-06-15; printed "Copyright © 2023 … Jan-Feb, 2023") |
| Hyundai Creta | 2023 | SX, SX(O) | 215/60 R17 | Not available | — | same brochure |
| Hyundai Creta | 2023 | SX Executive | 215/60 R17 | Not available | — | https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta-suv-brochure.pdf (PDF created 2023-02-01; only edition mapping SX Executive) |
| Hyundai Exter | 2026 | HX 2, HX 3 | 165/70 R14 | Not available (no GC line) | — | https://org3.hyundai.com/content/dam/hyundai/in/en/data/brochure/exter.pdf (PDF created 2026-09-16; footer "Aug, 2026"; HX nomenclature confirmed on https://www.hyundai.com/in/en/find-a-car/exter/features) |
| Hyundai Exter | 2026 | HX 4, HX 4+, HX 6, HX 6 Knight, HX 8, HX 10, HX 10 Knight | 175/65 R15 | Not available | — | same brochure (wheel style differs, size identical) |
| Hyundai i20 | 2026 | Era | 185/70 R14 | Not available (no GC line) | — | https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/i20.pdf (PDF created 2026-09-22; footer "Sep, 2026") |
| Hyundai i20 | 2026 | Magna | 185/65 R15 | Not available | — | same brochure |
| Hyundai i20 | 2026 | Sportz, Sportz (O), Sportz (O) Knight, Asta, Asta (O), Asta (O) Knight | 195/55 R16 | Not available | — | same brochure (styled steel vs diamond-cut alloy, same size) |
| Hyundai Verna | 2026 | HX 2, HX 4 | 185/65 R15 | Not available (no GC line) | — | https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/verna.pdf (PDF created 2026-03-09; footer "Mar, 2026") |
| Hyundai Verna | 2026 | HX 6, HX 6+, HX 8, HX 10, Turbo | 205/55 R16 | Not available | — | same brochure |
| Mahindra Thar (3-door) | 2025 | AXT | 245/75 R16 | 226 mm (basis unstated) | 650 mm (OEM capability figure) | https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw1a6fc272/brochure/Thar-Brochure-2025-NEW.pdf (PDF title "Thar Brochure 2025 NEW", created 2025-12-09) |
| Mahindra Thar (3-door) | 2025 | LXT | 255/65 R18 | 226 mm (basis unstated) | 650 mm (OEM capability figure) | same brochure (dims block under the AXT/LXT table covers both) |
| Royal Enfield Himalayan (450) | 2026 | base trim (leave Variant blank) | 90/90-21 F / 140/80 R17 R | 230 mm (basis unstated) | — | https://www.royalenfield.com/content/dam/open-pdf/royal-enfield-himalayan-450-technical-specifications-english-2026.pdf |

Candidate field counts: tyres 46/46 · ground clearance 12/46 (Swift 5,
Dzire 4, Thar 2, Himalayan 1) · wading 2/46 (Thar only) · exhaust
height 0/46, exhaust position 0/46 (no OEM consumer brochure found
publishes either).

How to use in the report form: Make + Model come from suggestions, Year
is a 4-digit year (blank never matches — specs stay "Not available"),
Variant is freeform. Because the verified set is currently empty, every
combination — including the researched rows above — honestly reads "Not
available" until exact-model-year proof graduates a candidate. Variant
strings above remain the researched spellings for that day
(case/whitespace-insensitive lookup, e.g. `vxi`, `SX(O)`, `HX 4`;
CNG variants such as `VXi CNG` were never mapped and must never inherit
other variants' values).

## What is NOT claimed (spec gaps, honest)

- No "all vehicles complete" claim — luxury marques (Mercedes-Benz, BMW,
  Audi, JLR, Volvo, Lexus…), commercial vehicles, three-wheelers,
  quadricycles (e.g. Bajaj Qute), and niche imports are absent by design.
  Omitted-but-real current models include VW Golf GTI, Skoda Octavia RS
  (limited run), Tata Tigor EV / Nexon EV as separate EV-suffixed rows
  (covered under bare names), and Vespa/Aprilia scooters. An unlisted
  vehicle is normal: type it freeform (e.g. the Ford F-150, never
  officially sold in India, stays freeform by test).
- Current-vs-historical is a point-in-time bucketing (check date
  2026-10-10), not a live feed; lineups change and this file is not
  auto-updated.
 - No verified spec rows exist right now: the 46 researched combinations
   above are quarantined candidates (edition-dated evidence only), so
   lookup stays exact make/model/year/variant/market and fail-closed —
   every query reads "Not available" until exact-model-year proof
   graduates a candidate to a verified row.
 - Spec gaps (all verified 2026-10-10, none backfilled from secondary
   sites):
    - Exhaust outlet height/position: carried by no candidate — not
      published in any OEM brochure/spec sheet fetched. Never inferred,
      never estimated from photos.
    - No OEM-published wading figure exists for any researched model except
      the Thar (650 mm, an OEM capability claim — NOT a safe-crossing
      depth, never rendered as one).
   - Ground clearance basis: Maruti figures are explicitly Unladen;
     Thar/Himalayan figures carry no basis tag (recorded as "OEM
     published", not assumed laden or unladen). Hyundai brochures
     fetched print no GC line at all — the commonly quoted Creta 190 mm
     appears only in a non-Hyundai-hosted reprint, so it is NOT
     published here.
   - CNG/fuel-split variants (Swift/Dzire/Ertiga VXi CNG etc.): no
     explicit row-level mapping in the brochures, so no rows — they
     resolve to "Not available", never to petrol-variant values.
   - Maruti Alto K10: official + mirror PDFs are image-only (no text
     layer), so the 145/80 R13 tyre could not be verified to row
     standard — no row published.
   - Tata Nexon/Punch/Harrier: cars.tatamotors.com was unreachable on
     the check date (expired TLS certificate + HTTP 502 + fetch
     transport error), so no Tata PDF could be verified — no rows
     published. Mirrors (Bhutan Tata domain, Gaadi) were deliberately
     not used as primary IN-market provenance.
   - Hyundai Venue: the 2025-edition tyre table's trim mapping is too
     garbled in text extraction to prove exact variant applicability —
     no rows published.
   - Honda Activa 6G: current OEM page fetch failed; only a dealer page
     reproduces the spec table — dealer pages are not OEM provenance,
     so no row published.
    - Full 316-name coverage is NOT feasible at this provenance bar:
      each verified row needs a directly fetched primary OEM document
      with proven exact model-year applicability plus an explicit variant
      mapping — edition dating plus a variant table is NOT enough. The 46
      researched combinations above stay quarantined candidates;
      everything honestly reads "Not available".
