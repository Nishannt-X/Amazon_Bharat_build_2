# Vehicle OEM Physical Specs — PRIMARY-OEM India Evidence (RESEARCH ONLY, non-production)

**Artifact:** `docs/research/vehicle-oem-physical-specs.md` (this file — ONLY file this agent may write)
**Scope split:** PRIMARY OEM India brochures / manuals / technical docs + engineering-homologation-measurement references. NOT paid-provider comparison (other agent owns that).
**Research date (checked):** 2026-10-09 (all web claims checked this date unless noted).
**Market priority:** India passenger cars first, 2-wheelers secondary. Global providers only if India-applicable.
**Provenance rule:** Every field below carries its own source URL / PDF section-or-page / checked-date / scope / status. Partial rows explicitly allowed. `unknown` means *not found in sources searched*, NEVER means *confirmed absent*.
**Safety rule:** NO inferred "flood-safe crossing depth" from specs or photos anywhere in this artifact.
**Math note (do not repeat old error):** `215/60R17` nominal overall diameter = **689.8 mm** (≈27.16 in), NOT 664.4 mm. Verified by independent calculators (TacomaWorld comparison table: "27.16 (689.8)"; Blackcircles: "approximately 690 mm (27.2 inches)"). No derivation is offered to the user as a feature; this note exists only to prevent re-use of the wrong constant. Sources checked 2026-10-09:
- https://www.tacomaworld.com/tirecalc?tires=215-60r17-235-65r17
- https://www.blackcircles.com/tyres/215-60-17

---

## 0. Concise actionable recommendation (for parent + USER DECISION)

1. **A useful, honest partial GC+tyre catalog IS buildable from primary OEM sources alone — do NOT reject it just because exhaust height is missing.** For the 6 representative Indian vehicles below, **tyre (front/rear/raw notation) + ground clearance with stated basis** is verifiable today at brochure/manual level for 5 of 6 (Alto K10 GC basis is the 1 gap — brochure excerpt found does not print GC; do not backfill from secondary sites as fact).
2. **Exhaust-outlet height above ground is NOT published in any OEM consumer brochure / spec page / owner's manual found in this broad search.** Position (e.g. "rear, upswept silencer", "tailpipe rear") is sometimes visible in official images/text, but **height in mm is: not documented** across all 6. Do not store a height, do not estimate from pixels, do not assume a generic tailpipe height.
3. **Intake-mount height is likewise NOT published in consumer docs for any of the 6. Wading depth is published ONLY by Mahindra Thar (650 mm)** as an OEM capability figure — it is NOT an intake height, NOT an exhaust height, and MUST NOT be re-labelled as "safe crossing depth" for the app.
4. **Recommended catalog v1 (evidence-only, non-production): ship `tyre + GC-with-basis + wading-if-OEM-published` with per-field provenance; leave `exhaust_height_mm` / `intake_height_mm` as explicit `unknown` with reason.** This gives FloodFlow a real, reviewable foundation (replacing the current 35-names + 0 verified-spec-rows state) without fabricating flood thresholds.
5. **Exhaust/intake heights require future primary work, in this order:** (a) OEM service/repair technical manuals + parts-catalogue drawings (position only, no height — still worth collecting); (b) homologation / type-approval drawings if obtainable (ARAI/CMVR route, access-blocked today); (c) peer-reviewed field-measurement datasets as methodology precedent, NOT as per-model data; (d) a reproducible physical-measurement protocol with laden-state + uncertainty (proposed in §6, future work only — no measured values are claimed in this artifact).
6. **Do NOT use this artifact as an app seed.** The JSON appendix (§7) is `non-production, evidence-only`. Any app catalog needs a second proof pass (edition/year/trim confirmation + laden-basis confirmation) described in §8.

---

## 1. Method + what "verified" means here

- **Primary sources preferred:** `marutisuzuki.com`, `hyundai.com / hyundai.co.in asset hosts`, `auto.mahindra.com`, `honda2wheelersindia.com` (+ authorised Honda dealer pages ONLY as clearly-labelled secondary when OEM page blocks/fails), `royalenfield.com` PDFs.
- **Secondary sources used ONLY for triage:** Team-BHP review (identifies brochure + trim tyre split), Autocar/BikeDekho/91wheels (flags version discrepancies, e.g. Activa GC 171 vs 162; Himalayan GC 224 vs 230). Secondary figures are NEVER promoted to "OEM-verified" in the sample table.
- **Status vocabulary (per field):**
  - `observed` — field value seen verbatim in cited primary source excerpt/page.
  - `explicit-docs-says-missing` — source explicitly states the datum is not supplied (rare; noted where applicable).
  - `not-documented` — broad search of the cited primary doc set found no such field (default for exhaust/intake heights).
  - `access-blocked` — URL / download gate / login / 404 / JS-only page prevented verification (cited as such, not as absence).
  - `unknown (reason)` — synthesis of the above for the sample row.
- **Year/trim discipline:** An undated/current brochure proves a *model-range* spec, NOT a "`2024 VXi`" claim, unless the edition is confirmed (dated PDF, model-year landing page, or variant table naming the trim). Where only "current brochure" is available, scope is recorded as `India-market current generation, edition undated — year/trim applicability needs second proof`. This avoids the earlier-research failure mode of asserting exact years from launch-range guesses.
- **Downloads:** Only small text excerpts / PDF text layers via search-preview + webfetch were used. No bulk datasets downloaded (disk-limited constraint respected).
- **Other agent's lane respected:** No paid API pricing, no exact-year variant pricing, no vendor contact, no implementation.

---

## 2. Homologation / measurement-basis reference (why GC basis matters)

| Claim | Source (direct URL, checked 2026-10-09) | Status |
|---|---|---|
| India GC was historically measured **unladen**; Maruti/Hyundai brochures in this study still print `Ground Clearance (mm) (Unladen)` | Maruti Swift SCNG vertical brochure PDF text: `DIMENSIONS Total Length (mm) 3860 … Ground Clearance (mm) (Unladen) 163` — https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/document/Swift_SCNG_VerticalBrochure.pdf | `observed` in primary PDF text layer |
| Alto K10 brochure prints `Overall Height (Unladen) (mm) 1520` — establishes Maruti's convention of tagging unladen dimensions explicitly | Same Maruti domain brochure: https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/alto-k10/brochures/Arena-Alto-K10-Brochure.pdf | `observed` |
| Post-2017 ARAI rule: GC officially measured **laden** (vehicle loaded, commonly reported as 4 adults + ≥90% fuel); reported figures dropped vs old unladen figures (e.g. Fortuner 225 unladen → 184 laden cited as illustration) | Team-BHP news summary of ARAI update (secondary, methodology context only, NOT a spec source): https://www.team-bhp.com/news/arai-updates-ground-clearance-measurement-standards | `observed` as press summary; underlying AIS text not directly verified in this pass — treat as `needs-primary-AIS-proof` before citing as regulation |
| ARAI publishes the Automotive Industry Standards (AIS) catalogue; individual AIS PDFs (e.g. dimensions/mass terminology) sit behind this portal | https://www.araiindia.com/downloads/ais-downloads ; https://www.araiindia.com/certification/standardisation/ais | `observed` portal exists; specific GC-measurement AIS number/page: `not-documented` in this pass (`access-blocked` by search depth, NOT confirmed absent) |
| IS 9435 (dimensions terminology, non-2/3-wheelers) exists via public-resource archive listing | https://archive.org/details/gov.in.is.9435.2004 | `observed` listing; full text measurement clause: `not-documented` in this pass (did not retrieve full standard) |
| CMVR Rule 115 governs fuel-efficiency certification labelling seen in brochures ("as certified … under Rule 115 of CMVR 1989") — confirms brochures are CMVR-aware docs, but does NOT make brochure GC a type-approval drawing | Seen in Swift SCNG brochure footnote via same Maruti PDF above | `observed` footnote |

**Implication for catalog:** always store `gc_basis: "unladen" | "laden" | "unknown"` + `gc_source_edition`. A bare `163` without basis is NOT comparable to a laden `184`. Maruti's explicit `(Unladen)` tag is the model to follow; Hyundai/Mahindra brochures found in this pass print GC without an explicit basis tag in the excerpt — record as `basis: unknown (brochure does not tag laden/unladen in excerpt retrieved)`.

---

## 3. Evidence-only sample dataset (6 representative Indian vehicles)

> Each row = what PRIMARY sources allow TODAY. `unknown` carries a reason. No flood-safe inference. Scope notes record India vs export confusion explicitly.

### 3.1 Field-level sample table

| # | Vehicle (as scoped) | Tyre front (raw OEM notation) | Tyre rear (raw OEM notation) | GC (mm + basis) | Exhaust outlet location + height | Intake height / wading | Per-field source / page-or-section / checked / scope+status |
|---|---|---|---|---|---|---|---|
| 1 | **Maruti Swift — India, 4th-gen (Epic New Swift, launched May 2024). Target: VXi.** Scope: `India-market 4th-gen range; VXi trim applicability observed via trim-split text` | `165/80 R14` (L/V incl. VXi, steel) | Same as front: `165/80 R14` (Swift uses same size F/R per trim; spare is `165/80 R14` steel on all trims incl. Z) | **163, basis: Unladen (explicit)** | Location: rear tailpipe (generic; no OEM height). Height: **unknown — not-documented** in brochure/spec page/owner's-manual set searched | Intake height: **unknown — not-documented**. Wading: **unknown — not-documented (no OEM wading figure for Swift)** | Tyre split: Team-BHP review of 2024 Swift (secondary triage) "L & V variants get 14-inch steel rims with 165/80 … ZXi/ZXi+ 185/65 R15 … spare … 165/80" — https://www.team-bhp.com/forum/official-new-car-reviews/280444-2024-maruti-swift-review.html (checked 2026-10-09; status: secondary, needs brochure variant-table proof before app use). GC unladen 163 + tyre: Maruti SCNG vertical brochure PDF text layer (primary): https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/document/Swift_SCNG_VerticalBrochure.pdf (checked 2026-10-09; scope: current Swift brochure, petrol+CNG; status: `observed`). Maruti model page confirms 3860/1735/1520 + brochure link (primary): https://www.marutisuzuki.com/arena/swift and https://www.marutisuzuki.com/swift (checked 2026-10-09; `observed` dimensions, GC not on landing-page excerpt). **Export-confusion guard:** South Africa Swift brochure (same platform, India-plant) lists GC **145 mm** + kerb 908–945 kg — https://content.suzukiauto.co.za/hubfs/Swift%202024/Swift%20Brochure_October%202024/Suzuki%20Swift%20Digital%20Brochure_2024.pdf (checked 2026-10-09). DO NOT use 145 for India; India figure is 163 unladen. Exhaust/intake: searched brochure text + ManualsLib Suzuki Swift 2024 owner's-manual index (no exhaust-height section found): https://www.manualslib.com/manual/3476295/Suzuki-Swift-2024.html (checked 2026-10-09; status: `not-documented`). |
| 2 | **Maruti Alto K10 — India, 3rd-gen (2022+). Target: VXi (representative).** Scope: `India-market current Alto K10 range; undated brochure — year NOT proven as 2024` | `145/80 R13` (all variants incl. VXi/VXi+ per brochure + tyre press) | Same: `145/80 R13` | **unknown — not-documented in brochure excerpt retrieved (needs proof; do NOT backfill 160 from secondary sites)** | Location: rear (generic). Height: **unknown — not-documented** | Intake: **unknown — not-documented**. Wading: **unknown — not-documented** | Tyre `145/80 R13` + `Overall Height (Unladen) 1520`, L 3530 / W 1490 / WB 2380: primary brochure PDF text — https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/alto-k10/brochures/Arena-Alto-K10-Brochure.pdf (checked 2026-10-09; `observed`). Mirror copy text: https://content.carlelo.com/media/models/AltoK10/brochure/alto-k10-brochure.pdf (checked 2026-10-09; `observed` same tyre). Tyre history note (secondary, context only): prior gen `155/65 R13` → current `145/80 R13` — https://www.tyremarket.com/tyremantra/maruti-alto-k10-2022-features-specifications-tyres (checked 2026-10-09; secondary). **GC gap is real:** brochure excerpt retrieved lists dimensions/tyre/brakes but no GC line in visible text; secondary sites variously print 160 (old-gen) but that is NOT Alto-K10-2022 primary proof. Status: `unknown (GC line not in brochure excerpt; owner's-manual + full-brochure page images still needed)`. Exhaust/intake: `not-documented`. |
| 3 | **Hyundai Creta — India, 2nd-gen (2020–2024) + facelift (2024+). Target: exact year/trim MUST be pinned per row (see note).** Scope: `India-market; DO NOT mix PH (200 mm) / Africa (190) / Nepal-export figures` | Per trim: `205/65 R16` (E/EX steel; S styled-steel) ; `215/60 R17` (SX/SX(O)/S(O)/SX Tech etc., alloy) ; newer Knight/King special trims `215/55 R18` (secondary listing) | Same as front per trim (Creta uses same size F/R; spare `205/65 R16` steel all trims) | **190, basis: unknown (brochure excerpt does not tag laden/unladen)** | Location: rear (generic). Height: **unknown — not-documented** | Intake: **unknown — not-documented**. Wading (ICE Creta): **unknown — not-documented (no OEM wading figure; Creta EV brochure GC 200 + breakover angle is NOT wading)** | Primary brochure PDFs (Hyundai India asset host): ① https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/Creta-brochure-new.pdf — tyre table `205/65 R16 (D=405.6) steel/styled … 215/60 R17 (D=436.6) alloy … Spare 205/65 R16` (checked 2026-10-09; `observed`). ② https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta-suv-brochure.pdf (2023-02-01) same tyre table (checked 2026-10-09; `observed`). ③ Current digital brochure https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta.pdf — `205/65 R16 steel/styled … 215/60 R17 alloy (S(O), SX, SX Premium)` (checked 2026-10-09; `observed`). GC 190: Nepal/Laxmi Hyundai reprint of India brochure technical-spec table `Ground Clearance (mm) 190 … Boot 433 … Tank 50 … Turning 5.3` — https://laxmihyundai.com/laravel-filemanager/files/1/creta/Hyundai-Creta-Brochure.pdf + https://laxmihyundai.com/laravel-filemanager/files/1/Creta%20Brochure%20_2021_FINAL.pdf (checked 2026-10-09; status: `observed` in reprint, needs `hyundai.co.in`-hosted edition for app-grade proof). Cross-market guard: Hyundai Africa CRETA_FL_2025 GC **190** (https://www.hyundai.com/content/dam/hyundai/africa/en/data/marketing/brochure/product/new-creta/CRETA_FL_2025_Brochure_EN.pdf) vs Hyundai Philippines **200** (https://www.hyundai.com/content/dam/hyundai/ph/en/data/marketing/brochure/product/creta/Creta-e-brochure.pdf) — both checked 2026-10-09; use ONLY India 190 row for FloodFlow. **Hyundai `D=` trap:** brochure `D=405.6 / 436.6 mm` is NOT overall tyre diameter (215/60R17 overall ≈689.8); treat `D` as brochure-internal wheel/rim reference, do not store as tyre OD. Owner's manuals (primary, no exhaust-height found): https://www.hyundai.com/content/dam/hyundai/in/en/data/connect-to-service/owners-manual/2025/creta&cretanline-Jan2024-Present.pdf and `creta-sep2020-Jan2024.pdf` (checked 2026-10-09; `not-documented` for exhaust/intake heights). |
| 4 | **Mahindra Thar 3-door — India (2020-gen; 2025 brochure). Target: representative AXT + LXT rows.** Scope: `India-market 3-door only; Roxx 5-door is a SEPARATE model — do not mix` | AXT: `245/75 R16` Tubeless All-Terrain (steel) ; LXT: `255/65 R18` (RWD = HT, 4WD = AT; alloy) | Same as front per variant (spare: full-size tailgate-mounted; TPMS on LXT) | AXT/LXT era: **226 (early AX Std/AX Opt/LX table: 219 for AX Std/Opt, 226 for LX)** — basis: **unknown (brochure excerpt untagged)**; 2025 brochure dimension block lists GC **226** | Location: rear (generic; no OEM height). Height: **unknown — not-documented** | Intake height: **unknown — not-documented**. **Wading: 650 mm (OEM-published capability figure — NOT intake/exhaust height, NOT safe-crossing advice)** | Primary: 2025 brochure https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw1a6fc272/brochure/Thar-Brochure-2025-NEW.pdf — dimensions `L3985/W1820/H1850-1855/WB2450/Track1520/GC226/Approach41.2/Departure36/Ramp26.2/Wading650 … Tyres 245/75R16 + 255/65R18` (checked 2026-10-09; `observed`). Early-gen table (219/226 split + 650 wading + 6-seater/4-seater): mirror https://img.gaadicdn.com/brochures/files/Mahindra-Thar/1601634892680/Thar_Brochure-new.pdf (checked 2026-10-09; `observed` as historical edition). Variant tyre split (secondary triage, needs brochure variant-table image proof): https://www.spinny.com/blog/mahindra-thar-tyre-guide (checked 2026-10-09; secondary). **Roxx guard:** Thar Roxx brochure is separate (`L4428/W1870/H1923`, R19/R18 wheels) — https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw730371ab/thar-roxx/THAR-ROXX-Brochure.pdf (checked 2026-10-09); Roxx wading also 650 per Mahindra press (https://www.mahindra.com/print/pdf/node/6757) — do NOT copy Roxx rows into 3-door Thar. Exhaust/intake heights: `not-documented` in brochures searched. |
| 5 | **Honda Activa (110, 6G platform; BS-VI → OBD-2B). Target: representative Activa 6G/Activa-110 row — generation MUST be versioned.** Scope: `India-market; GC figure CHANGED across editions — do not present a single timeless GC` | Front: `90/90-12 54J` Tubeless | Rear: `90/100-10 53J` Tubeless | **171 (Activa 6G launch edition, dealer-published Honda spec table) vs 162 (later OBD-2B listings, secondary) — primary OEM page for current edition: access-blocked in this pass; catalog MUST version the row** | Location: side/rear low muffler (generic). Height: **unknown — not-documented** | Intake: **unknown — not-documented**. Wading: **unknown — not-documented** | Primary-adjacent (authorised Honda dealer reproducing Honda spec table): `L1833/W697/H1156/WB1260/GC171/Seat692?/Kerb107/Tank5.3/Tyres 90/90-12 F + 90/100-10 R` — https://www.aherhonda.com/scooters/activa6g (checked 2026-10-09; status: `observed` on dealer page, NOT `honda2wheelersindia.com` — needs OEM-PDF proof for app use). Current-edition conflict (secondary): Autocar Activa-110 spec `L1833/W677/H1165/WB1260/GC162/Kerb105-106/Tyres 90/90-12 F + 90/100-10 R` — https://www.autocarindia.com/bikes/honda-bikes/activa-6g/specifications (checked 2026-10-09; secondary). Tyre split corroborated by tyre press (secondary): https://www.tyremarket.com/tyremantra/honda-activa-scooter-tyres-price-list (checked 2026-10-09). **OEM access-blocked:** `https://www.honda2wheelersindia.com/products/scooter/activa` returned **404** on webfetch 2026-10-09 → status `access-blocked (404/product-URL-changed)`, NOT absence. Honda 2025 Activa launch (OBD-2B/TFT) exists per Honda press via Wikipedia refs (secondary pointer only) — edition must be pinned before any `2024/2025` claim. Exhaust/intake: `not-documented`. |
| 6 | **Royal Enfield Himalayan 450 (Sherpa 450, 452 cc; launch Nov 2023+). Target: representative 450 row — DO NOT mix 411 rows.** Scope: `India-market 450; 411 figures (GC 220, tyres 90/90-21 + 120/90-17, L2190/W840/H1370/WB1465) are a DIFFERENT model` | Front: `90/90-21` (`M/C 54H`, CEAT Gripp RE F; tube stock, tubeless option on select colourways) | Rear: `140/80 R17` (`M/C 69H`, CEAT Gripp Rad steel RE; tube stock, tubeless option on select colourways) | **230 (2026 English spec PDF) ; older 450 owner's-manual-domain PDF shows 224 — version MUST be recorded; basis unknown (untagged)** | Location: **upswept silencer, right side** (OEM text confirms position, NOT height). Height: **unknown — not-documented** | Intake: **unknown — not-documented**. Wading: **unknown — not-documented (no OEM wading figure found for Himalayan 450)** | Primary PDFs (Royal Enfield domain): ① Technical specs `Front 90/90-21 … Rear 140/80R17 … 32 psi … GC 224 … Kerb 196 (90% fuel+oil) … GVW 394` — https://www.royalenfield.com/content/dam/open-pdf/royal_enfield_himalayan_450_technical_specifications.pdf (checked 2026-10-09; `observed` as one 450 edition). ② 2026 English spec `GC 230 … L2285/W852/H1316/WB1510/Seat825(adj845)/Dry181/Kerb196/Payload198/Tank17 … Tyres Fr 90/90-21 Rr 140/80R17 … Susp travel 200/200 … Brakes 320/270 …` — https://www.royalenfield.com/content/dam/open-pdf/royal-enfield-himalayan-450-technical-specifications-english-2026.pdf (checked 2026-10-09; `observed` as newer edition). 411-guard (different model): https://www.royalenfield.com/content/dam/royal-enfield/india/motorcycles/himalayan/specifications/himalayan-specification-new.pdf — `GC 220 … 90/90-21 + 120/90-17 … upswept silencer + 220 GC` text (checked 2026-10-09). Owner's-manual portal (primary, no heights found): https://www.royalenfield.com/in/en/support/owners-manual (checked 2026-10-09) + 450 owner's manual PDF https://www.royalenfield.com/content/dam/open-pdf/royal-enfield-new-himalayan-450-owners-manual-uk-english.pdf (checked 2026-10-09; `not-documented` for exhaust/intake heights). |

**Trim/year applicability ledger (to prevent exact-year overclaim):**

- Swift VXi 2024: VXi tyre applicability comes from a 2024 review's trim split (secondary) + current-brochure range specs (primary, undated). **Additional proof needed before app:** dated 2024-edition brochure variant table page showing `VXi — 165/80 R14`.
- Alto K10: brochure undated → record as `2022+ generation range`, NOT `2024`. Needs dated edition + GC line.
- Creta: MUST record `brochure edition date + trim list` per row (2020 vs 2023-02-01 vs current digital vs Knight/King). `SX 215/60 R17` is the safest representative row (stable across editions); `215/55 R18` rows need edition proof.
- Thar: record `2025 brochure` vs `2020 launch table` (219 vs 226 split). Representative LXT row: `255/65 R18 + GC 226 + wading 650 (2025 brochure)`.
- Activa: MUST version `6G-launch (GC 171)` vs `OBD-2B/current (GC 162 per secondary)`; no `2024` claim without dated Honda PDF.
- Himalayan 450: MUST version `224 edition` vs `230 (2026 English)`; no year claim without edition date; NEVER mix 411.

---

## 4. Where exhaust / intake specs actually exist (broad systematic search — results)

**Question asked:** where, if anywhere, are exhaust-outlet position+height and intake-mount height published?

| Source class searched | What was looked for | Result (checked 2026-10-09) | Direct pointers |
|---|---|---|---|
| OEM consumer brochures (Maruti, Hyundai, Mahindra, Honda-dealer, RE — §3) | Tyre/GC/dimensions tables; any exhaust/intake/wading line | **Tyre+GC (+ Thar wading) observed; exhaust height + intake height: not-documented in every brochure excerpt retrieved.** No brochure prints `exhaust height mm` or `intake height mm`. | PDFs in §3; Hyundai owner's-manual pair (Creta Jan2024-Present + Sep2020-Jan2024) via https://www.hyundai.com/content/dam/hyundai/in/en/data/connect-to-service/owners-manual/2025/creta&cretanline-Jan2024-Present.pdf |
| OEM owner's manuals (Suzuki Swift 2024 index; Hyundai Creta pair; RE Himalayan 450 UK-English + domestic 411 manual; Honda via dealer) | Exhaust-system section, dimensions, wading warnings | **Position/maintenance info only; heights not-documented.** ManualsLib Suzuki Swift 2024 index shows no exhaust-height chapter: https://www.manualslib.com/manual/3476295/Suzuki-Swift-2024.html. RE 411 domestic manual contents show silencer/exhaust-pipe maintenance + washing precautions ("cover silencer, tail pipe … to prevent water entry") but no height: https://www.royalenfield.com/content/dam/royal-enfield/ownersManual/Himalayan_Owners_Manual_Domestic.pdf. RE service-manual excerpts (ManualsLib) detail exhaust-pipe/silencer removal torques, not heights: https://www.manualslib.com/manual/1345589/Royal-Enfield-Himalayan.html. | Same URLs; status: `not-documented` (not `explicit-missing`) |
| OEM service / repair technical manuals + genuine parts catalogues | Exploded drawings, silencer/exhaust-pipe part numbers, underbody routing | **Position-only value confirmed as a class; height still not published.** RE Himalayan parts/service docs (forum index of genuine catalogues/service manuals) show exhaust-pipe + silencer assemblies with fasteners/torques — useful for *position/routing* provenance, NOT height: https://www.royalenfieldowners.com/index.php?threads%2Fowner-and-service-manual-links.63%2F. Hyundai/Maruti service manuals sit behind dealer paywalls / login in this pass → `access-blocked`, not pursued via unofficial mirrors (license-unclear). | Forum index above (secondary pointer to primary docs); no unofficial PDF mirrored here |
| Official CAD drawings / parts images | Tailpipe/muffler geometry | **Position-only, NO height inferred.** Official brochure/parts images show rear/upswept placement (e.g. RE "upswept silencer" text) but pixel estimates are FORBIDDEN by task spec — none attempted. No OEM CAD with ground-plane dimension found in open search. | RE 411 spec PDF "upswept silencer" line (position text, §3.6) |
| Homologation / type-approval docs (CMVR/AIS/ARAI) | Type-approval drawings with exhaust/intake heights | **Not retrievable in open search this pass → `access-blocked / not-documented`, NOT absence.** ARAI AIS portal confirmed to exist (https://www.araiindia.com/downloads/ais-downloads) but the specific dimension-measurement AIS + any model-level approval drawing were not retrieved. CMVR chapter-5 excerpt found governs weights/tyres/brakes, not exhaust heights: https://morth.nic.in/sites/default/files/CMVR-chapter5.pdf. No claim "homologation never contains heights" is made. | Portal + CMVR PDF above |
| Academic / field-measurement datasets | Primary papers with per-model intake/exhaust heights | **No per-model Indian-vehicle intake/exhaust-height dataset found.** What EXISTS is (a) flood–vehicle instability literature (flume + floating thresholds, NOT intake heights) and (b) generic intake-height ranges cited in reviews, NOT per-model OEM data. These are methodology/background context ONLY, never per-vehicle facts. | Instability review: https://research-information.bris.ac.uk/ws/files/191868409/Full_text_PDF_final_published_version_.pdf (Pregnolato et al. 2017 — 0.3 m passenger-car / 0.6 m emergency-vehicle flume thresholds; floating ≈300 mm widely recognised; air-intake wash-in discussion). Generic-range citation: https://www.nature.com/articles/s41598-025-19649-5 ("typical passenger-car intake 0.2–0.3 m; SUV 0.4–0.6 m; user-manual wading warnings 0.2–0.3 m" — review-level generalisation, NOT per-model data). Driver-education context (exhaust-stall + low intake warnings): Montana driver-ed flood fact sheet (PDF) via search session (secondary context). UNSW flume reporting (4WD unstable 0.45 m, floats 0.95 m): ABC summary (secondary context). |
| Automotive flood research (OEM wading claims) | Which OEMs publish wading at all | **Only Thar (650 mm) among the 6.** Land Rover-type counter-examples (900 mm wading + 207/285 GC + approach/departure tables) confirm the *class* of data exists globally (https://res.cloudinary.com/ho5waxsnl/image/upload/q_auto/f8gqnb2aiui3auc65onubvv8gxp8.pdf — JLR technical-spec excerpt, checked 2026-10-09) but provide ZERO Indian-model facts. Do not import. | JLR excerpt above as existence proof of wading-spec class only |

**Bottom line:** after a broad systematic pass (brochures + spec pages + owner's-manual indexes + service/parts pointers + homologation portals + academic literature), **no published exhaust-outlet height and no published intake-mount height for any of the 6**. The honest catalog states `unknown — not-documented in primary sources searched` per field, with the source classes logged so a future pass can resume without re-searching blind. A universal "no exhaust data exists anywhere" claim is NOT made — only the scoped "not found in the source classes above for these 6 as of 2026-10-09".

---

## 5. Critical distinctions (GC vs intake/exhaust/wading) + India/export traps

1. **GC ≠ intake ≠ exhaust ≠ wading.** GC (lowest underside point, laden/unladen-dependent) is a clearance-to-obstacle figure. Intake height (air-filter inlet / snorkel mouth) governs hydrostatic-lock risk. Exhaust height governs stall/backflow behaviour (and hot-catalyst cracking on submersion per driver-ed literature). Wading depth (where published, e.g. Thar 650) is an OEM *capability claim under test conditions*, not a derived minimum of the other three and not transferable across models. The catalog MUST keep four separate nullable columns; a present GC+tyre row stays useful even with exhaust/intake unknown.
2. **Laden vs unladen is load-bearing.** Maruti tags `(Unladen)` explicitly; post-2017 Indian GC is officially laden. Mixing a 163-unladen Swift with a 184-laden Fortuner-class figure (Team-BHP illustration) without basis tags is a category error. Store basis always.
3. **Tyre notation is per-trim and per-axle-identical here, but record it per-axle anyway.** All 6 use same size F/R in the representative rows (Swift 165/80 R14; Alto 145/80 R13; Creta per-trim; Thar per-variant; Activa split-diameter 12F/10R; Himalayan 21F/17R). "Split-diameter" (Activa, Himalayan) is NOT "split-width" ambiguity — record raw strings verbatim (`90/90-12 54J`, `90/100-10 53J`, `90/90-21`, `140/80 R17`) plus `wheel_in` separately.
4. **India vs export confusion is the top misattribution risk found:**
   - Swift: India **163 unladen** vs South Africa **145** (same India-plant platform, different brochure) vs Pakistan **160 + 185/55R16** (different fitment).
   - Creta: India **190** vs Philippines **200** (different market brochure).
   - Himalayan 411 vs 450: different models, different GC/tyres/dimensions — never merge.
   - Thar 3-door vs Roxx 5-door: different models — never merge.
   - Activa 6G-launch vs OBD-2B-current: same name, different GC in secondary listings — version the row.
5. **Hyundai `D=` is not tyre OD.** Brochure `215/60 R17 (D=436.6 mm)` sits near rim diameter (17 in = 431.8 mm), NOT the ≈689.8 mm overall diameter. Store raw brochure string + separately store computed-or-published OD ONLY with its own source (tyre calculator / ETRTO), never overwrite the brochure string.

---

## 6. Reproducible physical-measurement protocol (FUTURE WORK — no values claimed here)

> Proposed ONLY because published heights were not found after broad search. Any future `measured` rows MUST carry `provenance: "measured"` separate from `provenance: "oem-published"`, with laden-state + uncertainty. Do NOT mix provenances in one column without a tag.

1. **Vehicle state:** record variant + VIN-range/model-year + market + odometer + tyre spec + cold pressures + fuel load (% full) + occupant/cargo load (kerb / half-laden / GVW) + suspension mode (if adjustable). Photograph placard + tyre sidewall + fuel gauge + load setup.
2. **Ground plane:** level concrete slab (≤0.5° verified by digital level); metric steel tape + laser measure cross-checked; plumb line from measurement point to ground; photograph each drop.
3. **Exhaust outlet:** lowest inner lip of tailpipe exit (or silencer drain if lower and documented). Record `x (longitudinal from front axle) / y (lateral from centreline) / z (height, mm)` + outlet orientation (rear/down/angled) + photo with tape. Repeat at kerb + laden; report both + delta (suspension compression).
4. **Intake:** airbox inlet / snorkel mouth (NOT grille opening). Requires bonnet-open + service-manual routing confirmation; record same x/y/z + photo. If disassembly needed, record `method: visual-external (approx)` vs `method: service-manual-referenced` and do NOT publish a false-precision mm.
5. **Uncertainty:** report ±mm (instrument + ground unevenness + load tolerance) + tyre-wear state (tread depth) + repeat count (n≥3). Example format: `exhaust_z_kerb_mm: 285 ± 8 (n=3, concrete, half-tank, unladen, tread 6.2 mm)`.
6. **Licence/consent:** measurer identity + date + vehicle consent + CC/release for photos; store raw photos separately, artifact keeps only values + method link.
7. **What this does NOT produce:** a flood-safe crossing depth. Measured heights are inputs to a future risk model with velocity, duration, bow-wave, electronics-sealing, and recovery-margin terms — none of which are in this artifact.

---

## 7. Appendix A — evidence-only JSON (NON-PRODUCTION, do not seed app)

```json
{
  "artifact": "docs/research/vehicle-oem-physical-specs.md",
  "provenance_default": "oem-published",
  "checked_date": "2026-10-09",
  "warning": "EVIDENCE-ONLY. Partial rows allowed. unknown != absent. NO flood-safe inference. Do not seed app without §8 proof pass.",
  "vehicles": [
    {
      "id": "maruti-swift-4thgen-IN-VXi-rep",
      "scope": "India-market 4th-gen (Epic New Swift); VXi tyre via trim-split (secondary triage, needs dated brochure proof)",
      "tyre_front_raw": "165/80 R14",
      "tyre_rear_raw": "165/80 R14",
      "tyre_basis": "L/V trims steel; Z trims 185/65 R15 (range context)",
      "gc_mm": 163,
      "gc_basis": "unladen (explicit in brochure)",
      "exhaust_location": "rear (generic)",
      "exhaust_height_mm": null,
      "exhaust_height_status": "unknown — not-documented in brochure/spec/manual set searched",
      "intake_height_mm": null,
      "intake_height_status": "unknown — not-documented",
      "wading_mm": null,
      "wading_status": "unknown — no OEM wading figure",
      "sources": [
        {"field": "gc+tyre-range", "url": "https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/document/Swift_SCNG_VerticalBrochure.pdf", "section": "TECHNICAL SPECIFICATIONS / DIMENSIONS text layer", "checked": "2026-10-09", "status": "observed (primary)"},
        {"field": "model-range dims + brochure link", "url": "https://www.marutisuzuki.com/arena/swift", "section": "spec fragments", "checked": "2026-10-09", "status": "observed (primary)"},
        {"field": "VXi trim tyre split", "url": "https://www.team-bhp.com/forum/official-new-car-reviews/280444-2024-maruti-swift-review.html", "section": "Wheels & Tyres + Ground Clearance", "checked": "2026-10-09", "status": "secondary triage — needs dated brochure variant-table proof"},
        {"field": "export-guard (do NOT use for India)", "url": "https://content.suzukiauto.co.za/hubfs/Swift%202024/Swift%20Brochure_October%202024/Suzuki%20Swift%20Digital%20Brochure_2024.pdf", "section": "MAJOR SPECIFICATIONS (GC 145)", "checked": "2026-10-09", "status": "observed as export counter-example"}
      ]
    },
    {
      "id": "maruti-alto-k10-gen3-IN-rep",
      "scope": "India-market 2022+ generation range; undated brochure — year NOT proven",
      "tyre_front_raw": "145/80 R13",
      "tyre_rear_raw": "145/80 R13",
      "gc_mm": null,
      "gc_basis": "unknown — GC line not in brochure excerpt retrieved; do NOT backfill",
      "exhaust_height_mm": null,
      "exhaust_height_status": "unknown — not-documented",
      "intake_height_mm": null,
      "intake_height_status": "unknown — not-documented",
      "wading_mm": null,
      "wading_status": "unknown — no OEM wading figure",
      "sources": [
        {"field": "tyre + unladen-height convention", "url": "https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/alto-k10/brochures/Arena-Alto-K10-Brochure.pdf", "section": "TECHNICAL SPECIFICATIONS text layer (Tyre Size 145/80 R13; Overall Height (Unladen) 1520)", "checked": "2026-10-09", "status": "observed (primary)"},
        {"field": "tyre mirror", "url": "https://content.carlelo.com/media/models/AltoK10/brochure/alto-k10-brochure.pdf", "section": "same spec block", "checked": "2026-10-09", "status": "observed (mirror)"}
      ]
    },
    {
      "id": "hyundai-creta-IN-SX-215-60R17-rep",
      "scope": "India-market; representative SX-class row (stable across editions); exact year/trim per-row pinning still needed",
      "tyre_front_raw": "215/60 R17",
      "tyre_rear_raw": "215/60 R17",
      "tyre_basis": "SX/SX(O)/S(O) alloy; E/EX 205/65 R16 steel; spare 205/65 R16 steel all trims",
      "gc_mm": 190,
      "gc_basis": "unknown — brochure excerpt untagged (do not assume laden/unladen)",
      "exhaust_height_mm": null,
      "exhaust_height_status": "unknown — not-documented",
      "intake_height_mm": null,
      "intake_height_status": "unknown — not-documented",
      "wading_mm": null,
      "wading_status": "unknown — no OEM ICE wading figure (EV 200 GC + breakover angle is NOT wading)",
      "sources": [
        {"field": "tyre table", "url": "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/Creta-brochure-new.pdf", "section": "Tyre Size block (D=405.6 / 436.6)", "checked": "2026-10-09", "status": "observed (primary)"},
        {"field": "tyre table (2023-02-01 ed.)", "url": "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta-suv-brochure.pdf", "section": "Tyre Size block", "checked": "2026-10-09", "status": "observed (primary)"},
        {"field": "tyre table (current digital)", "url": "https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta.pdf", "section": "Tyre Size block", "checked": "2026-10-09", "status": "observed (primary)"},
        {"field": "GC 190 tech table", "url": "https://laxmihyundai.com/laravel-filemanager/files/1/creta/Hyundai-Creta-Brochure.pdf", "section": "TECHNICAL SPECIFICATIONS (GC 190 / Boot 433 / Tank 50)", "checked": "2026-10-09", "status": "observed in reprint — needs hyundai.co.in-hosted edition for app proof"},
        {"field": "owner's-manual (no heights)", "url": "https://www.hyundai.com/content/dam/hyundai/in/en/data/connect-to-service/owners-manual/2025/creta&cretanline-Jan2024-Present.pdf", "section": "full manual index searched", "checked": "2026-10-09", "status": "not-documented for exhaust/intake heights"}
      ]
    },
    {
      "id": "mahindra-thar-3door-IN-LXT-rep",
      "scope": "India-market 3-door ONLY (Roxx excluded); 2025 brochure edition",
      "tyre_front_raw": "255/65 R18",
      "tyre_rear_raw": "255/65 R18",
      "tyre_basis": "LXT (RWD HT / 4WD AT); AXT uses 245/75 R16 AT steel",
      "gc_mm": 226,
      "gc_basis": "unknown — brochure excerpt untagged (early table: 219 AX Std/Opt vs 226 LX)",
      "exhaust_height_mm": null,
      "exhaust_height_status": "unknown — not-documented",
      "intake_height_mm": null,
      "intake_height_status": "unknown — not-documented",
      "wading_mm": 650,
      "wading_status": "observed — OEM capability figure (NOT intake/exhaust height, NOT safe-crossing advice)",
      "sources": [
        {"field": "dims+tyres+wading", "url": "https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw1a6fc272/brochure/Thar-Brochure-2025-NEW.pdf", "section": "Suspension/Brakes/Wheels + Dimensions block (GC226/Wading650/245-75R16+255-65R18)", "checked": "2026-10-09", "status": "observed (primary)"},
        {"field": "historical 219/226 + 650 table", "url": "https://img.gaadicdn.com/brochures/files/Mahindra-Thar/1601634892680/Thar_Brochure-new.pdf", "section": "Technical Specifications table", "checked": "2026-10-09", "status": "observed as historical edition"},
        {"field": "Roxx guard (separate model)", "url": "https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw730371ab/thar-roxx/THAR-ROXX-Brochure.pdf", "section": "Roxx dims (L4428 etc.)", "checked": "2026-10-09", "status": "observed as exclusion proof"}
      ]
    },
    {
      "id": "honda-activa-110-IN-6Gplatform-rep",
      "scope": "India-market 6G platform; GC VERSIONED (171 launch vs 162 current-secondary); year NOT pinned",
      "tyre_front_raw": "90/90-12 54J",
      "tyre_rear_raw": "90/100-10 53J",
      "gc_mm": 171,
      "gc_basis": "unknown — dealer table untagged; CONFLICT with 162 in current-secondary listings (version, do not merge)",
      "exhaust_height_mm": null,
      "exhaust_height_status": "unknown — not-documented",
      "intake_height_mm": null,
      "intake_height_status": "unknown — not-documented",
      "wading_mm": null,
      "wading_status": "unknown — no OEM wading figure",
      "sources": [
        {"field": "dims+tyres (GC171)", "url": "https://www.aherhonda.com/scooters/activa6g", "section": "Specifications table", "checked": "2026-10-09", "status": "observed on authorised-dealer page — needs Honda-OEM PDF for app proof"},
        {"field": "conflicting GC162 (version flag)", "url": "https://www.autocarindia.com/bikes/honda-bikes/activa-6g/specifications", "section": "Dimensions block", "checked": "2026-10-09", "status": "secondary — version conflict, not fact"},
        {"field": "OEM page access", "url": "https://www.honda2wheelersindia.com/products/scooter/activa", "section": "product page", "checked": "2026-10-09", "status": "access-blocked (404 on fetch) — NOT absence"}
      ]
    },
    {
      "id": "re-himalayan-450-IN-rep",
      "scope": "India-market 450 (Sherpa 450) ONLY; 411 excluded; GC versioned (224 vs 230-2026English)",
      "tyre_front_raw": "90/90-21",
      "tyre_rear_raw": "140/80 R17",
      "tyre_basis": "CEAT Gripp F/R; tube stock; tubeless option select colourways; 32 psi F&R",
      "gc_mm": 230,
      "gc_basis": "unknown — untagged (older 450 PDF shows 224; record edition)",
      "exhaust_location": "upswept silencer, right side (position text, NOT height)",
      "exhaust_height_mm": null,
      "exhaust_height_status": "unknown — not-documented",
      "intake_height_mm": null,
      "intake_height_status": "unknown — not-documented",
      "wading_mm": null,
      "wading_status": "unknown — no OEM wading figure",
      "sources": [
        {"field": "tyres+GC224+weights", "url": "https://www.royalenfield.com/content/dam/open-pdf/royal_enfield_himalayan_450_technical_specifications.pdf", "section": "TECHNICAL SPECIFICATIONS pp.14/18", "checked": "2026-10-09", "status": "observed (primary, one 450 edition)"},
        {"field": "GC230+dims+travel+brakes", "url": "https://www.royalenfield.com/content/dam/open-pdf/royal-enfield-himalayan-450-technical-specifications-english-2026.pdf", "section": "DIMENSIONS & WEIGHTS + CHASSIS + BRAKES & TYRES", "checked": "2026-10-09", "status": "observed (primary, newer edition)"},
        {"field": "411 guard + upswept-silencer position text", "url": "https://www.royalenfield.com/content/dam/royal-enfield/india/motorcycles/himalayan/specifications/himalayan-specification-new.pdf", "section": "marketing + spec block (GC220, 90/90-21 + 120/90-17)", "checked": "2026-10-09", "status": "observed as different-model exclusion"},
        {"field": "owner's-manual (no heights)", "url": "https://www.royalenfield.com/content/dam/open-pdf/royal-enfield-new-himalayan-450-owners-manual-uk-english.pdf", "section": "full manual", "checked": "2026-10-09", "status": "not-documented for heights"}
      ]
    }
  ]
}
```

---

## 8. Concrete verified facts (ready for review) vs additional proof needed before app

**Ready for review (primary-observed, edition-scoped):**
- Swift: `163 unladen` + range tyres `165/80 R14 (L/V) / 185/65 R15 (Z)` + dims `3860/1735/1520/WB2450` (Maruti brochure domain, checked 2026-10-09).
- Alto K10: `145/80 R13` + `L3530/W1490/H1520-unladen/WB2380` (Maruti brochure domain, checked 2026-10-09). GC deliberately left unknown.
- Creta SX-class: `215/60 R17 F/R + spare 205/65 R16` (Hyundai brochure host, 3 editions, checked 2026-10-09) + `GC 190 (basis untagged)` + `Boot 433 / Tank 50` (reprint tech table). `D=436.6` stored as brochure string, NOT OD.
- Thar 3-door: `AXT 245/75 R16 / LXT 255/65 R18 + GC 226 + wading 650 + L3985/W1820/WB2450/Track1520` (Mahindra 2025 brochure, checked 2026-10-09) + historical `219/226` split preserved.
- Activa 6G-platform: `90/90-12 F + 90/100-10 R + L1833/W697/H1156/WB1260/GC171(dealer-table)` — flagged as dealer-level proof, OEM-PDF proof still needed; conflicting `162` versioned, not merged.
- Himalayan 450: `90/90-21 F + 140/80 R17 R + GC 230 (2026 English) / 224 (older 450 PDF) + Kerb 196 (90% fuel+oil) + travel 200/200 + brakes 320/270` (RE domain PDFs, checked 2026-10-09) + `upswept silencer` position text.

**Additional proof needed before ANY app seed:**
1. Dated brochure edition + variant-table page image/PDF for each `year-trim` claim (esp. Swift VXi 2024, Creta exact trim-year, Activa edition-year, Himalayan edition-year).
2. Alto K10 GC line from full brochure page-images or owner's manual (current text-layer excerpt lacks it).
3. Hyundai India-hosted (hyundai.co.in) GC-190 edition to replace reprint proof.
4. Honda OEM PDF (honda2wheelersindia.com press/brochure host or dealer PDF with Honda letterhead) to replace dealer-page proof + resolve 171-vs-162.
5. Laden/unladen tags for Creta/Thar/Himalayan/Activa GC (owner's manual "specifications" chapter or dated brochure footnote).
6. Explicit `front==rear` confirmation per trim from variant table (already strong for cars; needed in writing for 2-wheelers which are split-diameter by design).
7. Exhaust/intake: NO app column populated until (a) service-manual position drawings collected with licence + (b) measured-protocol (§6) rows with separate provenance exist. Until then columns stay `null + reason`.

---

## 9. Source comparison + coverage gaps + sourcing effort

| Source class | What it gives (for these 6) | What it withholds | Effort to expand |
|---|---|---|---|
| Maruti/Hyundai/Mahindra/RE brochure PDFs (primary, open) | Tyre, GC (sometimes with basis), dims, Thar wading, trim splits | Exhaust/intake heights (never), laden basis (often), edition dates (sometimes) | **Low (0.5–1 day):** pull dated PDFs for top-20 India passenger cars (Swift, Baleno, WagonR, Brezza, Ertiga, Dzire, Fronx, Creta, Venue, i20, Verna, Thar, Scorpio-N, XUV700, Punch, Nexon, Harrier, Safari, Innova Crysta/Hycross, Fortuner) + record per-field provenance as in §7. Yields tyre+GC partial catalog, NO exhaust/intake. |
| Owner's manuals (primary, mostly open via OEM/manual portals) | Tyre pressures, maintenance, position info, sometimes full spec tables | Exhaust/intake heights (not found in indexes searched) | **Low–Medium (1–2 days):** sweep OEM manual portals + record spec-chapter page numbers; expected yield: basis tags + tyre-pressure tables, NOT heights. |
| Service/repair manuals + parts catalogues (primary, gated) | Exhaust routing/position drawings, part numbers, torques | Heights (dimension-to-ground not in parts docs by design); access via paywall/login | **Medium (3–5 days + access cost/licence review):** acquire 1–2 manuals lawfully (e.g. RE Himalayan 450 service manual via authorised channel) to prove the *position-only ceiling*; do not expect heights. Licence clearance needed before storing drawings. |
| Homologation / ARAI / CMVR drawings | Possible ground-plane dimensions (unverified) | Behind approval workflow; no open per-model drawing found | **Medium–High (1–3 weeks + possible RTI/dealer-network route):** identify exact AIS for dimension measurement + request model approval drawing excerpts via lawful channel. Outcome uncertain — budget as research spike, not catalog dependency. |
| Academic / flood literature | Methodology precedent (flume, floating thresholds, generic intake ranges), instability equations | Zero per-model Indian heights | **Low (0.5 day, done):** keep as background refs (§4); do not expand as data source. |
| Physical measurement (§6) | The ONLY route found to real exhaust/intake heights | Requires vehicles, slab, labour, consent, uncertainty bookkeeping | **High per unit, scalable with discipline:** pilot 6 vehicles ≈ **2–3 field days + 1 doc day** (1 tech + 1 recorder, level slab, tape+laser, kerb+laden, photos). Per-vehicle marginal ≈ **1–1.5 hrs** once protocol is set. Provenance `measured` must never merge silently with `oem-published`. |

**Minimal partially-populated REAL catalog — timeline/effort (explicit, no fake "all cars"):**
- **Week 1 (solo researcher, ~3–4 days):** dated-brochure sweep for top-20 India cars + Activa/Jupiter/Splendor/Pulsar/Himalayan/Classic-350 rows → `tyre(F/R raw) + GC(+basis) + wading-if-OEM` with per-field URLs. Expected: **~25–30 rows, tyre ~95% filled, GC ~85% filled (basis-tagged ~60%), exhaust/intake 0% (explicit unknown)**. This is the honest v1 — reviewable, shippable as research, NOT as flood thresholds.
- **Week 2 (optional, +2–3 days):** owner's-manual basis-tag pass + 2-wheeler edition-versioning (Activa 171-vs-162 resolution, Jupiter/Splendor equivalents) + service-manual position-only appendix for 6 pilot vehicles (licence-checked).
- **Weeks 3–4 (optional field track):** §6 pilot on the 6 vehicles → first real `exhaust_z + intake_z (kerb+laden ± uncertainty)` with `measured` provenance. Only after this does an exhaust/intake column earn a non-null value anywhere.

**Costs / licences:** all brochure/owner's-manual facts above are from openly served OEM PDFs/pages (no purchase). Service-manual *prices* and paywall *terms* were NOT re-verified in this pass (per instruction not to repeat poorly-verified API/price research as fact) — record as `unknown until sourced at purchase time`. Licence: brochure facts cited with URLs are fair-use research notes; any *redistribution* of full PDFs or parts-drawings in-app needs separate clearance (`license-clearance` vs `unverified-terms` kept separate — no full PDFs are bundled in this artifact).

---

## 10. What parent should compare with the sibling (paid-provider) agent

- This artifact proves **tyre+GC(+Thar wading) is obtainable free from OEM primaries** for the pilot 6 (5.5 of 6 fully, Alto GC gap flagged). If the sibling finds a paid provider that *also* lacks exhaust/intake heights (expected), the decision is: **ship OEM-tyre+GC partial now (research-grade) + field-measure heights later** — do not pay for a second copy of the same missing columns.
- If the sibling finds a provider WITH per-trim exhaust/intake heights + sample payloads + India model/year/variant coverage + clear licence, that beats §6 field work on speed — but demand the same per-field provenance (URL/dictionary/payload/checked-date) before any buy decision.
- Either way, **no `2024`-year or `flood-safe-depth` claim enters the app** without the §8 proof pass. The current repo state (35 names, 0 verified spec rows) is replaced by §7's 6 evidence rows — small, real, and explicitly partial — not by another empty typed catalog.

---

*End of artifact. Research-only. No code, backend, accounts, purchases, vendor contact, keys, commits, dependencies, simulators, or nested agents were used. Checked 2026-10-09.*
