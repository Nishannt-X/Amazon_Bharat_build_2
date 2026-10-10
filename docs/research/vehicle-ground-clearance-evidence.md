# Vehicle Ground-Clearance Evidence — broad OEM/secondary sweep (RESEARCH ONLY, non-production)

**Artifact:** `docs/research/vehicle-ground-clearance-evidence.json` (structured records) + `docs/research/vehicle-ground-clearance-coverage-audit.json` (per-catalog-ID audit, 316 rows) + this file (sources and concise findings).
**Research date:** 2026-10-10 (all web claims checked this date unless noted; round 2 same date).
**Scope:** Ground clearance (mm) + measurement basis for catalog names in `src/data/vehicles.json`. IN market only.
**Ownership:** This task owns ONLY these two files. It does NOT touch `verified-spec-rows.ts`, `vehicle-catalog.ts`/tests, ReportScreen, or `docs/vehicle-coverage.md`.
**Relation to prior work:** Complements `docs/research/vehicle-oem-physical-specs.md` (Swift, Alto K10, Creta, Thar 3-door, Activa 6G-platform, Himalayan 450 — not duplicated here).

## Coverage count (honest)

### Round 1 (prior pass, preserved byte-for-byte below the additions)

- **65 records, 63 distinct catalog ids, 53 ids with sourced numeric values, 11 explicitly unresolved (null).**
- **36 records carry an OEM-class source** (spec page, brochure PDF, press note, or genuine OEM doc via mirror); **29 are secondary-only**.
- **3 records fetch-verified** (Virtus, Kwid, Dominar 400 pages read directly this date); the rest are excerpt-observed and need a fetch/page-image second pass.
- **0 records verified-eligible.** Every record is `candidate — exact-year applicability unresolved`. A brochure date alone is never year proof. Parent integrates only after the second proof pass (dated edition + variant-table image + basis tag).
- **Not complete coverage of 316.** ~63 of ~316 catalog ids have records here; ~6 more in the prior artifact. Everything else is unsearched or unresolved (gap list below).

### Round 2 (this pass, 2026-10-10) — full-catalog sweep

- **327 records total (65 round-1 preserved + 262 added), 316/316 distinct catalog ids represented, 214 ids with sourced numeric values.**
- **Audit: 316/316 catalog ids searched** — `searched-value-found` 213, `searched-no-reliable-value` 90, `conflicting` 13, `source-unreachable` 0. No ids remain unsearched; every audit row names its executed queries (Q1–Q56 keys; legend in audit JSON).
- **OEM-class sources now cover 81 ids** (36 round-1 + 45 new); 235 ids remain secondary-only or unresolved.
- **Fetch checks this pass:** 1 succeeded (Classic 350 page → 170mm OEM, 4th fetch-verified record); 1 failed on transport (Tatamotors Tigor spec page → value rests on search excerpt, marked excerpt-observed); Honda SP125 page confirmed empty-spec-block (prior round).
- **0 records verified-eligible (unchanged).** Exact-year applicability is unresolved for ALL 327 records, including every round-2 addition. Prior unresolved objections stand: excerpt-only basis for most, export/model-edition conflicts documented per record, no flood-safe/exhaust inference anywhere.

## Strongest primary finds (OEM, basis-tagged)

| Catalog id | GC | Basis | Source |
|---|---|---|---|
| Volkswagen Virtus | 179 (laden 145 guard) | unladen (+laden) | VW India brochure PDF + model page (fetch-verified) |
| Renault Kwid | 184 | unladen | Renault 2025 brochure PDF + design page (fetch-verified) |
| Maruti Dzire | 163 | unladen | Maruti Arena Dzire brochure PDF (marutisuzuki.com) |
| Hyundai Exter | 185 | unladen (R&D-testing footnote) | Hyundai India brochure PDF + spec FAQ |
| Tata Punch | 187 (launch note 190±3 kept separate) | unladen | Tata brochure mirrors + tatamotors.com press note |
| Tata Nexon (ICE) | 209 (facelift 208 kept separate) | unladen | Tata product note + Tata portal spec |
| Tata Harrier / Safari | 205 / 205 | unladen | Tata brochure mirrors + portal |
| VW Taigun | 188 | unladen | VW India brochure PDF |
| Renault Kiger / Nissan Magnite | 205 / 205 | unstated | OEM India brochures |
| Bajaj Dominar 400 | 157 | unstated | bajajauto.com specs (fetch-verified) |
| Hero XPulse 200 4V | 220 (Pro 270 separate) | unstated | heromotocorp.com spec pages |
| TVS Apache RTR 200 4V | 180 | unstated | tvsmotor.com spec pages |
| TVS Jupiter 110 | 163 | unstated | tvsmotor.com model page |
| TVS XL100 | 145 Comfort / 150 HD Alloy (variant split) | unstated | tvsmotor.com pages |
| Yamaha FZ-S Fi | 165 | unstated | yamaha-motor-india.com spec block |
| Honda Shine 125 | 162 (+5mm-vs-BS-IV footnote) | unstated | HMSI brochure via mirror |
| RE Meteor 350 | 170 | unstated | royalenfield.com spec PDFs |
| Hyundai i20 / Wagon R | 170 / ~165 | unstated | OEM model-page FAQs |

## Key traps documented (do not repeat)

1. **Laden vs unladen is load-bearing.** Virtus prints BOTH (179/145); Kushaq prints both (188/155). A bare secondary number is never comparable without a basis tag.
2. **Export confusion is real and caught 4 times:** Scorpio-N 187 (IN-sec) vs 227 unladen (AU); XUV700 200 (IN-sec) vs 229 unladen (AU); Seltos 190 (Sudan official, different body); V-Strom 205 (Vietnam); Hunter 150.5 (NZ). Non-IN figures are guard-only counter-examples.
3. **Edition splits, not conflicts:** Punch 187 vs 190±3; Nexon 209 vs 208; Amaze 172 vs 165/170; Fortuner 221 vs 225; Kwid 180 (old) vs 184; Activa 171 vs 162; Himalayan 224 vs 230. Version, never average.
4. **Platform siblings need per-model proof:** Fronx≠Baleno, Glanza≠Baleno, Slavia≠Virtus, Taigun≠Kushaq, Hyryder≠Grand Vitara, Carens/Alcazar≠Creta/Seltos. Sourced independently in this file.
5. **Secondary convergence is still secondary.** Brezza 198, Ertiga 185, Baleno 170, Fronx 190, Grand Vitara 210, Sonet 205, Hycross 185, City 165 all converge but have NO OEM proof yet.

## Unresolved after search (null records — searched, no value claimed)

Venue (IN), Scorpio-N (187/227 conflict), Elevate (220/206 conflict + no OEM number), Kylaq (table truncated), Hector/Astor/Gloster (no GC line in excerpts), 250 Adventure (200/228 secondary conflict), SP 125 (spec block empty), Activa 125 (stale BS4 only), Pulsar 150 (variant scoping).

## Round-2 strongest new primary finds (OEM-class, excerpt-observed unless noted)

- Royal Enfield full house: Classic 350 170 (FETCH-VERIFIED page), Hunter 350 160 (2025 doc; old 150.5 static-sag kept as split), Interceptor/Continental GT 174, Guerrilla 169, Super Meteor 135, Himalayan 450 230 (old 224 split). Bullet 350 CONFLICT (OEM-doc prose 135 vs current 170).
- Bajaj OEM trio: NS200 168, RS200 157, CT110X 170 (owner-manual corroboration for NS/RS).
- Yamaha OEM brochures: MT-15 170, R15 170. Suzuki OEM pages: Access/Avenis 160, V-Strom SX 205 (India page — supersedes VN guard for IN).
- Hero OEM: Karizma XMR 160, Glamour X 170, Xtreme 160R 4V 165 (2V 167 split). TVS OEM: NTORQ 155, RTR 160 180.
- Car OEM docs: Activa 6G 162 (old 171 split), Tigor 170 unladen (fetch failed; excerpt + 2020 note), Sierra 205 (Tata blog), Windsor 186 unladen, BE.6/XEV 9e 207 unladen (battery-height guards kept), EcoSport 200 (Ford India), VF6/VF7 190, KUV100 170 (brochure mirror), Virtus/Taigun/Kushaq-laden re-confirmed via brochure text.
- Honda negative evidence (strong): City Feb-25, Amaze 3rd-gen, Brio, Jazz-manual brochures print full dims with NO GC line — corroborates prior no-OEM-number records. Same for Kia EV6/Carnival/Syros/Sorento/Clavis, Corolla Altis, Yaris/Rumion/Taisor brochures.

## Round-2 new conflicts (status `conflicting`, no value claimed)

Hyryder 208 vs 210; Crysta 176 vs 178; Compass 178 vs 208-unladen (+EU 198 guard); Meridian 214 vs 203; Redi-Go 185 vs 187-unladen; Superb 151-unladen vs 164/149; Alturas 180-laden vs 244; Storme 200 vs 205; EV9 198 vs 193; Tiguan generational 176 vs 200 (two records, split not averaged).

## Round-2 searched-no-reliable-value (90 ids; full per-ID list in audit JSON)

Categories: OEM prints no GC line (Eeco, Jazz/Brio/WR-V/Civic, Corolla, Taisor, Syros/Clavis/Carnival/EV6/Sorento, XUV400-blank, Tiguan-R-Line/Tayron-TBC, Sealion-7-blank, Neo-Plus-N/A); non-IN guards only (Fluence, Koleos, Jetta, T-Roc, Sonata-uncertain, i10-EU, Kona-AU); historic named-but-unobserved (Esteem/Versa/SX4/Kizashi/800/A-Star, Getz/Santro/Terracan, Palio/Uno/Siena/500, Contessa, Cedia/Outlander/Montero, Cielo, Astra/Corsa/Vectra, Cruze/Optra/Trailblazer, Escort, Rapid, Vento, Indigo, XUV400, Scorpio-Classic, XEV-9S, Quanto, NuvoSport, Teana/Tekton, Avenger/Chetak, Passion/Destini/Xoom, Sport, Burgman, RC390, Hornet, BR-V/Mobilio, Vellfire/Hilux/Camry/Prius/Ebella, Grand-Cherokee, VF-MPV-7, Rio, M9/Tomahawks, DTC-bus); single-source-weak values are recorded as values with flags, not nulls (see value records).

## Unsearched gaps — NONE. All 316 catalog ids received first-touch searches across round 1 + round 2 (56 grouped queries Q1–Q56 + direct fetches; legend in audit JSON; 2 early over-broad queries hit rate-limits and were re-run narrower). The round-1 gap list is retired; every family it named was searched this pass (authoritative per-ID status in the audit JSON).

## Unreachable / blocked sources

- `honda2wheelersindia.com` Activa page: 404 (2026-10-09); SP125 page live but serves an empty spec block.
- `cars.tatamotors.com` Tigor spec page: direct fetch failed on transport error (2026-10-10); Tigor 170 rests on search excerpt + 2020 product note.
- Hyundai pages are JS-heavy (nav shell on fetch); i20/Exter values rest on search-excerpt text — brochure-PDF second pass needed.
- Skoda brochure downloads sit behind a lead-gate form; Kylaq/Kushaq via mirrors only.
- No flood-safe depth, exhaust height, or intake inference anywhere in either file.
