# Vehicle spec dataset providers — off-the-shelf options for FloodFlow physical specs

Scope of THIS artifact (split with the sibling OEM-curation agent): **licensable / open /
API datasets and feeds**, not primary OEM brochure curation. The sibling agent owns OEM PDFs.
Evaluated against FloodFlow's three required physical fields:

1. **Tyre size, front / rear / per-trim** (e.g. Swift VXi 165/80R14 vs ZXi 185/65R15)
2. **Ground clearance with laden/unladen basis stated**
3. **Exhaust outlet position AND height above ground** (intake/wading kept separate, optional)

Evidence statuses used throughout: **observed** (field seen in schema/sample) /
**docs-say-missing** / **not-documented** / **access-blocked** / **unknown** (unknown is
NOT absence). All web checks dated **2026-10-09 (UTC)** unless noted. Costs are
current-source-or-unknown; licence clearance is kept separate from unverified terms.
No bulk data was downloaded (small ranged HTTP samples only, nothing retained except
notes below). No accounts created, no vendors contacted, no code changed.

## Recommendation (concise, actionable)

**No single off-the-shelf source covers all three fields. A combination is needed.**
Ranked top 3 real options:

1. **wheel-size.com Wheel Fitment API** — the only candidate with an *observed* per-trim
   front/rear OE tyre schema AND an *observed* India-bearing region (SAM includes India),
   at fixed public prices (Sandbox free → Basic $450/yr → Business $750/yr →
   Premium $2000/yr, billed yearly). Covers field 1. Gaps: ground clearance and exhaust
   fields **not observed** anywhere in its published field list; trim/year precision for
   India models still unverified (sandbox check needed before paying).
2. **Auto-Data.net API (one-call DB)** — the only candidate with an *observed*
   field dictionary containing **Ride height (ground clearance) + Tyre size + Wading
   depth** in one licensable self-hosted file (55,000+ specs, 120+ parameters, daily
   updates claimed). Covers fields 1 and partly 2. Gaps: exhaust height **not observed**
   in field list; India/Asia coverage explicitly weaker ("more than half … European
   cars"); pricing is quote-only (**unknown**); laden/unladen basis **not documented**.
3. **VariantWise open dataset (CC BY 4.0)** — free India-specific variant skeleton:
   **190 models / 1,281 variants as of 2026-10-09**, every row sourced, manufacturer
   wins on conflict, absent-not-guessed policy. Use as the join key (model/trim/variant/
   price), NOT as a specs source: byte-level inspection on check date shows **no
   structured ground-clearance field, no tyre-size string field, no exhaust field**
   (only rim `wheelSizeIn` + L/W/H/wheelbase). Covers "better than names-only"
   structure with a clean commercial licence. Gaps: all three FloodFlow fields still
   need joining from 1 + 2 + OEM curation.

**Exhaust verdict (cross-provider): no off-the-shelf provider was observed exposing
exhaust-outlet position/height as a structured field.** The closest primary instrument
found is EU type-approval paperwork, which asks only for free-text *"Location of the
exhaust outlet"* (§3.2.9.5, Reg 2020/683) — position words, **not** height above ground.
OEM brochures observed (Swift/Creta/Thar) publish no exhaust height either. So field 3
has three honest paths: (a) homologation drawings via ARAI/test-agency access
(**access-blocked** from outside), (b) vendor questions to JATO / TecAlliance /
DriveRight (parent NOT authorized to send — listed as questions, unsent), or
(c) a curated measured field owned by the OEM-curation lane with explicit provenance
per row. **Do not infer safe-crossing depth from ground clearance, photos, or wading
figures** — none of the sources observed warrants that inference.

**Do-not-buy list (with reason):** CarAPI, VehDB, auto.dev are **US-market-only** for
specs — buying them for India models risks export confusion (wrong or missing rows for
India trims). CarQuery's observed schema has **none** of the three fields. Kaggle/GitHub
scrapes are usable at most as cross-check leads, never as the licensed source of truth
(provenance unverified, no laden basis, no exhaust, ToS risk on portal scrapes).

---

## 1. Candidate-by-candidate evidence

### 1.1 wheel-size.com — Wheel Fitment API (tyres: strong; GC/exhaust: absent)

- Docs: https://developer.wheel-size.com/api-data (field list), https://developer.wheel-size.com/docs,
  https://developer.wheel-size.com/api-faqs, https://api-demo.wheel-size.com/api-plans/ (prices).
- **Observed present:** OE tyre + rim sizes per modification; aftermarket/manufacturer-optional
  sizes; load index + speed rating per size; offset (ET); run-flat/XL/HL/steel/winter flags;
  centre bore, thread size, fastener type, torque; OEM front/rear cold pressures in bar+PSI
  ("often varies by load condition and tire size" — pressures vary by load, but no explicit
  laden/unladen basis field was observed). 60,000+ modifications, 200+ makes, 14 regions.
- **Observed India availability:** region list https://developer.wheel-size.com/region-list —
  **SAM (Southeast Asia) explicitly includes India**, alongside 13 other regions. `/search/by_model/`
  takes one region per call, so India fitments are filterable in principle.
- **Ground clearance: not observed** in the published field list (no ride-height/GC attribute).
- **Exhaust outlet position/height: not observed** in the published field list.
- **Motorcycles: not observed** — API is passenger cars + LCVs.
- Pricing (observed, yearly billing via PayPal): Sandbox **free** (testing only, 300 hits/day,
  100/hr); Basic **$450/yr** (5,000/day); Business **$750/yr** (30,000/day + Tiresvote APIs);
  Premium **$2000/yr** (150,000/day); Configurator $1570/yr (+$800 per extra app/site).
  Tailor-made commercial self-host licence offered on request (terms unknown → vendor question).
- Licence/redistribution (observed ToS excerpt): cataloguing endpoints (`/makes/ /models/ /years/
  /generations/ /modifications/`) may be cached locally for SEO; **search endpoints must be
  user-initiated, no crawler calls**. Bulk redistribution beyond that is **not documented** —
  do not assume self-host rights under standard plans.
- Update frequency: release-notes page shows active 2026 schema maintenance (e.g. ISO 4000-1
  rim-width-code change, Sep 2026) — cadence figure itself **unknown**.
- Trim/year precision for Swift 2024 VXi / Creta / Thar in SAM region: **unknown** (sandbox/API
  demo check required; no account created per task constraints). Vendor/sandbox questions:
  confirm 165/80R14 vs 185/65R15 split by Swift trim; Creta 205/65R16 vs 215/60R17 vs 215/55R18
  by trim; Thar 245/75R16 vs 255/65R18.

### 1.2 Auto-Data.net API — one-call technical-specs DB (GC+tyre+wading: present; exhaust: absent)

- Docs: https://api.auto-data.net/ (55,000+ specs, 3,500+ models, 10,000+ generations claimed),
  https://api.auto-data.net/vehicle-api-parameters (120+ parameter dictionary),
  https://api.auto-data.net/documentation, https://api.auto-data.net/get-a-quote,
  https://api.auto-data.net/questions-and-answers.
- **Observed present:** `Ride height` ("Ride height or Ground clearance … distance between the
  ground and the lowest part of the vehicle's chassis or body"), `Tire size`, `Wheel rims
  size`, `Wading depth`, approach/departure/ramp/climb angles. Off-road group and
  drivetrain group are exactly FloodFlow-adjacent.
- **Exhaust outlet position/height: not observed** in the 120+ parameter dictionary.
- **Laden/unladen basis for ride height: not documented** in the observed dictionary text.
- **India coverage: weaker by vendor's own statement** — "More than half of the records …
  are specifications about European cars. We are currently working on expanding … American
  and Asian made vehicles." India-exact trim precision therefore **unknown**; quote form
  allows brand/field selection (quote needed to test Swift/Creta/Thar rows).
- Pricing: **unknown** (quote-only; no public prices observed — not absence of cost).
- Licence (observed, https://api.auto-data.net/terms-and-conditions): two modes — **One-call:
  download + store locally, no realtime use**; **REST: realtime queries only, no permanent
  local storage**. Backend-cost implication: one-call suits a self-hosted CSV snapshot with
  periodic re-download (fresh file each 5h allowed); REST suits live lookup with per-call
  dependency. Redistribution beyond own app: **not documented** → vendor question.
- Updates: "constantly updating … on a daily basis" (vendor claim; independent verification
  not done). Provenance claimed: manufacturers, official dealers, automotive professionals.

### 1.3 TecAlliance / TecDoc (aftermarket parts giant; FloodFlow fields: not observed)

- Docs: https://www.tecalliance.net/products/cards/tecdoc-catalogue,
  https://www.tecalliance.net/solutions/tecdoc (12.8M articles, 1,200+ brands, 260K+ vehicle
  types, 724M linkages claimed), https://shop.tecalliance.net/tecdoc (package list),
  https://www.tecalliance.net/our-customer-contracts-faqs (licence constraints).
- What it is: **replacement-parts identification** (VIN/VRM filter, OE cross-reference, RMI
  repair data, tyre-and-wheel data as a *Garage Data* module). It is parts-linkage data, not
  a consumer spec sheet: **ground-clearance, per-trim OE tyre strings, and exhaust-outlet
  height fields were not observed** in any public schema excerpt (detailed schema is behind
  contract). Status: **unknown (docs gated), not confirmed absent** — vendor question required.
- Motorcycles: reference data explicitly lists "motorcycles" alongside passenger/LCV/truck
  (observed) — 2-wheeler parts coverage exists; whether it carries dimensions is unknown.
- India: country-specific packages exist (e.g. TUR/AUS/Global listed); India pack **not
  observed** → unknown, vendor question.
- Pricing: **unknown** (modular enterprise quotes; no public prices). Licence is restrictive
  by default (observed FAQ: no systematic copying from catalogue web; no post-term retention;
  platform/marketplace use needs prior coordination) — redistribution posture is
  **licence-clearance-required**, not open.
- Ask (unsent): do you expose ride height, OE tyre size per KType, exhaust-part geometry or
  outlet position, India KTypes for Swift/Creta/Thar incl. year splits, and CSV vs web-service
  delivery with update cadence?

### 1.4 JATO (global specs DB incl. India; field-level schema: gated)

- Docs: https://www.jato.com/our-capabilities/specifications (1,000 datapoints/car, 50+ markets),
  https://developer.jato.com/ (JaaS APIs: Index, VINView, Specifications content/options-build/
  compare/incentives), https://developer.jato.com/getting-started.
- **Observed India presence:** JATO's market-coverage table lists **India** with search +
  standard-specifications + options coverage (VIN/VRM fitted-spec columns marked unavailable
  for India in the observed table rendering). JATO India also publishes India tyre/parc analysis
  (observed: https://www.jato.com/resources/news-and-insights/how-indias-suv-boom-is-reshaping-tyre-demand-and-tread-design,
  2026-03-25 — cites 205/55R16, 215/60R16, 215/65R16 growth in India SUV parc).
- FloodFlow fields (GC basis / per-trim tyre strings / exhaust height) inside JATO's
  1,000-attribute taxonomy: **unknown (schema gated behind demo/contract)** — not confirmed
  absent. JATO is the most plausible enterprise answer to "who has India trim-level specs with
  sources," but nothing on exhaust height is publicly documented.
- Pricing/licence: **unknown** (enterprise; no public prices). Redistribution: assume
  licence-clearance-required.
- Ask (unsent): India attribute list incl. ground clearance + basis, tyre size F/R per version,
  exhaust/intake geometry or wading-depth fields, update frequency, API vs feed, commercial
  redistribution for an end-user guidance product.

### 1.5 CarAPI (carapi.app) — US-only; rejected for India use

- Docs: https://carapi.app/features/json-api-specs/ (bodies schema with `ground_clearance`
  in **inches** — observed), https://carapi.app/pricing/, https://carapi.app/pricing/data-feed/.
- **Observed present:** `ground_clearance` (inches, basis unstated; sample shows `"ground_clearance": " 5.7"`,
  often `null` as in the Audi A4 sample), dimensions, weights. **No tyre-size and no exhaust
  fields observed** in the bodies schema.
- **Coverage (docs say so explicitly):** "The API returns vehicle data for cars sold in the
  **United States** since 1900"; "specification and VIN decoding works for the US market and
  most of Canada." **India models/trims are out of scope by vendor statement** — using it for
  Swift/Creta/Thar risks export confusion (e.g. India-specific trims simply absent).
- Pricing (observed): API $199/$249/$299 per year (1,500/3,000/6,000 calls/day; trims+specs
  only on $299 tier); CSV/XLSX datafeed **$599/yr**, updated weekly (vendor statement).
  Free demo dataset covers 2015–2020 only. Licence for redistribution: **not documented** → unknown.
- Verdict: do not buy for FloodFlow's India need; noted only because its inches-based GC
  without basis is exactly the ambiguity FloodFlow must avoid.

### 1.6 VehDB (vehdb.com) — tyres strong, but North America; no GC field observed

- Docs: https://vehdb.com/docs (full reference observed via fetch), https://vehdb.com/vehicle-api,
  https://vehdb.com/tire-sizes-api, https://vehdb.com/vehicle-specs-api, https://vehdb.com/cars-api.
- **Observed present:** 1,342,720+ records claimed; 853,870 cars (make/model/year/trim/body/
  drive/fuel/engine/doors/transmission + EPA + NHTSA recalls joined); **233,450 motorcycles**
  (fields: only `vehicle_type`, `motorcycle_type` — no dimensions observed); **171,100 tyre
  records** with OEM + alternates, computed geometry endpoint (diameter, revs/mile, ±3% delta),
  load-index/speed-symbol service block.
- **Observed absent from car schema:** no ground-clearance, no tyre-size-on-car-record beyond
  cross-reference list, no exhaust fields (field table fetched 2026-10-09 lists engine/body/
  drive/doors/EPA only).
- **Coverage (vendor statement):** tyre data "North America (live) plus Europe and Australia
  (early access)" — **India not listed → India coverage unknown-to-absent; do not assume**.
- Pricing (observed): Free 100 calls/mo; Pro **$19.99/mo** (10k/mo); Developer **$99/mo**
  (100k/mo); Enterprise custom. No card to start.
- Verdict: best-documented cheap tyre API of the set, but wrong geography for FloodFlow v1
  and missing GC/exhaust. Revisit only if they open India coverage.

### 1.7 VehiclesDB (vehiclesdb.com) — identity/resolver, explicitly NOT specs

- Docs: https://vehiclesdb.com/car-api, https://www.vehiclesdb.com/getting-started, https://vehiclesdb.com/.
- Self-description (observed): "the open catalogue of **what vehicles exist**: 14,000+ models
  across 850+ makes and 6 kinds … free forever under **CC-BY 4.0**," plus hosted resolver API.
  Explicit non-goals (observed): "**Trims, engines and full specs per year. CarAPI and other
  spec providers sell that.**" / "We don't decode VINs."
- Value for FloodFlow: canonical make/model IDs across 15 countries' registers + messy-string
  resolver + free CC-BY snapshot — a cleaner *names* layer than 35 hand-listed names, but it
  does not advance any of the three physical fields. (Compare: sibling names layer is 35
  entries; this is 14,000+ model identities — still names, not specs.)
- Pricing (observed): public-key dropdown endpoints 0 credits; private key starts with 100 free
  credits once; then Developer **$49/mo** (50k credits), Business $299/mo, Scale $999/mo.

### 1.8 CarQuery (carqueryapi.com) — free, but schema lacks all three fields

- Docs: https://www.carqueryapi.com/documentation/ (fetch transport-failed on check date from
  this environment — **access-blocked for docs page**; schema reconstructed from observed
  secondary samples), demo http://www.carqueryapi.com/demo/dependant-selects-and-car-data-display/,
  downloads http://www.carqueryapi.com/downloads/.
- Observed schema (via gist sample https://gist.github.com/bboer/7261671 and StackOverflow
  payload https://stackoverflow.com/questions/56399487/parsing-returned-json): engine (cc/cyl/
  power/torque/bore/stroke/compression/fuel), top speed, 0–100, drive, transmission, seats,
  doors, weight, **length/width/height/wheelbase**, fuel capacity, mpg, `model_sold_in_us` flag.
  **No ground-clearance, no tyre-size, no exhaust fields in the observed schema.**
- Coverage: US-centric (`model_sold_in_us`, "Show Only US Models" toggle observed); India-trim
  precision **unknown**, data vintage/staleness **unknown** (max-year selector rendered up to
  2022 in the observed demo snapshot — do NOT repeat as fact; needs a live check).
- Pricing: free no-key API (observed pattern); full DB download sold (price **unknown**).
  Terms must be read before any use (unverified here).
- Verdict: fails all three FloodFlow fields on observed schema; at most a free engine/dimension
  cross-check lead.

### 1.9 VariantWise open dataset — free India skeleton (structure, not specs)

- Home: https://variantwise.com/data (data as of **2026-10-09**; mirrors: GitHub
  https://github.com/kanishkamendevell/variantwise-open-data, Kaggle
  https://www.kaggle.com/datasets/variantwise/indian-cars-every-variant-priced, HuggingFace
  https://huggingface.co/datasets/variantwise/indian-cars-variants). Licence: **CC BY 4.0**,
  commercial OK with credit line "Data: VariantWise, variantwise.com" (observed).
- Scale (observed header): 21 brands, **190 models, 1,281 variants**, road-tax tables for 25
  states/95 cities; per-row source URLs; "absent field = unverified, never zero" policy.
- Byte-level schema inspection (ranged HTTP samples + full-key scan of catalogue.json,
  1,638,706 bytes, check date — file not retained): structured keys observed:
  `lengthMm/widthMm/heightMm/wheelbaseMm/bootLitres/fuelTankL`, suspensions, engines,
  per-trim `features` incl. **`wheelSizeIn`** (rim inches, 704 occurrences — NOT a tyre
  string). **Zero occurrences of `groundClearance`, `tyreSize`/`tireSize`, `wadingDepth`,
  `exhaustHeight` as keys**; the 2 "clearance", 2 "wading", 2 "exhaust", 6 "tyre" hits are all
  inside free-text editorial `positioning` prose (e.g. "223 mm of clearance", "650 mm wading",
  "twin-tip exhaust"), not data. Flat CSV columns (observed header): market…brand/model/
  trim/variant/engine/fuel/transmission/price/source/url — **no GC, no tyre**.
- Concrete gap demo: catalogue's own compare page shows `Ground clearance | -` (absent, not
  guessed) for Jeep Compass — https://variantwise.com/in/compare/jeep-compass-vs-tata-harrier
  (observed) — while Harrier shows 205 mm. Honest absence, but it proves the field is not
  systematically curated here.
- Verdict: adopt as the free, sourced, licensed **variant skeleton to join specs onto**;
  do not mistake it for a specs source. Sourcing effort: near-zero (download + attribute).

### 1.10 Kaggle / GitHub open India car datasets — cross-check leads only

- Observed examples (all metadata-level; full provenance unverified):
  - shreyrmishra "INDIAN CAR DATASET" (CarWale scrape claimed; price/engine/dimensions;
    column list observed has **no GC, no tyre**): https://www.kaggle.com/datasets/shreyrmishra/car-dataset
  - vysakhvms "Cars India Dataset" (156 records, 24 features; **`Tyre Size` column present
    at model level**, no trim split, no basis, no exhaust): https://www.kaggle.com/datasets/vysakhvms/cars-india-dataset
  - tr1gg3rtrash "Cars 2022" (203 cars ex CarDekho; engine/price only, **no GC/tyre**):
    https://www.kaggle.com/datasets/tr1gg3rtrash/cars-2022-dataset
  - medhekarabhinav5 / atharvanilawar Indian-cars datasets (variant-level prices/specs;
    field-level GC/tyre presence **not verified** — unknown): Kaggle search, check date.
  - adarsh1077 "Comprehensive Vehicle Specifications" (claims cars **+ motorcycles** from
    Indian portals, JSON-native; per-field verification **not done** — unknown):
    https://www.kaggle.com/datasets/adarsh1077/comprehensive-vehicle-specifications-dataset
- Common gaps (observed or inferred-from-schema, marked): single `Tyre Size` per model (not
  per trim — fails Swift VXi-vs-ZXi split); no laden/unladen basis; **no exhaust anywhere**;
  scrape provenance (CarWale/CarDekho) carries ToS/reliability risk — licence clearance
  **unknown**, redistribution as product data **not cleared**. Costs: free-to-download but
  curation/verification effort is the real cost, plus staleness (several are 2021–2022 vintages).
- Verdict: use at most to cross-check OEM-curated rows; never as the licensed source of truth.

### 1.11 ARAI / CMVR homologation + Vahan (primary instrument exists; public data: blocked)

- Observed primary instruments: AIS-007 tech-spec format mandates **tyre size/type/speed/load
  per axle (front/rear/spare), rim designation, pressures laden + unladen (driver)** —
  https://law.resource.org/pub/in/bis/ais/arai.in.ais.007.2014.pdf; CMVR TAP Chapter 2
  mandates **tyre dimensions + dynamic rolling circumference + pressures F/R** —
  https://www.araiindia.com/CMVR_TAP_Documents/Part-04/Part-04_Chapter02.pdf; AIS-017 brief
  specs include **size & ply rating F/R + kerb/GVW weights** —
  https://law.resource.org/pub/in/bis/ais/arai.in.ais.017.2008.pdf.
- Certification path: https://www.araiindia.com/certification/certification/vehicle (uploads via
  ARAI CMVR-TAS portal — OEM/test-agency only). Vahan homologation lookup:
  https://vahan.parivahan.gov.in/makermodel/vahan/welcome.xhtml — **no public dataset, API,
  or bulk download observed; direct public record access access-blocked/undocumented**.
- Exhaust: Indian AIS-007 excerpts observed mandate silencer/exhaust-system description fields
  in type-approval paperwork; **exhaust-outlet height above ground was not observed** in the
  excerpts checked. (EU analogue: Reg 2020/683 Annex II §3.2.9.5 requires only free-text
  "Location of the exhaust outlet" — https://www.legislation.gov.uk/eur/2020/683/annex/II/data.xht.)
- Verdict: homologation is the only observed primary instrument that *could* hold per-variant
  tyre + basis data, but there is **no observed public technical dataset or API** — treat as
  access-blocked; any "ARAI dataset" claim encountered later must be verified against this.

### 1.12 DriveRightData (tyre-fitment specialist; FloodFlow-adjacent pressures)

- Docs: https://www.driveright-data.com/vehicle-fitments (150,000+ vehicles claimed; OE +
  optional tyre/wheel fitments F/R pairs; **standard AND laden tyre pressures** — the only
  vendor observed explicitly carrying a laden dimension, for pressures not clearance),
  https://www.driveright-data.com/tyre-product-data (540+ brands, 135,000+ patterns),
  https://www.oneautoapi.com/service/driverightdata-oe-wheel-tyre-fitments/ (sample payload
  with `tyre_size_front/rear`, pressures F/R + laden, run-flat, ET, PCD, TPMS).
- Observed present: per-fitment front/rear tyre + rim + offset + load/speed + pressures incl.
  laden. **Ground clearance, exhaust height: not observed** in public material.
  India coverage: **unknown** (VRM product is Euro-centric; global-fitment claim unverified
  for India) — vendor question. Pricing: per-use via reseller observed (15p/7p/3p GBP tiers
  on One Auto API — reseller pricing, not direct licence; direct terms unknown).
- Verdict: strong tyre-pressure complement to wheel-size.com, but GC/exhaust gaps remain and
  India coverage + direct licence need vendor questions.

### 1.13 auto.dev — evaluated and rejected (US VIN-based)

- Docs: https://docs.auto.dev/v2/products/specifications (sample payload observed: engine/
  measurements/fuel/drivetrain/colors/warranty/safety — **no ground clearance, no tyre size,
  no exhaust** in the observed sample), https://docs.auto.dev/v2/products/vin-decode
  (global VIN decode claimed, but specs endpoint is VIN-keyed and US-listings-anchored:
  https://docs.auto.dev/v2/products/vehicle-listings is US dealers).
- Pricing pointer (secondary, unverified): community skill mirror lists specs at $0.0015/call
  on Growth tier — https://github.com/drivly/auto-dev-skill/blob/main/v2-vin-apis.md —
  **do not repeat as fact**; plans/prices unconfirmed from primary. Verdict: wrong key
  (needs a VIN per vehicle; FloodFlow needs model/trim lookup) + wrong geography emphasis.

---

## 2. India example vehicles — what OEM primary sources actually state (generation proof, not variant proof)

These anchor what "correct" looks like; per-variant curation belongs to the sibling agent.
All three confirm: **brochures publish per-trim tyres and (sometimes basis-stated) GC, but no
exhaust height.**

- **Maruti Swift 2024 (4th-gen, Z12E; "Epic New Swift")**: GC **163 mm (Unladen)** — basis
  explicitly stated; tyres **165/80 R14 (LXi, VXi, VXi(O)) / 185/65 R15 (ZXi, ZXi+)**; spare
  165/80 R14 steel. Sources: https://www.marutisuzuki.com/ (official) and PDF mirrors,
  e.g. https://delen.s3.ap-southeast-1.amazonaws.com/Epic_New_Swift_Brochure_Vertical_a92bbb5a03.pdf.
  This is the VXi-vs-ZXi split that single-value datasets (Kaggle model-level `Tyre Size`) cannot represent.
- **Hyundai Creta (India)**: per-trim tyres **205/65 R16 (E/EX/S) / 215/60 R17 (S(O)/SX…) /
  215/55 R18 (Knight/King …)** with brochure rim-diameter notes; GC **190 mm** in the observed
  brochure table (basis **unstated in the observed excerpt** — record as unknown, not unladen).
  Source: https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/Creta-brochure-new.pdf
  (India-badged PDF). Note: no derivation is offered or needed here (per brief, 215/60R17
  overall diameter is taken as given, not computed).
- **Mahindra Thar (3-door)**: GC **226 mm** (basis unstated in observed table); tyres
  **245/75 R16 / 255/65 R18** (HT RWD / AT 4WD splits); **water wading depth 650 mm**
  (observed — a manufacturer wading claim, NOT an exhaust-height or safe-crossing figure).
  Source: https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dw1a6fc272/brochure/Thar-Brochure-2025-NEW.pdf.
- **Export-confusion warning (substantiated):** US-only datasets (§1.5–1.6, 1.13) cannot supply
  these India trims by vendor statement; wheel-size.com's SAM region is the only API candidate
  observed even claiming an India-bearing region — but whether its SAM Swift row equals the
  India Z12E 2024 trim split is **unknown until sandbox-checked**. Do not treat a same-name
  foreign row as the India row.

## 3. Exhaust-outlet deep search — result: systematic gap

- Searched: provider schemas (§1.1–1.13), homologation templates (§1.11), and web-wide
  "exhaust outlet height/position specification database / homologation / CAD" queries.
- Findings: (a) EU type-approval info document = free-text *"Location of the exhaust outlet"*
  (§3.2.9.5, Reg 2020/683) — **position words, no height**; (b) AIS-007/017 excerpts observed
  mandate exhaust-system descriptions, **no outlet-height-above-ground observed**; (c) OEM
  brochures observed (Swift/Creta/Thar) publish **no exhaust height**; (d) no commercial API,
  open dataset, or homologation dump observed with a structured exhaust-outlet height/position
  field; (e) body-builder CAD portals observed are **truck-only** (Volvo/MAN/SCANIA excerpts —
  irrelevant to passenger cars/2-wheelers, listed to close the lead, not as options).
- Therefore: **no universal "exhaust data doesn't exist" claim is made** (search was bounded;
  gated schemas at JATO/TecDoc/DriveRight remain unknown), but as of check date there is
  **zero observed off-the-shelf structured source** for exhaust-outlet height/position for
  India passenger cars. Wading-depth figures (Thar 650 mm; Auto-Data.net `Wading depth` field)
  must be kept strictly separate — they are manufacturer/field claims about water fording,
  not exhaust geometry, and must never be converted into a "safe crossing" inference.

## 4. Coverage, precision, motorcycle, units, provenance, updates — comparison

| Provider | Vehicle count (source-claimed) | Year/trim precision | India passenger cars | Motorcycles / 2-wheelers | GC field + basis | Tyre F/R per trim | Exhaust H/pos | Units | Update freq (vendor claim) |
|---|---|---|---|---|---|---|---|---|---|
| wheel-size.com API | 60k+ mods, 200+ makes | generation+trim (to verify) | SAM region incl. India (observed) | none observed (cars+LCV) | not observed | **observed** | not observed | mm/bar+PSI | active 2026 changelog; cadence unknown |
| Auto-Data.net | 55k+ specs, 3.5k models | generation/modification | weaker (EU-majority, vendor-stated) | unknown | **field observed; basis not documented** | **observed** | not observed | mm (metric) | daily (vendor claim) |
| TecDoc | 260k+ types, 724M linkages | KType/NType (parts-grade) | unknown (gated) | ref data exists; dims unknown | unknown (gated) | unknown (gated) | unknown (gated) | unknown | weekly/monthly feeds (vendor claim) |
| JATO | 1,800+ models, 50+ markets | version/instance (OEM-grade) | India listed (observed) | unknown | unknown (gated) | unknown (gated) | unknown (gated) | unknown | daily (Carspecs API claim) |
| CarAPI | 90k models / 77k trims US | year/make/model/trim US | **out of scope (vendor-stated US)** | powersports separate | inches, basis unstated | not observed | not observed | inches/lbs | weekly feed (vendor claim) |
| VehDB | 1.34M records; 171k tyre | year/trim (US) | not listed (NA live, EU/AU early) | 233k rows, type-only fields | not observed in schema | **observed (tyre API)** | not observed | mixed imperial | unknown |
| VehiclesDB | 14k+ models identity | production runs (paid) | 15 registers (IN unconfirmed) | kinds incl. mopeds/bikes | n/a (no specs) | n/a | n/a | n/a | versioned snapshots |
| CarQuery | large, vintage unclear | year/make/model/trim | US-centric; IN unknown | unknown | not in observed schema | not in observed schema | not in observed schema | mm+imperial mix | unknown (staleness unconfirmed) |
| VariantWise | 190 models / 1,281 var (IN) | model/trim/variant, sourced | **yes — India-native** | none (cars only) | **absent (verified)** | rim-inch only | absent (verified) | mm, lakh ₹ | build-exported, 2026-10-09 |
| Kaggle/GitHub India | ~150–1,200 rows each | model-level mostly | yes (unverified scrapes) | adarsh1077 claims bikes (unverified) | rare/unstated basis | model-level string at best | none observed | mm (claimed) | stale (2021–22 vintages common) |
| ARAI/Vahan | all homologated (in-principle) | variant-level (in-principle) | yes (in-principle) | yes (in-principle) | basis unknown | mandated F/R in forms | height not observed | mm, kPa | n/a (no public feed observed) |
| DriveRight | 150k+ vehicles (claimed) | variant-level fitments | unknown | unknown | not observed | **observed + laden pressures** | not observed | mm/bar+PSI | unknown |

## 5. Licence, cost, delivery — comparison (facts vs inference kept separate)

| Provider | Cost (observed or unknown) | Licence posture | Self-host CSV vs API backend cost |
|---|---|---|---|
| wheel-size.com | Sandbox free; $450/$750/$2000 per yr (observed) | catalogue-cache OK; search user-initiated only (observed ToS); bulk redistribution not documented | API-first; backend proxies per-user searches (quota math: ~4–5 hits/search ⇒ 5k/day ≈ 1k+ user lookups/day on Basic) |
| Auto-Data.net | **unknown** (quote-only) | one-call = store locally, no realtime; REST = realtime, no local store (observed) | one-call fits self-hosted snapshot + scheduled re-pull; REST needs live backend |
| TecDoc | unknown (enterprise modular) | restrictive default; platform use needs coordination (observed FAQ) | both (data package weekly/quarterly + web service); licence cost dominates |
| JATO | unknown (enterprise) | assume clearance-required | API + feed (JaaS); enterprise integration cost |
| CarAPI | $199–$299/yr API; $599/yr feed (observed) | redistribution not documented | feed = self-host; API = live (1.5k–6k calls/day) |
| VehDB | free–$19.99–$99/mo (observed) | quota-metered; redistribution not documented | API-only (no full dumps; 40-page depth cap, filters required) |
| VehiclesDB | 100 free credits; from $49/mo (observed) | **CC-BY 4.0 snapshot** (observed) — cleanest licence in set | snapshot self-host free; resolver API per-call credits |
| CarQuery | free API observed; DB price unknown | terms unverified — read before use | API free; self-host DB is a paid download |
| VariantWise | **free (CC BY 4.0, incl. commercial)** (observed) | attribution only (observed) | self-host JSON/CSV, zero marginal cost; keep per-row URL credit |
| Kaggle/GitHub | free download | **unknown / ToS-risky** (portal scrapes) — not cleared | self-host, but verification labour is the real cost |
| ARAI/Vahan | unknown (no public product) | government data; access path unknown | n/a — access-blocked |
| DriveRight | reseller per-use seen (15p→3p GBP); direct unknown | licence via contract (unknown) | API or flat file (vendor states both) |

## 6. Sourcing effort estimate (relative, not priced — earlier price/year research was poorly verified and is not repeated)

- Near-zero: VariantWise snapshot (download, attribute, join).
- Days: wheel-size.com sandbox verification (confirm SAM Swift/Creta/Thar trim rows) + plan math.
- Weeks: Auto-Data.net quote + brand/field trial + India-row verification; Kaggle cross-check cleaning if used at all.
- Indeterminate: JATO / TecDoc / DriveRight enterprise discovery (quotes, schema confirmation incl. the exhaust question, India pack confirmation, redistribution clearance) — requires vendor contact the parent is not authorized to send; listed as questions, unsent.
- Blocked from outside: ARAI/Vahan record-level access.

## 7. Evidence audit matrix (observed vs unknown — the anti-absence table)

| Claim | Status | Basis |
|---|---|---|
| wheel-size.com has per-trim F/R OE tyre schema | observed | https://developer.wheel-size.com/api-data |
| wheel-size.com covers India (SAM region) | observed | https://developer.wheel-size.com/region-list |
| wheel-size.com has GC or exhaust fields | not observed in published field list | same page, full-field review 2026-10-09 |
| wheel-size.com SAM Swift/Creta/Thar trim rows correct | unknown | needs sandbox check; no account created |
| Auto-Data.net has GC + tyre + wading fields | observed | https://api.auto-data.net/vehicle-api-parameters |
| Auto-Data.net has exhaust-height field | not observed in 120+ dictionary | same page |
| Auto-Data.net GC laden/unladen basis | not documented | same page |
| Auto-Data.net India trim precision / price | unknown | EU-majority vendor statement; quote-only |
| TecDoc/JATO/DriveRight FloodFlow-field schema | unknown (gated) | public material reviewed; detail behind contract/demo |
| JATO covers India specs | observed (market table) | https://www.jato.com/our-capabilities/specifications |
| CarAPI US-only | vendor-stated | https://carapi.app/pricing/data-feed/ |
| VehDB India coverage | not listed (NA live; EU/AU early) | https://vehdb.com/tire-sizes-api |
| VehDB car schema has GC/exhaust | not observed | https://vehdb.com/docs (fetched) |
| CarQuery schema has GC/tyre/exhaust | not observed | gist + SO payload samples |
| VariantWise has structured GC/tyre/exhaust | verified absent (key scan, 2026-10-09) | catalogue.json 1.64MB key census |
| VariantWise scale/licence/India-native | observed | https://variantwise.com/data |
| Kaggle India sets: per-trim tyre / basis / exhaust | not observed / unknown per set | schema lists in §1.10 |
| ARAI forms mandate F/R tyre + laden/unladen pressures | observed | AIS-007 PDF; TAP Ch.2 PDF |
| Public ARAI/Vahan bulk dataset or API | none observed (access-blocked) | portal review 2026-10-09 |
| Any off-the-shelf structured exhaust-height source | none observed (bounded search) | §3; NOT a claim none exists |
| EU type-approval exhaust field = text position only | observed | Reg 2020/683 Annex II §3.2.9.5 |
| Swift 163mm unladen / per-trim tyres | observed (OEM) | Maruti Suzuki brochure PDFs |
| Creta per-trim tyres; GC 190 basis unstated | observed with basis caveat | Hyundai India brochure PDF |
| Thar GC 226; wading 650; tyres 245/75R16–255/65R18 | observed with basis caveat | Mahindra brochure PDF |
| 215/60R17 overall diameter | taken as given per brief; no derivation offered | n/a |

## 8. Vendor / sandbox questions (NOT sent — parent/user decides; no contact made)

1. wheel-size.com (sandbox, no account yet): SAM-region rows for Swift 2024 (Z12E trims), Creta
   (all 3 rim sizes by trim), Thar (both tyre sizes); GC/exhaust fields on roadmap?; self-host
   commercial licence terms for a consumer guidance product.
2. Auto-Data.net (quote form): India brand pack contents + sample rows for the 3 example cars;
   ride-height measurement basis (laden/unladen/nominal); exhaust fields anywhere; one-call
   redistribution terms.
3. JATO: India attribute dictionary (GC + basis? per-version F/R tyres? exhaust/intake/wading?);
   delivery (API vs feed), update cadence, redistribution for end-user guidance.
4. TecAlliance: India KType coverage for the 3 example cars; exposed attributes (ride height?
   OE tyre per type? exhaust geometry?); data-package vs web-service terms + update cycle.
5. DriveRightData: India fitment coverage; GC/exhaust attributes; direct licence + flat-file
   availability + update cadence.
6. ARAI/Vahan: no question sent (no public channel identified; access path itself unknown).

## 9. What "better than names-only" concretely looks like (payload sketches, real shapes)

- wheel-size.com `/search/by_model/` row shape (observed field vocabulary): vehicle identity
  (make/model/year/generation/trim/region) + `wheel.front/rear.tire_full` (e.g. "215/60R17 96H"),
  `tire_width_mm`, pressures F/R, ET/PCD/bore/torque — i.e. the exact per-trim tyre split
  FloodFlow needs for diameter math, keyed by region (SAM for India).
- Auto-Data.net one-call record shape (observed dictionary): general + engine + performance +
  chassis + **off-road {ride height, wading depth, angles}** + drivetrain {tyre size, rim size}
  — the only single record observed holding fields 1+2 together.
- VariantWise JSON row shape (observed): model {lengthMm…bootLitres} + engines[] + trims[]
  {features incl. wheelSizeIn} + variants[] {price, url} — the join skeleton with clean licence.
- DriveRightData fitment row shape (observed sample): `tyre_size_front/rear`,
  `tyre_pressure_*_bar` + `laden_*`, run-flat, ET min/max, TPMS — the only observed laden-aware
  pressure block (pressures, not clearance — do not conflate).
- Gaps restated: GC-with-basis exists as a *field* only at Auto-Data.net (basis unstated) and
  as *values* only in OEM brochures (basis sometimes stated); exhaust height/position exists
  NOWHERE observed as structured data.

## 10. Method note / limits

- Fresh broad systematic pass (12 candidates + EU/IN homologation templates + 3 OEM brochure
  checks), 2026-10-09 UTC; earlier price/year findings deliberately not repeated as facts.
- Gated schemas (JATO/TecDoc/DriveRight detail, Auto-Data.net sample rows, wheel-size.com SAM
  trim rows) remain the residual unknowns — each has a named next check owned by whoever is
  authorized (sandbox free-tier checks need no vendor contact; quotes/contacts do).
- Generation-level OEM proof only (Swift 4th-gen Z12E 2024; current Creta/Thar brochures);
  exact year×variant proof is the sibling agent's lane.
- No inference from specs/photos to flood-safe depth anywhere in this artifact.
