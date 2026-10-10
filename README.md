# FloodFlow

FloodFlow introduces its purpose and solution on a landing page, with a phone-first reporting app at `/report`: mark the location on a map, attach a flood photo, and note vehicle details. Completed reports can be added to the map and revisited in this tab. There is no backend yet, so there is no real flood assessment, no shared reports, and no routing.

See [PRODUCT.md](./PRODUCT.md) for product scope and [DESIGN.md](./DESIGN.md) for the visual/UX contract.

## Stack

- Next.js 16.4, React 19.3, TypeScript, Tailwind CSS 4
- Leaflet / React Leaflet with OpenStreetMap tiles
- Place search via the Photon public demo service (no API key, browser-direct, India-filtered with `countrycode=IN`, explicit Search submit only)
- IBM Plex Sans + IBM Plex Mono via `next/font`; theme follows the OS light/dark setting (no in-app toggle)

## Prerequisites

- Node.js `>= 20.9.0` (required by Next.js 16.4 — see `engines` in `node_modules/next/package.json`)
- npm (`package-lock.json` is checked in, so `npm ci` works for a clean install)

## Setup

```bash
npm install   # or: npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production build:

```bash
npm run build
npm run start
```

No environment variables, secrets, or API keys are needed. Photon and OSM are keyless.

## How it works

### 1. Location first (before any photo)

- The reporting page (`/report`) shows the map immediately with a single **Use my location** action in the location search toolbar. Permission is never requested automatically on load.
- Geolocation needs a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): it works on `localhost` and HTTPS, but may be blocked on plain `http://` over the network. On denial, timeout, or unavailability the UI offers retry plus manual pin placement — it never invents a location.
- The **GPS dot** (blue dot + accuracy ring) is your measured position; the **report pin** is the flood spot. The pin starts at the GPS fix but stays independent and draggable — moving the pin never moves the dot, and a late GPS fix never moves a pin you placed deliberately.
- Place search is explicit: type, press Search, pick a result. Each result shows locality/city/state/country so same-name places stay distinguishable. Picking a result moves the report pin and recenters the map once. Typing and dragging do not recenter it. An explicit GPS request can recenter the map, unless you chose a different flood spot while the request was pending.
- Manual pin placement (tap/drag) works from the start, even if search or GPS fails.

### 2. Photo after location

- The header **Click a photo** button routes to the location step until a report pin exists; the camera opens only on an explicit tap once there is a pin.
- Accepted files: JPEG, PNG, WebP, up to 10 MB. Files are decoded and previewed locally; invalid picks are rejected with the last accepted photo kept.
- One camera/gallery input serves every step. Photos can be removed or replaced from later steps.
- Photos stay on the device (object URLs only, revoked on replace/remove/failure/unmount). Nothing is uploaded anywhere — there is no backend to receive them.

### 3. Vehicle details

- Make/model suggestions come from a names-only local catalog (`src/data/vehicles.json`: stable ids with make and model separated, covering the original 5 plus sourced India-current passenger-car names — see `docs/vehicle-coverage.md` for scope and primary sources). Suggestions are names only and imply nothing about specifications. Freeform entry always works for unlisted models; coverage is not claimed complete.
- Exact normalized make/model/year/variant lookup against curated verified spec rows (`src/lib/vehicle-catalog.ts`) is implemented, but the verified row catalog is **empty**, so tyre size, ground clearance, and exhaust position always read **Not available**.
- No fuzzy matching, no year/generation guessing, no exhaust/wading-depth inference, and no photo-based depth analysis. Lookup rejects unverified or ambiguous rows and requires matching market, year, variant, and per-field provenance.

### 4. Verdict and map

- The only verdict wording is **Unable to assess** / **Avoid crossing**. The app never says it is safe to cross.
- **Add report to this map** saves the completed draft in browser memory, adds a wave marker, and starts a fresh draft. A report list lets you select a marker, view its photo/location/vehicle/time, or delete it. Saved photos own separate object URLs, revoked on deletion or page unmount; replacing the draft photo does not break saved photos. These reports are local, not shared, and refresh or leaving `/report` clears them.
- Reported floods render as a blue density heat wash (lightweight Leaflet canvas layer, deeper blue where reports overlap) with a wave marker per hotspot; tapping a wave opens flood details. GPS dot, report pin, and wave hotspots are visually distinct.
- The shared-reports array is empty (`reports={[]}`) until a backend data source connects, and the map says **Shared reports are not available yet**. No sample incidents are seeded. Real flood assessment, shared reporting, and rerouting are unavailable.

## Routes

| Route | Behaviour |
|---|---|
| `/` | Landing page: purpose, reporting experience, and planned capabilities |
| `/report` | The app: map + reporting flow and device-local report list |
| `/design-preview` | Separate visual sandbox; not shared, not assessed, `noindex` |
| `/dashboard`, `/login` | Redirect to `/report` (no sign-in in this milestone) |
| `/api/bedrock` | Deliberately unwired from the UI; returns `503 ASSESSMENT_UNAVAILABLE`, not AI output |

## Commands

All scripts below exist in `package.json`:

```bash
npm run lint           # eslint
npm run build          # next build
npm run test:search    # Photon place-search unit tests (node script, no install)
npm run test:vehicles  # vehicle catalog unit tests (node script, no install)
```

## Manual verification checklist

- Deny location permission: retry + manual pin appear, no fake location.
- Place a manual pin with GPS off; confirm a later GPS fix moves only the dot.
- Submit a place search with Photon unreachable/blocked: plain try-again message, manual pin still works.
- Pick invalid files (wrong type, over 10 MB, corrupt image): rejected, last accepted photo kept.
- Submit the vehicle form empty/invalid: focus moves to the first invalid field; correcting revalidates.
- Check phone widths (down to 320px) and both OS light and dark themes; touch targets stay ≥ 44px.

## Project structure

```
src/app/page.tsx                  # landing page
src/app/report/page.tsx           # map + reporting
src/components/landing/           # scoped landing styles and motion
src/components/LocalReportsList.tsx # selectable device-local reports
src/app/design-preview/           # visual sandbox (page, client, preview map)
src/app/dashboard/page.tsx        # redirects to /report
src/app/login/page.tsx            # redirects to /report
src/app/api/bedrock/route.ts      # unwired; 503 assessment-unavailable
src/components/ReportScreen.tsx   # location → photo → vehicle → verdict flow
src/components/MapComponent.tsx   # Leaflet map, heat canvas, wave hotspots
src/components/LocationSearchBar.tsx  # explicit Photon search UI
src/components/MapHero.tsx        # compact intro line
src/lib/place-search.ts           # Photon adapter (explicit submit, cache, retry)
src/lib/vehicle-catalog.ts        # names catalog + empty verified-spec lookup
src/lib/report.ts                 # typed frontend report boundary (device-local)
src/data/vehicles.json            # vehicle names, names-only (see docs/vehicle-coverage.md)
scripts/run-place-search-tests.mjs
scripts/run-vehicle-catalog-tests.mjs
```

## Privacy: what leaves the device

- The photo never leaves the device (local preview only, no upload target exists).
- These do leave the device: place-search query text goes to the Photon demo service; map tiles load from OpenStreetMap; GPS is handled by the browser geolocation API.

## Limits

- Photon demo service: reasonable use only, ~1.2s spacing between requests, 10s timeout, one bounded retry on 429/502/503/504, 10-minute result cache. No uptime guarantee from the public provider.
- No persistence: refreshing or leaving the reporting page clears the draft and all saved local reports.
- Backend, shared storage, photo analysis, authoritative vehicle-spec source, and flood-aware routing are all deferred. Vehicle names in `src/data/vehicles.json` are names only (see `docs/vehicle-coverage.md`) and must not be seeded as specs without source/scope verification.
