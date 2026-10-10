# FloodFlow

Waterlogging reporting and road-journey planning. The name stays FloodFlow; report actions say **Report a waterlog**.

## Run

Requires Node.js 20.9+ and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000, browse http://localhost:3000/map, or start reporting at http://localhost:3000/report. Geolocation requires localhost or HTTPS. Opening the public map does not request location permission.

## Reporting

Entering `/report` requests GPS permission and centers the map on the returned position. There is no remote report placement, map-click placement, draggable reporting pin, or place-search reporting. Permission denial, timeout or unavailability blocks submission and offers retry.

The camera input requests capture from the device. When the browser returns a photo, a fresh uncached GPS fix is acquired and frozen with its accuracy and timestamp. The reporter confirms the image shows their current location. Browser camera/GPS APIs cannot prove capture authenticity or defeat location spoofing; desktop file-picker fallback is not treated as verified evidence.

Vehicle details and an optional user-observed depth accompany the report. Depth is not inferred from the image. Successful submission stores the report and photo on the server and opens the public map. Drafts remain device-local until published.

## Public map

`/map` retrieves all retained reports using pagination and refreshes the feed every 15 seconds while visible. Reports remain visible after refresh and across clients using the same server. Zoomed-out views show heat; zoomed-in views show waterlogging markers with evidence details. Unknown depth is never presented as measured water volume. Observation age is separate from current road conditions.

The development store uses an ignored `.data` directory, or `REPORT_STORE_DIR` if configured. It is a **single-server development backend**, not an AWS deployment or a multi-instance database. Do not use ephemeral/serverless filesystem storage for production. Cloud deployment requires durable shared storage, contributor identity/moderation, and an appropriate image publication policy.

## Navigation

Choose From and To using place search, select your vehicle, and calculate real road routes. The route engine checks nearby reported waterlogging along whole road segments. Selecting another vehicle or editing endpoints clears the previous result; updated report evidence triggers rechecking.

Without configuration, the public OSRM demo supplies ordinary car-road alternatives. It cannot request waterlogging avoidance. With server-only `OPENROUTESERVICE_API_KEY`, the engine can request road rerouting around prioritized report buffers. Copy `.env.example` to `.env.local` to configure it. Keys never belong in browser code.

The optional avoidance depth is a planning preference, not a verified vehicle capability. Unknown-depth reports retain avoidance priority. Exact verified vehicle specifications can raise concern; missing specifications remain unknown. No route is labelled safe, and no supplied reports does not establish clear roads. Road profiles currently use car access and cannot certify scooter/bus restrictions. Travel times do not include live traffic.

## Stack and checks

Next.js 16.4, React 19.3, TypeScript, Tailwind CSS 4, Leaflet/React Leaflet, OpenStreetMap tiles, Photon place search, OSRM/openrouteservice routing.

```bash
npm run lint
npm run build
npm run test:search
npm run test:vehicles
npm run test:reports
npm run test:navigation
npm run test:shared-reports
```

Bedrock and OpenCV/PyTorch integrations remain on hold. `/api/bedrock` returns an unavailable state. Verified numeric vehicle specifications must have exact model/year/variant/market provenance; AI guesses are not specifications. See PRODUCT.md and DESIGN.md for the current contract.
