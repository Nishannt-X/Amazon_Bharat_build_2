# FloodFlow

Waterlogging reporting and road-journey planning. The name stays FloodFlow; report actions say **Report a waterlog**.

## Run

Requires Node.js 20.9+ and npm.

```bash
npm ci
npm run db:seed
npm run dev
```

Open http://localhost:3000, browse http://localhost:3000/map, or start reporting at http://localhost:3000/report. Geolocation requires localhost or HTTPS. Opening the public map does not request location permission.

## Reporting

Entering `/report` requests GPS permission and centers the map on the returned position. There is no remote report placement, map-click placement, draggable reporting pin, or place-search reporting. Permission denial, timeout or unavailability blocks submission and offers retry.

The camera input requests capture from the device. A network-assisted fix locates the map while a high-accuracy watch refines it. Approximate fixes remain visible, but photo submission needs accuracy within 100 m. When a photo returns, a watched fix from the last five seconds can bind it; otherwise a fresh fix is requested. Its original timestamp and accuracy are retained. Browser camera/GPS APIs cannot prove capture authenticity or defeat location spoofing; desktop file-picker fallback is not treated as verified evidence.

The flow is Capture → Review → On the map. Vehicle context and measured water depth are optional. Depth is not inferred from the image. Submission saves the photo and metadata in a SQLite transaction, adds a map pin, and shows confirmation on the same screen. Drafts remain device-local until published.

## Public map

`/map` retrieves all retained reports using pagination and refreshes the feed every 15 seconds while visible. Reports remain visible after refresh and across clients using the same server. Zoomed-out views show heat; zoomed-in views show waterlogging markers with evidence details. Unknown depth is never presented as measured water volume. Observation age is separate from current road conditions.

The database is `.data/reports/waterlogs.sqlite`, or `REPORT_STORE_DIR/waterlogs.sqlite` if configured. SQLite WAL transactions store metadata and sanitized JPEG photo BLOBs together. Existing `reports.json` and photo files migrate once; originals remain untouched. It is a **single-server development backend**, not an AWS deployment or a multi-instance database. Do not use ephemeral/serverless filesystem storage for production. AWS deployment requires a DynamoDB/S3 storage adapter, contributor identity/moderation, and an appropriate image publication policy. No AWS services are provisioned by this local backend.

## Sample data and APIs

`npm run db:seed` stores six clearly labelled illustrative incidents in Delhi, Mumbai, Bengaluru and Chennai. Stable IDs prevent duplicate seeds. Their shared demo photo and depths are illustrative; samples are excluded from routing risk checks. The default map stays over India, while GPS acquisition snaps to the device location. Manual zoom and pan remain available.

- `GET /api/health`: database connectivity and community/sample counts.
- `GET /api/reports`: all reports, cursor pagination and optional bbox.
- `POST /api/reports`: validated camera photo, photo-bound GPS, optional vehicle/depth.
- `GET /api/reports/:id`: report detail.
- `GET /api/reports/:id/photo`: sanitized stored JPEG.
- `GET /api/vehicles`: catalog names and sourced specification lookups.
- `POST /api/navigation/route`: road routes checked against community reports.

Uploads enforce bounded body size, image decoding, GPS age/accuracy and location matching. Public writes remain prototype-only; authentication and moderation are required before cloud launch. All reads use the same durable local database across browser clients.

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
