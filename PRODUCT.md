# FloodFlow

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing Next.js, React, TypeScript, Tailwind CSS 4, Leaflet/React Leaflet, Framer Motion, and Lucide. User approved retaining frontend stack.

## Users

Drivers facing flooded roads. Majority use phones; mobile is the primary experience.

## Product Purpose

Show location on a map, accept a flood photo and vehicle details, and eventually assess flood risk using verified vehicle physical specifications and suggest a route avoiding reported flooding.

## Current contract: waterlogging and navigation

The user expanded the core product to a public waterlogging map and A-to-B navigation. `/map` is accessible without GPS permission, renders all retained server reports, and switches from heatmaps to pingers with zoom. Density and user-observed depth are distinct map modes; missing depth is unknown.

`/report` requests GPS immediately, recenters on the real position, and permits camera evidence only with a fresh bound GPS fix. Reporting locations cannot be searched, clicked or dragged. Denial or unavailable GPS blocks reporting and offers retry. Browser APIs cannot authenticate capture location; provenance is community-reported, not independently verified.

Reports/photos persist on a single-server filesystem development store and are shared between clients on that server. Production AWS storage, identity and moderation still require deployment work. Bedrock and deep CV remain on hold. A-to-B routes use real road geometry; a configured avoidance provider can request rerouting. Vehicle specifications require exact provenance; optional depth preferences are planning choices and never a safe-crossing assessment.

The earlier milestone notes below are historical; this current contract supersedes their manual-location and local-only requirements.

## Historical frontend milestone

- Location first: the homepage shows a compact MapHero intro line plus an
  interactive map immediately, with a single "Use my location" action at the
  top right of the location search toolbar — never an automatic permission
  prompt on load and no separate lower GPS button. Show actual GPS dot and
  accuracy, keep the report pin independent and adjustable. Manual pin
  placement (tap/drag) is available from the start, before any photo. On
  denial allow retry/manual placement; never substitute a fake user
  location. A future provider result moves the pin and recenters the map via
  an explicit selection signal; manual moves never auto-jump.
- Upload from camera/gallery after the location step: JPEG, PNG, WebP, up to
  10 MB; validate and preview the actual file.
- Collect vehicle make/model/year/variant with names-only suggestions from a
  structured local catalog (`src/data/vehicles.json`: stable ids with make
  and model separated). An exact normalized make/model/year/variant lookup
  boundary (`src/lib/vehicle-catalog.ts`) stands ready for future curated
  verified spec rows; the verified row catalog is empty, so tyre size,
  ground clearance, and exhaust position always read "Not available". No
  fuzzy matching, no year/generation guessing, no verified database yet.
- User approved assessment wording "Avoid crossing" and "Unable to assess"; no safe-to-pass assurance.
- Shared photos/reports for everyone are the eventual goal. No fake publishing, analysis, specifications, auth, or routes in the frontend milestone.
- Frontend works without login. Backend-dependent functions show honest unavailable states.
- System light/dark preference controls theme.
- User approved inline homepage map with map and reporting together on one
  phone-first screen; /dashboard and /login redirect to /. No example photo
  in the intro, no "Open map" navigation CTA.
- Header carries brand left and a "Click a photo" camera button right
  (>=44px, fits 320px). Location first: without a report pin the button routes
  to the location step (requesting permission when idle) and the camera opens
  only on an explicit second tap; denial/unavailability shows retry plus manual
  pin before any camera. Replacing a photo from a later step returns to the
  upload phase for coherent validation/preview.
- Reported floods render as a blue density heat overlay (lightweight Leaflet
  canvas layer, deeper blue where reports overlap) with a wave symbol centered
  on each hotspot; tapping a wave opens flood details. GPS stays a dot/white
  ring and the report pin stays distinct from wave hotspots. Shared array is
  empty until a backend data source connects; rendering exists for future real
  reports, no samples seeded.
- Place search runs on the user-approved Photon free prototype lookup
  (no key, browser-direct GET to the public demo service, India-focused via
  the documented `countrycode=IN` parameter, explicit Search submit only —
  never per keystroke). Each result shows locality/city/state/country so
  same-name areas stay distinguishable, and a pick moves the report pin and
  recenters once. Prototype terms, honestly surfaced: reasonable use only,
  ~1.2s spacing between requests, 10s timeout, 10-minute result cache, one
  bounded retry on 429/502/503/504 then a plain manual-try-again message, no
  uptime guarantee. Search credit (Photon + © OpenStreetMap) sits next to
  the field; the map keeps its own OSM attribution. Manual pin placement
  stays fully working meanwhile. Shared reports read
  "Shared reports are not available yet" until a backend connects.
- Muse Spark 1.3 Free, high reasoning, implements; parent reviews and user inspects localhost after completion.

## Brand Commitments

FloodFlow name. Use impeccable and design-taste-frontend skills. Calm, clear, restrained interface with system light/dark themes and phone-first interaction.

## Evidence on Hand

Existing map and flood imagery in public/. Existing vehicle JSON is unverified and must not be presented as a verified specifications database. No validated impact statistics, live sensor counts, photo analysis, or routing service.

## Product Principles

- Show honest uncertainty rather than inventing measurements or assurances.
- Prioritize phone usability and visible map context.
- Ask for location first with an explicit button and support permission failure.
- Keep future shared reporting distinct from the current local preview, which
  is cleared on refresh or close.

## Open Decisions

Backend provider, shared storage/database, real photo-analysis pipeline, authoritative vehicle-specification source, and flood-aware routing integration remain deferred.
