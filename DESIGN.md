# DESIGN.md — FloodFlow frontend direction contract

Reading: utility map tool for drivers, calm language. Report and navigation
map pages share the landing page cream, dark ink and amber palette.
Tailwind v4 utilities plus IBM Plex Sans (400/500/600/700) and IBM Plex Mono
(400/500) via next/font. The app map workspace uses this palette regardless of system appearance.

## Current experience

`/` remains the photo-led landing page. Its primary action is **Report a waterlog**, which opens `/report` and requests GPS permission. Its secondary action opens `/map`, which has a browsable waterlogging map and From/To route planner without requesting GPS on load.

Reporting uses a split workspace with a persistent map and concise Capture, Review, On the map panel. There is no large MapHero or manual location phase. Location acquisition is automatic; a status card shows precision, and failed permission offers device settings guidance. Vehicle details and observed depth are optional. Reporting uses a locked GPS pin and a camera capture request. Permission failure offers retry, never remote pin placement. A watched fix no older than five seconds or a newly acquired fix is bound when the photo returns; accuracy/time and community-reported provenance remain visible. Published evidence and sanitized photos persist in SQLite. Success adds the pin and confirmation without leaving the workspace.

Both maps begin over India and keep the user’s deliberate pan/zoom. Six labelled sample incidents illustrate pingers and heat, and are excluded from live route warnings. At low zoom, the map shows report-density heat or observed-depth heat with unknown depth distinguished. At street zoom, photo pingers replace the heat. Route geometry and endpoints remain separate from report markers. On phones, the map appears first and navigation controls follow it; on desktop, controls occupy a scrollable sidebar. Route warnings state missing depth/specification and provider limitations in readable language.

The older interaction specifications below describe the prior milestone. Their manual reporting, GPS opt-in and local-only assumptions are superseded here. Landing design sources remain in `docs/research/landing-design.md`.

## Palette and theme

- Light: ground `#EAF0F6`, surface `#F4F7FB`, raised `#FFFFFF`, text
  `#0E1B2C` / `#46586E`, border `#C4D2E3`, accent `#155FD0` on white
  `#FFFFFF`, soft `#DCE8FA`.
- Dark: ground `#0A1424`, surface `#0F1D33`, raised `#16273F`, text
  `#E8EEF6` / `#9FB0C6`, border `#26394F`, accent `#7AA7F0` on `#081223`,
  soft `#1B3355`. Danger `#A4261F` light / `#F08A80` dark.
- Functional input/control boundaries use a stronger token than decorative
  hairlines (`--border-strong`: `#9DB4CF` light / `#3A5478` dark).
  Body/placeholder text meets 4.5:1; large text meets 3:1.
- Theme follows the OS `prefers-color-scheme` setting and reacts to changes.
  No in-app toggle.
- Map tiles use the agreed OpenStreetMap source in both themes (tile pane dimmed
  via CSS in dark mode, no extra provider). Attribution stays visible in both.
- Text, buttons, inputs, focus rings, and map controls all meet contrast in both themes.

## Shape and type

- Plates and panels use 14–16px radii; small controls pill or 12px. One rule
  everywhere. Shadows carry offset plus soft blur; no halo or hard block shadows.
- IBM Plex Sans for text, IBM Plex Mono (12px, tabular numerals) for
  coordinates and readings. No gradient text, no glow hero, no eyebrow labels
  above headings. No FIELD UNIT-style eyebrows.
- Body/buttons/inputs 16px; helper copy 14px; step tags and coordinates 12px.
  Hero 24–28px on phones, 32px on desktop, two lines max with an accent rule.

## Surfaces

- Home (`/`): interactive reporting map is the page, visible immediately with
  a compact MapHero intro (one short heading plus one short line; the single
  device-local notice lives in the persistent page footnote, not the hero).
  No example photo, no "Open map" CTA anywhere. Header
  holds the brand left (Waves mark plus wordmark) and a "Click a photo" camera
  button right (>=44px touch, fits 320px). The map is full-bleed, never a nested
  card with double margins: at 390x844 roughly 300px of map stays visible above
  the panel, with the location action reachable. Phones get the map first with
  an expandable bottom panel (42–62dvh); desktop gets a sidebar plus generous
  map with no dead hero gap. Touch controls are at least 44px.
  The blue dot is the user location with an accuracy ring; the pin marks
  the flood spot and is draggable. The map legend states this once, and the
  location step carries one manual-pin instruction. Reported floods add a blue density heat wash on a
  lightweight canvas layer (deeper where reports overlap, nothing painted when
  empty — never a decorative whole-map gradient) plus a wave hotspot marker
  per flood (Lucide Waves glyph, deeper blue disc, white ring; tap opens a
  details popup). GPS dot, report pin, and wave hotspot are visually distinct
  and legible in both themes. A generic starting view of India is labelled as
  such. No fabricated reports, routes, depths, or analyses on the map; the map
  states "Shared reports are not available yet" until a backend connects.
  No permanent prototype notice on the homepage.
- `/dashboard` and `/login` redirect to `/`; there is no fake sign-in.

## Workflow contract

Location first (JPEG, PNG, WebP, 10 MB max, decode-checked, previewed, replaceable and removable from later steps, object URLs revoked on replace/remove/failure/unmount only, never stored). Location is requested through the single "Use my location" action at the top right of the location search toolbar, never automatically on load, with single-flight guarding against duplicate permission prompts; manual pin placement works from the start and no separate lower GPS button duplicates the action. Header "Click a photo" never opens the camera first: it routes to the location step until a pin exists, then opens the camera on that tap; one persistent camera/gallery input pair serves every phase. Denial, unavailability, and timeout each show a retry plus manual pin placement. Place search is live on the Photon free prototype (explicit submit only, India-focused, loading/empty/timeout/throttled states with manual retry, Photon + OSM credit by the field); a pick moves the report pin and recenters the map once via the explicit focus signal, distinct from the GPS recenter, while typing, manual drag/click, and GPS fixes   never auto-jump and drop only the stale pick highlight. No invented coordinates. The report pin starts at the GPS fix but stays independent; the pin never moves the blue dot. Each phase keeps one primary action in a dedicated non-scrolling panel footer above the safe area (flex row outside the content scroll area, never an overlay); back/change links stay quiet tertiary. Phase changes move focus to the step heading (tabIndex −1, no scroll jump, no extra live region); a failed vehicle submit focuses the first invalid field, and corrected fields revalidate as they change. A late GPS fix never moves a deliberately placed or search-picked pin (the GPS dot still updates); an invalid photo pick invalidates any pending decode and keeps the last accepted photo. Bold is reserved for headings, action labels, and the load-bearing "Unable to assess" / "Avoid crossing" verdict — form labels use medium weight, and helper, coordinate, and progress copy stays unbolded. The summary uses three compact Location/Photo/Vehicle rows with per-row Edit controls (long content behind native disclosure) instead of a separate edit grid. Vehicle form uses plain labels with inline errors in the danger token plus text and aria (never color alone) fed by a names-only list; tyre size, ground clearance, and exhaust position always read "Not available". Finished reports read "Unable to assess" with "Avoid crossing" safety guidance; sharing and rerouting read as unavailable with no future commitment. One persistent page footnote carries the device-local notice ("Photos stay on this device. Refreshing or closing clears this report."); photo copy keeps the format limits with no "nothing leaves" claim, since place search queries go to Photon.

## Motion and states

- Minimal transitions only. Everything collapses under `prefers-reduced-motion`.
- Loading, empty, error, and success states exist for the photo check, the map load, location request, and form validation. Controls are semantic buttons, labels, and inputs with visible focus.

## Boundary

- `src/lib/report.ts` is the typed frontend boundary (`PhotoState`, `GpsFix`, `VehicleDetails`, `ReportDraft`, plus `FloodReport` for future shared reports and a pointer to the live Photon-backed place-search result shape on `LocationSearchBar`). Device-local only.
- `src/lib/vehicle-catalog.ts` is the vehicle boundary: a structured
  names-only catalog (stable ids, make/model separated, ambiguous names stay
  bare) plus an exact normalized make/model/year/variant lookup for future
  curated verified spec rows with per-field provenance. The verified row
  catalog is empty, so all spec surfaces read "Not available"; suggestions
  never imply specs.
- `src/app/api/bedrock/route.ts` is intentionally unwired from the UI and returns
  a structured 503 assessment-unavailable state with no advisory text.
