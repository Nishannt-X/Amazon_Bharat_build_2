<div align="center">

# 🌊 FloodFlow

**The same road. A different risk for every vehicle.**

**Turn a waterlogged-road photo into evidence, vehicle-aware guidance and a shared map observation.**

[![Live on AWS](https://img.shields.io/badge/Live%20on-AWS-FF9900?style=for-the-badge)](https://d2encysrkrl5pb.cloudfront.net)
[![Heat and Water](https://img.shields.io/badge/Track-Heat%20%26%20Water-237B70?style=for-the-badge)](https://www.wemakedevs.org/aws/env)
[![Next.js](https://img.shields.io/badge/Next.js-16-111827?style=for-the-badge)](package.json)
[![Computer Vision](https://img.shields.io/badge/CV-OpenCV%20%2B%20PyTorch-3178C6?style=for-the-badge)](scripts/cv)

**[Open FloodFlow](https://d2encysrkrl5pb.cloudfront.net) · [Report a waterlog](https://d2encysrkrl5pb.cloudfront.net/report) · [Explore the map](https://d2encysrkrl5pb.cloudfront.net/map)**

Built for **WeMakeDevs × AWS Bharat Builds Tour — Environmental Hacks**

Track 02: Heat and Water · Monsoon waterlogging on Indian roads

[The problem](#the-problem) · [What works today](#what-works-today) · [Architecture](#architecture) · [AWS services](#where-aws-fits) · [Run locally](#run-locally) · [Engineering](#engineering-and-verification)

</div>

---

## The problem

It has rained all afternoon. Your usual road is underwater. A car ahead continues; a scooter stops. A map can tell you where the road is, but not what the water means for **your vehicle**.

Waterlogging changes within a street and over time. A binary “flooded / clear” label loses the details that matter: estimated depth, moving water, hidden road surfaces, vehicle context and how recently someone observed the location.

FloodFlow brings those details together. It combines a citizen's **photo and location**, a **dry-reference comparison**, **computer vision**, and **a short conversation** to document the road and give a more useful next step. Other people can inspect that observation on a shared map and compare journeys against reported waterlogging.

The environmental focus is specific: urban monsoon waterlogging in India. The intended impact is better visibility of affected roads, more informed route choices and useful records of recurring hotspots. Field reductions in damage, travel time or emissions have not been measured.

## What works today

| Capability | What it delivers |
| --- | --- |
| **Photo-first reporting** | A map above the report flow, location acquisition, photo upload and a visible analysis stage. A fresh device-location fix is attached to the report. |
| **Automatic image analysis** | Feature alignment, object/reference candidates, water-region analysis, pixel spans and indicative depth in millimetres when the evidence supports a scale. Detailed annotations can be toggled. |
| **Vehicle-aware guidance** | Model, age and optional trim context; available price, clearance and physical references; colour-coded guidance that changes when the selected vehicle changes. |
| **A conversation when evidence is incomplete** | Separate context chat with English and Hindi, editable voice replies, questions about safely observable conditions and bounded score updates. Text remains available throughout. |
| **Accounts and a garage** | Email/password registration, login and saved vehicles for returning users. Guests can use the reporting experience. |
| **A shared India map** | Location-named observations, a device-position marker, sample incidents and report inspection pages. Nearby observations form a hotspot history with active/past counts. |
| **Journey planning** | Start and destination search, road alternatives, report-exposure checks, vehicle/preferences input and a Google Maps navigation handoff. |
| **AWS deployment** | The web app and CV worker run on ECS Fargate behind CloudFront HTTPS, with S3, DynamoDB, Bedrock and Polly integrations. |

**Review the live experience:** upload a photo on `/report`, inspect its evidence, choose a vehicle and add context. Save the waterlog report, inspect its map pin and open its location history. Use `/map` to explore road alternatives.

Location and microphone access require **HTTPS or localhost**. Your browser may reuse a saved permission instead of showing another prompt. You can browse the map without granting precise location; creating an on-site report needs an acceptable GPS fix.

## Architecture

```mermaid
flowchart TB
    subgraph Clients["1. Client Layer (Desktop & Mobile Commuters)"]
        Citizen["Commuter / Delivery Rider<br/>Photo Upload · GPS Fix · Vehicle Specs"]
        DriverVoice["Hands-Free Voice Input<br/>Hindi & English Spoken Queries"]
    end

    subgraph Edge["2. Global Edge & CDN Layer"]
        CF["Amazon CloudFront<br/>HTTPS (TLS 1.3) · Edge Caching · DDoS Protection"]
    end

    subgraph Ingress["3. VPC Ingress & Load Balancing"]
        ALB["Application Load Balancer (ALB)<br/>X-Floodflow-Origin Token Validation"]
        WebRule{"Path Routing Rule"}
        ALB --> WebRule
    end

    subgraph Compute["4. Container Compute (Amazon ECS on AWS Fargate)"]
        subgraph FargateTask["Fargate Task (2 vCPU · 8 GB RAM)"]
            NextServer["Next.js 16.4 Application<br/>(Port 3000)<br/>UI Pages · Route Handlers · Auth · Clustering"]
            CVService["Python CV Microservice<br/>(Port 8080)<br/>OpenCV · PyTorch · Faster R-CNN"]
            NextServer <-->|"Localhost Loopback IPC<br/>(http://127.0.0.1:8080)"| CVService
        end
    end

    subgraph AIServices["5. AWS Managed AI & Voice Services"]
        Bedrock["Amazon Bedrock<br/>Amazon Nova Lite v1:0<br/>Multimodal Scene Parsing & Bounded Context"]
        Polly["Amazon Polly<br/>Bilingual Neural TTS ('Kajal' Voice)<br/>Hindi & Indian English Audio Advisories"]
    end

    subgraph Storage["6. Persistence & Data Layer"]
        DDB_Live[("Amazon DynamoDB<br/>floodflow_reports<br/>Native 24h Auto-Expiry TTL")]
        DDB_Archive[("Amazon DynamoDB<br/>floodflow_reports_archive<br/>Permanent Incident Store")]
        DDB_State[("Amazon DynamoDB<br/>Accounts · Sessions · Garage · Analyses")]
        S3[("Amazon S3<br/>Encrypted Evidence Bucket<br/>Sanitized Photos & Baseline Imagery")]
        EFS[("Amazon EFS<br/>Encrypted Persistent Storage Mount<br/>/app/.data/reports")]
    end

    subgraph Security["7. Security & Telemetry"]
        Secrets["AWS Secrets Manager<br/>Runtime Environment Secrets"]
        CloudWatch["Amazon CloudWatch<br/>Container Logs & Telemetry Metrics"]
    end

    Citizen --> CF
    DriverVoice --> CF
    CF -->|"Origin Forwarding<br/>X-Floodflow-Origin"| ALB
    WebRule -->|"Default Web Traffic (/)"| NextServer
    WebRule -->|"Direct CV Endpoint (/analyze, /health)"| CVService

    NextServer -->|"Multimodal Reasoning"| Bedrock
    NextServer -->|"Synthesize Audio"| Polly
    NextServer <-->|"Active Live Spots"| DDB_Live
    NextServer <-->|"Historical Archive"| DDB_Archive
    NextServer <-->|"Auth & Garage"| DDB_State
    NextServer <-->|"Store & Retrieve Photos"| S3
    NextServer --- EFS

    Secrets -.->|"IAM Task Role Injection"| FargateTask
    FargateTask -.->|"Log Streams"| CloudWatch

    classDef client fill:#e0f2fe,stroke:#0284c7,color:#0369a1,stroke-width:2px;
    classDef edge fill:#fef3c7,stroke:#d97706,color:#92400e,stroke-width:2px;
    classDef compute fill:#dcfce7,stroke:#16a34a,color:#166534,stroke-width:2px;
    classDef aws fill:#ffedd5,stroke:#ea580c,color:#9a3412,stroke-width:2px;
    classDef storage fill:#ede9fe,stroke:#7c3aed,color:#5b21b6,stroke-width:2px;
    classDef sec fill:#f1f5f9,stroke:#64748b,color:#334155,stroke-width:2px;

    class Citizen,DriverVoice client;
    class CF,ALB edge;
    class NextServer,CVService compute;
    class Bedrock,Polly aws;
    class DDB_Live,DDB_Archive,DDB_State,S3,EFS storage;
    class Secrets,CloudWatch sec;
```

The live deployment uses **one ECS task containing the web and CV containers**. The web container calls the worker over the task's internal network; the worker also has an authenticated cloud endpoint. This keeps Python and model setup off the visitor's device.

Public report metadata and archives use DynamoDB; evidence images use S3. The current application still retains SQLite-backed analysis/session and other server state. **EFS preserves that state across task replacement** while the storage migration continues. This is a single-instance hackathon deployment, not a completed stateless, horizontally scaled backend.

## Where AWS fits

| Service | Responsibility in FloodFlow |
| --- | --- |
| **Amazon ECS + AWS Fargate** | Run the Next.js web runtime and CPU-based CV worker as containers. |
| **Amazon ECR** | Store versioned web and CV images used by the deployment. |
| **Amazon CloudFront + ALB** | Provide the public HTTPS URL and route traffic to the application and worker. |
| **Amazon Bedrock — Nova Lite** | Extract visible scene context, evaluate observation answers and tailor the presentation of vehicle guidance. |
| **Amazon Polly** | Speak context questions in Hindi and English; the current default is the bilingual Kajal neural voice. |
| **Amazon S3** | Store sanitized report photos and associated baseline evidence. |
| **Amazon DynamoDB** | Active reports, report archives, accounts, sessions, garage records and analysis metadata. |
| **Amazon EFS** | Persist the remaining local database and analysis state used by the current runtime. |
| **AWS Secrets Manager + IAM** | Keep provider keys/service tokens server-side and grant the deployed application service access through task roles. |
| **Amazon CloudWatch** | Collect application and worker logs for operational inspection. |
| **AWS CloudFormation** | Provision the deployed networking, compute and hosting resources. |

**Speech input uses Deepgram, not Amazon Transcribe, in the current deployment.** Transcribe code remains an optional adapter; the configured AWS organization blocks that service. Rekognition, SageMaker and Cognito are not part of the active product path.

The DynamoDB configuration separates `floodflow_reports`, `floodflow_reports_archive`, `floodflow_accounts`, `floodflow_sessions`, `floodflow_garage` and `floodflow_analyses`. Community-report activity uses a configurable expiry period. Archived observations remain available for hotspot history; “active” describes the observation's configured lifetime, not a live depth sensor.

## How the evidence engine works

```mermaid
flowchart TD
    PhotoIn["Uploaded Road Photo<br/>(Citizen Mobile Capture)"] --> Sanitize["Exif Stripping & Image Normalization<br/>(Rotation · RGB Decoding · Resizing)"]

    subgraph ParallelEngines["Dual-Engine Analysis Pipeline"]
        subgraph GeometricCV["Engine A: Geometric Computer Vision (Python / OpenCV)"]
            DryRef["Registered Dry Baseline Reference<br/>(Mural Underpass / Delhi Connaught Pl.)"]
            Sanitize --> FeatureMatch["ORB / SIFT Feature Detection & RANSAC<br/>Homography Plane & Facade Alignment"]
            DryRef --> FeatureMatch
            FeatureMatch --> ObjectDetect["Faster R-CNN MobileNetV3<br/>Curb, Tire, Vehicle & Column Candidates"]
            ObjectDetect --> SegmentWater["Waterline Contact & Caliper Boundary Detection"]
            SegmentWater --> MetricDepth["Metric Depth Scaling<br/>Pixel Spans -> Millimeter Range (e.g. 74 mm [12-136 mm])"]
        end

        subgraph MultimodalAI["Engine B: Foundation Model Reasoning (Amazon Bedrock)"]
            Sanitize --> BedrockVision["Amazon Nova Lite Multimodal Vision<br/>Scene Interpretation · Road Type · Flow Velocity"]
            BedrockVision --> HazardEval["Environmental Hazard Extraction<br/>(Submerged Obstacles · Hidden Curbs · Moving Water)"]
        end
    end

    MetricDepth --> ScoreEngine["Standardized Confidence Engine<br/>+30 Base Factor Calibration (Roof: 95%)"]
    ScoreEngine --> EvidenceSnapshot["Unified Evidence Snapshot<br/>Immutable Telemetry Binding (Photo Hash + Depth Range + Confidence)"]
    HazardEval --> EvidenceSnapshot

    classDef input fill:#e0f2fe,stroke:#0284c7,color:#0369a1,stroke-width:2px;
    classDef cv fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:2px;
    classDef ai fill:#fff7ed,stroke:#ea580c,color:#9a3412,stroke-width:2px;
    classDef output fill:#ede9fe,stroke:#7c3aed,color:#5b21b6,stroke-width:2px;

    class PhotoIn,Sanitize input;
    class DryRef,FeatureMatch,ObjectDetect,SegmentWater,MetricDepth,ScoreEngine cv;
    class BedrockVision,HazardEval ai;
    class EvidenceSnapshot output;
```

### Geometry before a recommendation

The Python pipeline uses **ORB/SIFT feature matching and RANSAC homography** to compare the uploaded photo with a dry scene. It distinguishes matching a location's facade from establishing a usable measurement plane: identifying the place alone does not prove that an edge can be transferred accurately between viewpoints.

Optional cached models add **Faster R-CNN MobileNetV3** traffic detections, **Grounding DINO** reference-object proposals and **CLIPSeg** water-region candidates. The pipeline retains caliper spans, reference points, matching inliers, image-quality metrics and processing duration. It does not need to download model weights during an upload.

Two dry demonstration references are bundled: a mural underpass and a Delhi street scene near Connaught Place. Wet-image measurements are computed from the uploaded image. The demo references use assumed reference dimensions where surveyed measurements are unavailable. These are indicative geometric estimates, not surveyed ground truth.

### Dry-reference acquisition

The reference-source design connects the report's **latitude and longitude** to the **[Google Street View Static API](https://developers.google.com/maps/documentation/streetview/overview)**. The backend acquisition layer is designed to:

- Check nearby panorama availability through the [metadata endpoint](https://developers.google.com/maps/documentation/streetview/metadata), retaining the panorama location and capture date when available.
- Request a road-facing static image, with heading, field of view and pitch selected to give the CV engine a useful view of the same scene.
- Check scene correspondence and dry-road suitability before using that image as the comparison reference.

Street View imagery is a reference candidate, not proof that the road is dry or that its viewpoint matches the upload. Registered dry references support the current demonstration and provide a controlled fallback when suitable street imagery is unavailable. API credentials belong to the backend; the image's source and available metadata belong with its analysis provenance.

### Context without overwriting the photo

The **Help in adding context** panel is separate from photo analysis. A person can describe body-level water, visible traffic, flow or road visibility from a safe position. Hindi and English voice replies are transcribed for review before submission; the microphone and playback can be stopped, and typing remains available.

Bedrock receives the photo metrics, previous answers and newest observation. The model evaluates how each observation affects the evidence score, with bounded adjustments and a recorded reason. Failed assessments leave the score unchanged. The original photo snapshot stays separate from later context.

The displayed confidence is an **evidence-quality index**, not a calibrated probability of correct depth or safe passage. See the [scoring implementation](src/lib/photo-analysis.ts) and [context assessment](src/lib/context-assessment.ts).

### Vehicle context, not a universal crossing limit

The catalog covers a broad set of vehicle models, with clearance research coverage for every catalog ID. Coverage means a lookup record exists; it does not mean every model, year and trim has complete verified specifications. Research values, manufacturer references and unknown measurements remain distinguishable.

Screening uses the displayed depth estimate, clearance references, vehicle class and reported hazards. Cars and two-wheelers have different rules; moving water, obscured road surfaces and documented vehicle limits can raise concern. Bedrock can explain the result, while server-side rules constrain metrics and action choices. A deterministic recommendation remains available if inference fails.

```mermaid
flowchart TD
    EvidenceSnapshot["Measured Water Depth Range<br/>(e.g., 250 mm reference · 180–320 mm range)"] --> Matcher["Vehicle Clearance Matching Engine"]
    
    subgraph VehicleSpecs["300+ Indian Vehicle Specifications Catalog"]
        Specs["Physical Vehicle Dimensions<br/>• Ground Clearance (GC mm)<br/>• Air Intake Height (AI mm)<br/>• Exhaust Pipe Height (EP mm)<br/>• Factory Wading Capacity (WC mm)"]
    end
    Specs --> Matcher

    Matcher --> Eval{"Depth vs. Physical Thresholds"}

    Eval -->|"Depth < Ground Clearance<br/>(Submersion safe)"| Safe["🟢 PASS (SAFE)<br/>Clearance ample · Maintain moderate speed"]
    Eval -->|"Ground Clearance <= Depth < Intake/Wading<br/>(Water contacts underbody)"| Caution["🟡 CAUTION (ELEVATED RISK)<br/>Underbody submerged · Proceed with extreme caution"]
    Eval -->|"Depth >= Intake or Wading Limit<br/>(Hydrostatic lock imminent)"| Danger["🔴 DIVERT (DO NOT ATTEMPT)<br/>Air intake submersion risk · Road impassable"]

    Safe --> BedrockAdvice["Amazon Bedrock Explanation & Navigation Guidance"]
    Caution --> BedrockAdvice
    Danger --> BedrockAdvice

    BedrockAdvice --> PollyVoice["Amazon Polly ('Kajal' Voice)<br/>Hands-Free Bilingual Spoken Advisory<br/>(Hindi & English)"]

    classDef snap fill:#ede9fe,stroke:#7c3aed,color:#5b21b6,stroke-width:2px;
    classDef spec fill:#e0f2fe,stroke:#0284c7,color:#0369a1,stroke-width:2px;
    classDef pass fill:#dcfce7,stroke:#16a34a,color:#166534,stroke-width:2px;
    classDef warn fill:#fef3c7,stroke:#d97706,color:#92400e,stroke-width:2px;
    classDef fail fill:#fee2e2,stroke:#dc2626,color:#991b1b,stroke-width:2px;
    classDef voice fill:#ffedd5,stroke:#ea580c,color:#9a3412,stroke-width:2px;

    class EvidenceSnapshot snap;
    class Specs,Matcher spec;
    class Safe pass;
    class Caution warn;
    class Danger fail;
    class BedrockAdvice,PollyVoice voice;
```

Ground clearance is **not** an OEM wading limit. Exact intake, exhaust and electrical exposure are used only when relevant documentation exists; the system does not fill missing physical dimensions with LLM guesses.

## From a report to a journey

```mermaid
flowchart TD
    NewReport["New Community Report Submitted<br/>(Lat, Lng, Photo, Vehicle, Timestamp)"] --> ProximityCheck{"Geospatial Clustering Check<br/>Haversine Distance <= 40 Meters?"}

    ProximityCheck -->|"Within 40m of Existing Spot"| MergeSpot["Merge into Hotspot Pinger<br/>• Increment Spot Reports Count (+1)<br/>• Update Hero Header with ⚡ Latest Badge<br/>• Append Observation to Spot History List"]
    ProximityCheck -->|"Outside 40m Radius"| NewSpot["Spawn New Hotspot Pinger on Map<br/>• Reports at Spot = 1<br/>• Initial Live Status Beacon"]

    MergeSpot --> DualPersistence["Dual-Table Persistence Engine"]
    NewSpot --> DualPersistence

    subgraph DualPersistence["Dual-Table Persistence Engine"]
        WriteLive["Write Active Record<br/>Amazon DynamoDB: floodflow_reports<br/>Set expires_at_epoch = Current Time + 24 Hours"]
        WriteArchive["Write Historical Record<br/>Amazon DynamoDB: floodflow_reports_archive<br/>Permanent record for trend analytics"]
    end

    WriteLive --> TTLWatcher{"Time Elapsed > 24 Hours?"}
    TTLWatcher -->|"No (Within TTL Window)"| LiveMap["Visible on Live Public Map<br/>Marked as 🟢 Live Active"]
    TTLWatcher -->|"Yes (TTL Expired)"| Expired["Native DynamoDB TTL Auto-Purge<br/>Automatically removed from live map<br/>Preserved in Spot History as ⏱️ Past Report"]

    classDef submit fill:#e0f2fe,stroke:#0284c7,color:#0369a1,stroke-width:2px;
    classDef cluster fill:#dcfce7,stroke:#16a34a,color:#166534,stroke-width:2px;
    classDef db fill:#ede9fe,stroke:#7c3aed,color:#5b21b6,stroke-width:2px;
    classDef map fill:#fef3c7,stroke:#d97706,color:#92400e,stroke-width:2px;

    class NewReport submit;
    class MergeSpot,NewSpot cluster;
    class WriteLive,WriteArchive,DualPersistence db;
    class LiveMap,Expired map;
```

A saved observation has a **UUID, coordinates, GPS accuracy, time, photo, vehicle context and associated analysis**. Nearby place lookup names the point. Report pages bring together the latest observation, photo inspection, evidence, vehicle information and location history.

The cloud map groups nearby observations into location-based hotspots. Expired observations move out of active classification while remaining in the archive. Six labelled sample incidents make the map explorable before a user submits a report.

Route assessment checks eligible, non-sample reports near entire road segments. It compares exposure across alternatives rather than relying on sparse route vertices. OSRM supplies public driving alternatives; an optional openrouteservice key enables requests with avoidance polygons. The route panel can hand a selected journey to Google Maps.

The route handler excludes samples and records marked pending. The current cloud feed exposes saved observations immediately and normalizes their public status; independent publication moderation remains an engineering priority. A route with no supplied reports is not proof of a clear road, and a public pin is not independent verification of its conditions.

## Run locally

**Recommended:** Node.js 22, npm and Python 3.10+ for local CV. AWS credentials are needed for cloud integrations, not for browsing the local UI and seeded map.

```bash
git clone https://github.com/Nishannt-X/Amazon_Bharat_build_2.git
cd Amazon_Bharat_build_2
npm ci

# Preserve any existing private configuration.
test -f .env.local || cp .env.example .env.local

npm run db:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000), [/report](http://localhost:3000/report) or [/map](http://localhost:3000/map). The seed script adds six sample incidents without duplicating them on repeated runs.

### Prepare computer vision

```bash
python3 -m venv .venv-cv
.venv-cv/bin/python -m pip install -r scripts/cv/requirements.txt
.venv-cv/bin/python -m pip install -r scripts/cv/requirements-references.txt

# One-time downloads; models are cached before the first analysis.
.venv-cv/bin/python scripts/cv/prepare_detector.py
.venv-cv/bin/python scripts/cv/prepare_references.py
.venv-cv/bin/python scripts/cv/prepare_water_model.py

CV_PYTHON="$PWD/.venv-cv/bin/python" \
CV_REFERENCE_PYTHON="$PWD/.venv-cv/bin/python" \
npm run dev
```

Use **your own interpreter path**. A copied path to another developer's machine will not work. The minimal OpenCV install supports base image geometry; the optional model dependencies add semantic and water-region analysis.

The deployed application uses the cloud worker. The local-first/cloud-fallback integration is part of the deployment work; cloud service settings and deployment artifacts must be configured separately from a plain local checkout.

### Configure integrations

Keep secrets in `.env.local` locally and in the deployed secret configuration on AWS. Never prefix server credentials with `NEXT_PUBLIC_`.

| Setting | Purpose |
| --- | --- |
| `AWS_REGION` | Service region; the current deployment uses `ap-southeast-2`. |
| AWS credentials / deployed task role | Access to the configured AWS services. Prefer task roles in deployment. |
| `S3_EVIDENCE_BUCKET`, `S3_REGION` | Evidence storage. |
| `DYNAMODB_*_TABLE` | Names of the existing report, archive, account, session, garage and analysis tables. |
| `BEDROCK_VISION_MODEL_ID` | Scene extraction, currently `amazon.nova-lite-v1:0`. |
| `BEDROCK_RECOMMENDATION_MODEL_ID` | Model used for context and vehicle guidance. |
| `DEEPGRAM_API_KEY` | Server-only Hindi/English voice transcription. |
| `POLLY_VOICE_ID`, `POLLY_SPEECH_RATE` | Speech voice and playback rate; the default voice is Kajal and the rate is configurable. |
| `CV_PYTHON`, `CV_REFERENCE_PYTHON` | Local Python interpreters for geometry and optional reference inference. |
| `OPENROUTESERVICE_API_KEY` | Optional road-routing avoidance support. |
| `REPORT_TTL_HOURS`, `CLUSTER_RADIUS_METERS` | Active-report lifetime and proximity grouping. |
| `REPORT_STORE_DIR` | Writable location for the remaining server-side stores. |

`env.cache` is private deployment metadata and is excluded from Git and container build context. It is not a replacement for a complete AWS deployment configuration. See [voice setup](docs/voice-setup.md) for provider details.

## Engineering and verification

```bash
npx tsc --noEmit
npm run lint
npm run build

npm run test:analysis
npm run test:features
npm run test:shared-reports
npm run test:reports
npm run test:vehicles
npm run test:navigation
npm run test:geolocation
npm run test:recenter
node scripts/run-context-tests.mjs
node scripts/run-voice-tests.mjs
```

Tests cover geometry and calibration inputs, evidence preservation, context boundaries, account/garage isolation, report ownership, vehicle references, report grouping, route exposure, GPS handling and map lifecycle behavior. They verify software rules; they are not a field accuracy benchmark.

Important implementation boundaries:

- **Uploads are decoded and re-encoded.** MIME labels alone are not trusted; photo processing is bounded and saved images lose embedded EXIF metadata.
- **Analysis belongs to a session and photo.** Report creation checks ownership and the uploaded photo's hash against the selected analysis.
- **Photo evidence and context are separate.** Follow-up answers do not replace the original photo-only snapshot.
- **External AI output is constrained.** Confidence deltas are bounded; vehicle metrics and permitted actions remain server-owned.
- **Secrets stay server-side.** Voice-provider keys and worker tokens do not enter the browser bundle.
- **State survives task replacement.** The deployment preserves remaining server state on EFS; existing S3/DynamoDB resources are not recreated for a web release.

The live homepage, report/map/login pages, CV health endpoint and report feed were checked over HTTPS on **12 October 2026**. Deployment health can be inspected at [/api/health](https://d2encysrkrl5pb.cloudfront.net/api/health). Individual cloud inference and routing availability still depend on provider access and service conditions.

## Built for the judging criteria

The [official rubric](https://www.wemakedevs.org/aws/env#judging) prioritizes impact, AWS use, usability, execution and a recorded three-minute demonstration.

| Criterion | Evidence to review |
| --- | --- |
| **Idea and impact** | A concrete Heat and Water problem: Indian monsoon waterlogging, with vehicle context and recurring hotspot observations. |
| **Built on AWS** | A public CloudFront URL, ECS-hosted web/CV runtime, S3/DynamoDB persistence, Bedrock context and Polly speech. |
| **Design and usability** | A map-led, photo-first report experience; a separate context conversation; Hindi/English voice with text fallback; reusable saved vehicles. |
| **Execution** | Running report/map pages, image measurements, vehicle-specific screening, persistence and report history, supported by focused tests. |
| **Demo video** | A three-minute walkthrough can show one upload, its evidence, two vehicle selections, added context and the resulting map observation, with AWS responsibilities visible. |

The next engineering priorities are surveyed reference data, field validation across viewpoints and water conditions, stronger publication moderation, and completion of the stateless storage migration. Broader vehicle documentation and reliable production routing will improve coverage without turning unknown values into invented facts.

## Repository guide

| Path | Responsibility |
| --- | --- |
| [`src/app`](src/app) | Landing, report, map, account and inspection pages; backend route handlers. |
| [`src/components`](src/components) | Map, photo overlay, context conversation, vehicle panel and navigation UI. |
| [`src/lib/analysis-engine.ts`](src/lib/analysis-engine.ts) | Photo processing and CV/Bedrock orchestration. |
| [`src/lib/photo-analysis.ts`](src/lib/photo-analysis.ts) | Measurements, confidence rules, comparison records and evidence provenance. |
| [`src/lib/context-assessment.ts`](src/lib/context-assessment.ts) | Per-answer model assessment and bounded progressive scoring. |
| [`src/lib/vehicle-recommendations.ts`](src/lib/vehicle-recommendations.ts) | Vehicle screening, constrained cloud output and deterministic fallback. |
| [`src/lib/aws`](src/lib/aws) | AWS adapters and cloud report/account/garage operations. |
| [`src/lib/analysis-voice.ts`](src/lib/analysis-voice.ts) · [`src/lib/deepgram-voice.ts`](src/lib/deepgram-voice.ts) | Speech output and transcription adapters. |
| [`src/lib/navigation.ts`](src/lib/navigation.ts) · [`src/lib/navigation-provider.ts`](src/lib/navigation-provider.ts) | Road-route exposure checks and provider integration. |
| [`src/data`](src/data) | Vehicle names, clearance research and physical/OEM evidence. |
| [`scripts/cv`](scripts/cv) | Registration, traffic detection, reference objects, water segmentation and model preparation. |
| [`public/demo`](public/demo) | Bundled demonstration reference assets. |
| [`terraform`](terraform) | Storage/IAM provisioning definitions; separate from the live hosting stack. |

Further reading: [CV design and research](PHOTO_ANALYSIS.md) · [Ground-clearance evidence](docs/research/vehicle-ground-clearance-evidence.md) · [OEM physical references](docs/research/vehicle-oem-physical-specs.md) · [Voice integration](docs/voice-setup.md).
