# Photo analysis demo and service setup

Open `/report`, upload the wet mural-underpass screenshot, and wait for the overlay. Dry screenshots are registered in `src/lib/demo-baselines.ts`: the mural underpass (`public/demo/dry-underpass.png`) and the user-labelled highway (`public/demo/dry-highway-delhi.png`, user-supplied coordinates 28.63470286, 77.22210794). Both are **demo references**, not geographically validated baselines. Fresh CV checks both and selects the best registered match. The highway never borrows the underpass’s 250 mm assumption. A live learned water mask and wet-image wheel geometry can produce an explicitly assumed reference-prior depth estimate; surveyed metric depth remains unverified.

## What runs now

- Each upload runs fresh computation. Only dry demo photos ship with the app; no flooded photo or precomputed result is bundled.
- Node validates and decodes the photo, strips EXIF, and runs bounded Python/OpenCV work. The overlay receives streamed processing stages; result tables show `Calculating…` until the final result arrives.
- After continuing as a guest or signing in, photo metrics appear in the left card. The larger right card holds model/age inputs and displays fetched vehicle references after both fields are entered.
- ORB descriptors, ratio matching, RANSAC homography, inlier checks, and geometry sanity checks align the dry image to the uploaded image. A match aligns a scene plane; it is not a 3D reconstruction.
- Canny/Hough measurements find structural edge spans and foreground upright reference candidates. Local dry/wet changes suggest candidate submersion boundaries. These candidates remain unclassified and require review.
- OpenCV HOG detects pedestrian candidates. Vehicle make/model detection is not provided by this detector.
- The overlay starts with one primary reference (R1), its dry span, candidate submerged span, and assumed pixel-to-mm calculation. **Show all details** reveals the other references, structural edges, waterline candidates and pedestrian boxes. A dry baseline canvas remains visible beneath the upload.
- The overlay displays pixel spans, reference candidates annotated directly on the uploaded photo, registration statistics, processing time, image sharpness/brightness, depth/range, evidence quality, road/traffic context, and an experimental environmental score.
- For the mural-underpass demo only, when a matched foreground candidate has a usable image-change boundary, an automatic **illustrative demo estimate** uses the prototype’s explicit 250 mm assumption and a broad heuristic range. It does not verify object identity or water segmentation. No fixed water-depth result is coded. Reference selection is handled automatically; the reporting flow does not ask users to supply calibration or a baseline. Research-only reviewed caliper input remains supported by the backend, outside this flow. The assumed 250 mm height is displayed prominently; it is not a universal Indian infrastructure standard. The displayed ±20% + 10 mm range is heuristic, not a validated accuracy interval.
- The photo-analysis overlay evaluates only photo evidence. A separate small chat opens from **Help in adding context** below the left evidence card. Text answers persist per analysis; closing/reopening restores history. Voice remains available through configured Transcribe/Polly adapters. The original photo-only result remains separate from the report’s added observations.
- The optional deterministic follow-up assistant asks about body-relative water level, height, traffic/bus observations, road type, moving water, and drains. Body-reference answers yield an explicit broad estimate, never calibrated CV depth. Image sharpness, exposure, registration/inlier quality and reference type contribute to the experimental evidence index. Specific answers contribute at most +10 to a separate combined evidence index, capped at 74. The original photo index remains visible and immutable in the photo snapshot. Unknown answers contribute zero; conflicting depth or water-motion observations contribute zero and cap contextual confidence at 25. Neither combined confidence nor self-reported body depth can promote publication. These numbers are experimental evidence-quality indices, not calibrated accuracy probabilities.
- Risk score is an experimental **environmental screening index**: upper estimated depth in mm / 5, plus 10 for an underpass, 15 for observed moving water, and 10 for an obscured road surface, capped at 100. It is not a vehicle-specific safe-crossing verdict, calibrated loss probability, or medical/financial estimate. Vehicle intake, exhaust and wading specifications remain necessary for personalized assessment.

## Persistence and publication

`.data/reports/analyses.sqlite` stores sanitized evidence photos, aligned baseline, results and answers. `.data/reports/waterlogs.sqlite` stores the final GPS-bound photo report and analysis snapshot. Both are local server databases and need durable storage when deploying.

Each new analysis stores a versioned comparison: baseline ID/hash, source label/image/location, nullable reference height and scale basis, normalized dry/water points, pixel spans, mm-per-pixel values and projected lengths. An immutable `photo_result` snapshot survives chat edits. Each saved incident copies that snapshot, the updated contextual result, risk guidance and the aligned dry JPEG into its own report record. Later analysis edits do not change the incident’s comparison. Legacy analyses with existing answers cannot retroactively recover an original photo-only snapshot.

Guidance colors describe observed environmental evidence: amber for uncertain/elevated results, red for severe evidence or observed moving water, green only for eligible lower-risk evidence with clear road visibility, stationary water and no reported hazards. Green does not certify safe crossing or verified vehicle suitability.

An HttpOnly anonymous-session cookie scopes analysis reads and edits. Final report submission verifies the exact uploaded photo's SHA-256 hash and analysis ownership. Pending reports, details and photos are omitted from the global map and inaccessible to other sessions. Existing sample and legacy reports remain visible.

Eligibility requires confidence >= 75, a depth estimate, and a registered real baseline. All current demo-baseline estimates stay pending even if another provider claims high confidence. This prevents a synthetic demo from becoming a real incident. The backend can promote a fresh cohort of at least three distinct browser sessions **and distinct photos** within 25 m, GPS accuracy <=20 m, one hour, overlapping depth ranges and centres within 30% (or 20 mm). Only reviewed calipers from registered real references at evidence confidence >=50 qualify; demo references never qualify. Guest sessions are not verified identities. A tested segmentation/depth model, registered physical reference catalog and confidence calibration are **future work**; the demo does not invent those guarantees.

## Local runtime

```sh
python3 -m pip install -r scripts/cv/requirements.txt
npm install
npm run dev -- --hostname 0.0.0.0
```

Set `CV_PYTHON` to the Python interpreter with those packages. CV is already available on the current machine. A missing interpreter/model or failed registration retains the photo and opens the follow-up flow rather than manufacturing a depth.

## AWS adapters (implemented, not cloud-verified yet)

Use the server-side AWS SDK credential chain: an AWS profile locally or an IAM role when deployed. Do not put credentials in browser variables or source control. `.env.example` lists non-secret service settings.

- `AWS_REGION`: chosen AWS region.
- `BEDROCK_VISION_MODEL_ID`: a supported multimodal model/inference profile available in that region. Uses Bedrock Converse for bounded JSON **scene evidence**. It does not estimate millimetres or supply a publication confidence probability. Failed output retains CV results.
- `BEDROCK_RECOMMENDATION_MODEL_ID`: optional Converse-compatible model/inference profile. The server computes vehicle-specific facts, environmental risk and permitted actions from its persisted analysis/catalog. Bedrock may only prioritize those bounded actions, keeping the avoidance action first. Output validation rejects extra fields, new measurements, confidence or invented advice; errors/timeouts use the tailored deterministic fallback. Provider state is shown in the recommendation. This adapter prioritizes server-authored advice; it does not generate new Claude/LLM prose or provide an AI diagnosis. Richer AI recommendations/chat remain future enhancement behind equivalent factual and safety validation. Credentials have not been cloud-tested.
- `TRANSCRIBE_BUCKET`: private S3 bucket. The backend uploads max 3 MB / 30-second browser recordings, starts an English India batch transcription, and reads output through S3. The browser polls for up to 60 seconds, presents the transcript for review, then sends the answer. IAM actions: `s3:PutObject`, `s3:GetObject` on `voice/*` and `transcripts/*`; `transcribe:StartTranscriptionJob`, `transcribe:GetTranscriptionJob`.
- `POLLY_ENABLED=true`, `POLLY_VOICE_ID=Aditi`: question audio via `polly:SynthesizeSpeech`. Choose a voice/engine supported in the configured region. Buttons are disabled while services are unconfigured.
- Bedrock needs `bedrock:InvokeModel` for the configured model/inference profile. No services or credentials have been provisioned by this implementation.
- Configure S3 lifecycle removal for voice recordings/transcripts, AWS budget alerts, and deployment-level per-client throttling before a public launch. Local request limits and SDK timeouts are not a global spending cap. SQLite/Python deployment requires a persistent Node/container host; Lambda/Amplify deployment needs separate durable-store and CV-worker adapters.

Official references: [Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html), [Transcribe jobs](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html), [Polly speech](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html).

## Endpoints and checks

- `POST /api/analysis`: uploaded photo -> persisted CV/optional Bedrock result; Accept: application/x-ndjson streams progress and the final result.
- `GET /api/analysis`: configured provider capabilities.
- `GET /api/analysis/:id`, `/baseline`: owner-only result/aligned baseline.
- `POST /api/analysis/:id/answers`: follow-up answer or reviewed reference caliper.
- `POST /api/analysis/voice`, `GET ...?jobId=`: owner-scoped audio job.
- `POST /api/analysis/speech`: bounded question audio.
- `POST /api/reports`: GPS-bound evidence snapshot; publication gate enforced on the server.
- `GET /api/reports/:id/baseline`: frozen incident-specific dry image, subject to the same pending-report ownership check as the report photo.

`npm run test:analysis` tests geometry, uncertainty, body-reference extraction and threshold handling. `npm run test:shared-reports` tests durable storage, exact-photo/session binding and pending-report access controls using isolated temporary databases.

## Accounts, garage and researched catalog

Email/password registration and login run at `/login` and in the report access gate. Passwords use asynchronous scrypt with a random 32-byte salt and 64-byte derived hash; plaintext passwords never enter SQLite, response JSON or logs. Random session tokens are stored only as SHA-256 digests, expire after seven days and use HttpOnly/SameSite=Strict cookies (Secure on HTTPS). Logout revokes the current server session. Mutations require a matching browser Origin/Host; persistent SQLite attempt limits cover email credentials, account-service traffic, garage writes and recommendation calls. Preserve the original Host and trusted X-Forwarded-Proto at the reverse proxy and serve the deployed site over HTTPS.

`.data/reports/accounts.sqlite` stores account/session/garage ownership. Garage rows contain catalog model ID, model year and optional trim. A successful login claims only the guest evidence cookie presented on that request; account analysis and private reports then belong to the authenticated account. The old guest cookie is removed so logout cannot fall back to account evidence. Account IDs are rejected as anonymous evidence-cookie credentials; only a valid server session can access account-owned records. Signing in rotates and revokes the prior browser session. All pending photos, baselines and recommendations use the same server ownership checks. Returning users select their own cars immediately; reselecting a car or adding context cancels stale UI requests and recalculates advice. Guest reporting remains available.

Email addresses are **not verified**. Delivery, verification, password-reset emails and cloud identity are unconfigured future setup. Implement verified delivery/reset tokens with expiry or replace the adapter with a configured Cognito/cloud identity service before claiming verified email identity. No secrets are needed for local email/password login. AI conversation enhancement remains future work: deterministic follow-up parsing currently persists explicit observations, while the existing Bedrock scene adapter and bounded recommendation adapter are optional.

`.data/reports/vehicles.sqlite` is seeded transactionally by a versioned migration from the checked-in name/research catalog and `src/data/vehicle-oem-references.json`. It contains 316 mixed vehicle names (the UI filters passenger cars), existing sourced but unverified clearance research, and a limited set of 14 independently checked OEM new-car price benchmarks. Four of those OEM records contain clearance references and one contains a historical OEM wading reference. Prices are dated starting ex-showroom benchmarks in INR, including explicitly labelled historical launches; they are never age-based resale estimates. Non-null fields keep direct source URL, retrieved date, original scope/year/trim when known, units and measurement basis. Unknown intake/exhaust and unsupported wading stay null. Exact owner-year/trim verification remains unavailable; research coverage does not mean every model’s specifications or prices have been verified.

`GET /api/vehicles` reads SQLite catalog/reference rows. `GET/POST/DELETE /api/account` covers session, registration/login/logout; `GET/POST /api/garage` reads/adds only the signed-in account’s cars. `POST /api/recommendations` accepts only the analysis ID and selected car; the server loads trusted measurements and sourced references instead of trusting client-supplied metrics. `npm run test:features` checks credentials/sessions/expiry/ownership, guest claiming, catalog seeding/provenance, recommendation reselection/cloud failure, and bounded contextual confidence with immutable raw snapshots.

## Cropped viewpoints and missing dry anchors

The engine now tries ORB first and SIFT when full registration fails. A supported cluster of facade correspondences can recognize a cropped scene without pretending that the road plane is registered. Inlier counts, supported image area and median reprojection residual are stored with each analysis. Full-image homography remains the requirement for the original demo calipers; partial scene identity alone never authorizes metric depth.

Dry-image upright-edge candidates are inventoried independently of wet visibility. Each receives a persisted reason: outside overlap, unsupported measurement plane, hidden or changed, visible but unscaled, or scene not matched. Missing edges do not prove submersion: vehicles, crop, viewpoint, lighting and water can all hide an edge. Building-plane correspondence must not be transferred to a foreground curb affected by parallax.

When cached TorchVision weights exist, Faster R-CNN MobileNetV3 COCO identifies people, cars, motorcycles, buses, trucks and bicycles. The model is an optional semantic detector, not a water-segmentation or tire-size model. Hough circles within vehicle regions supply labelled **wheel candidates** with pixel diameters; they may represent a rim rather than a tire and do not supply a known real-world diameter or confirmed waterline. Compact results show one fallback wheel candidate; Show all details expands the rest. All these diagnostics are included in the existing persisted analysis/report snapshots.

Install optional detector dependencies with `python3 -m pip install -r scripts/cv/requirements-detector.txt`, then explicitly run `python3 scripts/cv/prepare_detector.py`. Uploads never download weights. Missing optional weights retain OpenCV results and a clear detector status. The current local environment already contains the prototype's cached model.

For the new Delhi highway wet example, static facade matching succeeds and local traffic is detected. The dry curb's measurement plane is unsupported by the facade match. Its physical height is also unsurveyed. Therefore metric depth stays unknown rather than borrowing the underpass's 250 mm assumption. A fully submerged, independently confirmed known-height reference could establish a **lower bound**; it cannot establish exact depth. That requires a surveyed reference on the correct plane plus a verified water boundary, a validated depth/segmentation pipeline, or independent sensor evidence. Current code does not claim those missing validations.

Regression checks: `python3 scripts/cv/test_cv.py` covers hidden references, plane mismatch, out-of-frame crop, visible unscaled anchors and unrelated scenes. The supplied wet highway image and original wet underpass are evaluated live during integration checks; wet demo assets remain outside the repository.

Primary technical references: [OpenCV feature matching and homography](https://docs.opencv.org/4.12.0/d1/de0/tutorial_py_feature_homography.html), [planar homography limits](https://docs.opencv.org/4.5.5/d9/dab/tutorial_homography.html), [TorchVision detector source and pretrained weights](https://github.com/pytorch/vision/blob/main/torchvision/models/detection/faster_rcnn.py).

### Baseline-first processing

Before wet-image comparison, `analyze_dry.py` inventories each registered dry reference: detected objects, wheel-circle candidates with possible ground-contact points, and black/yellow painted-curb regions excluding detected object boxes. Region bounding-box height is a pixel span, **not** a confirmed full curb height. A dry wheel circle may be a rim; different cars in the two images must not share an assumed tire diameter.

Inventories are cached by image content hash in private `baseline-profiles.sqlite` and included in each incident's immutable comparison snapshot. Failed or missing optional detector weights are retried on a subsequent upload. Loading stages explicitly show dry-reference analysis before wet matching, and the result lists the dry inventory separately from wet wheel candidates. Neither cached pixels nor unseen objects supply a metric scale by themselves.

### Multi-reference scene analysis: columns, curbs, poles and entrances

The optional Grounding DINO tiny stage now examines both registered dry and uploaded wet images with prompts for columns, doorways, street-light poles, curbs, people, vehicles and water. Unlike the COCO traffic filter, this can propose static infrastructure references. These proposals are visible bounding boxes, not verified full object dimensions. Water-region boxes are not water-contact segmentation.

`scripts/cv/analyze_references.py` runs separately from base CV. A missing model or optional-stage timeout retains registration, traffic and existing calipers. `cv.sceneReferences` is additive and contains:

- Dry/wet normalized object regions, visible pixel extents and detector scores.
- Projected dry reference polygons and candidate static correspondence.
- Possible traffic/person occlusion of the dry or wet base, image-boundary clipping and water-region proximity.
- Separate image support at the reference center and base; neither proves physical coplanarity. `planeValidated` remains false until independent geometry establishes it.
- Ambiguous repeated objects, out-of-view references and unsupported projections, with explicit reasons.
- Nullable physical dimensions and depth, model ID/revision, cache status and processing duration.

For the supplied highway pair, actual model runs detect columns, curbs, poles, entrances, people, vehicles and a water region. Some dry columns stop at parked cars, while more of the same column appears in the wet photo. The visible box can therefore grow instead of shrink. Several similar dry proposals can also map to the same wet column; these matches are flagged ambiguous. The dry foreground curb cannot inherit scale from the facade transform.

A diagnostic projected-extent ratio compares axis-aligned pixel boxes after projection; it is **not a submerged fraction**. Partially cropped and ambiguous matches suppress that ratio. Raw pixel heights from the two cameras are never divided to infer depth. Broad registration now also requires at least 20% observed image support and a bounded reprojection residual, but this remains a coverage heuristic rather than a road-plane calibration.

Dry semantic inventories are cached separately using image pixels, working resolution, pinned model revision, prompt and inventory version. Wet results are calculated live. No model downloads run during an upload. Local preparation:

```sh
python3 -m pip install -r scripts/cv/requirements-references.txt
python3 scripts/cv/prepare_references.py
```

`CV_REFERENCE_PYTHON` can select a separate interpreter for this optional stage. On this machine it is configured locally as `/Users/nishantdahiya/.cache/floodflow/cv-references/bin/python`. Model weights are cached outside the repository. AWS invocation and deployment configuration belong to Antigravity under `COORDINATION.md`; these local interpreter paths must not be copied into cloud deployment configuration.

To inspect the actual two-photo comparison outside the app:

```sh
python3 scripts/cv/analyze_references.py dry.png wet.png > references.json
python3 scripts/cv/render_reference_report.py dry.png wet.png references.json report.html
```

The HTML report lets reviewers select a static reference and compare its dry region, wet proposal and projected region. It uses local image paths; sharing the generated file independently requires embedding or packaging those images.

The app shows one compact local caliper when usable water-contact geometry exists, otherwise one column candidate by default and expands infrastructure annotations under **Show all details**. Partial matches display the original dry viewpoint, avoiding a misleading globally warped road. The reference tables explain visible spans and possible missing-reference causes. Live-upload verification confirmed the new diagnostics survive owner-scoped persistence, and engineering-prior estimates remain pending. Earlier unknown-depth results are preserved as historical evidence.

Research basis: [Grounding DINO implementation and usage](https://huggingface.co/docs/transformers/model_doc/grounding-dino) supports prompted object proposals; [OpenCV homography](https://docs.opencv.org/4.x/d9/dab/tutorial_homography.html) describes planar projection between viewpoints; [Single View Metrology](https://robots.ox.ac.uk/~vgg/publications/1999/Criminisi99/) explains the geometric and scale constraints for physical measurements. [FloodVision](https://arxiv.org/abs/2509.04772) motivates multiple reference objects and dimension provenance. None of these sources validates FloodFlow's detector accuracy or the physical height of this particular curb.

## Live water-contact estimation

The optional semantic stage now also runs cached CLIPSeg (`CIDAS/clipseg-rd64-refined`, pinned revision `999e0328d9e10b484360c477313983f9afdd7050`). The dry photo is analyzed separately; a learned wet water mask supplies local transition candidates. Wheel circles require visible upper-arc edge support and a plausible position inside the detected vehicle. Upright-person references are considered only when geometry passes screening; tiny people and seated riders are rejected. Columns, poles and missing curbs remain contextual proposals without invented dimensions.

`cv.sceneReferences.referenceDepth` retains water-mask contours, dry/wet mask coverage, object boxes, local reference/contact points, pixel spans, assumed dimension ranges, individual depths/ranges, model provenance, processing time and limitations. `reference_priors.json` provides broad engineering assumptions: passenger wheel 450–750 mm, motorcycle wheel 400–750 mm, upright adult height 1400–1950 mm. These are not surveyed sizes or guaranteed population ranges. The separately sourced 2019 Wagon R dimensions are **not selected from a generic car detection**.

The aggregate is an object-balanced median of local estimates. Its uncertainty range envelopes candidate ranges; it is a heuristic sensitivity range, not a statistical confidence interval. Water-mask probabilities are not depth accuracy probabilities. The experimental index is capped at 65. `withRisk` fills only unknown depth and always prevents publication for `reference-prior-estimate`, even if contextual confidence changes. Existing reviewed measurements and the underpass demo path remain intact.

Prepare offline weights before uploads:

```sh
python3 scripts/cv/prepare_water_model.py
python3 -m unittest discover -s scripts/cv -p 'test_water_depth.py'
```

Uploads never download model weights or reuse a precomputed wet result. Missing weights or inference failure retain the base CV output with explicit unavailable/null evidence. Browser validation confirmed streamed loading stages, automatic results, both image canvases and owner-scoped persistence. Re-encoding/resizing changes local estimates; broad ranges remain visible. Both supplied dry controls produced no learned water region or reference-prior depth.

## Underpass presentation confidence

At the user's request, the matched mural-underpass demo displays a separately labelled **simulated** suggestion confidence of 78. Useful context answers add the existing bounded contribution, up to 10 points. Unknown answers add nothing; contradictions reduce the demonstration value. `demoConfidence` persists alongside the unchanged measured photo index. This presentation override never enters publication eligibility or replaces actual evidence sent to recommendations. Other scenes retain their experimental measured indices.
