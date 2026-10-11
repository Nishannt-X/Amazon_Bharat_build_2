# Photo analysis demo and service setup

Open `/report`, upload the wet mural-underpass screenshot, and wait for the overlay. The provided dry screenshot is already registered at `public/demo/dry-underpass.png`. It is a **demo reference**, not a geographically validated baseline.

## What runs now

- Each upload runs fresh computation. Only the dry demo photo ships with the app; no flooded photo or precomputed result is bundled.
- Node validates and decodes the photo, strips EXIF, and runs bounded Python/OpenCV work. The overlay receives streamed processing stages; result tables show `Calculating…` until the final result arrives.
- After continuing as a guest, photo metrics appear in the left card. The larger right card holds model/age inputs and displays fetched vehicle references after both fields are entered.
- ORB descriptors, ratio matching, RANSAC homography, inlier checks, and geometry sanity checks align the dry image to the uploaded image. A match aligns a scene plane; it is not a 3D reconstruction.
- Canny/Hough measurements find structural edge spans and foreground upright reference candidates. Local dry/wet changes suggest candidate submersion boundaries. These candidates remain unclassified and require review.
- OpenCV HOG detects pedestrian candidates. Vehicle make/model detection is not provided by this detector.
- The overlay starts with one primary reference (R1), its dry span, candidate submerged span, and assumed pixel-to-mm calculation. **Show all details** reveals the other references, structural edges, waterline candidates and pedestrian boxes. A dry baseline canvas remains visible beneath the upload.
- The overlay displays pixel spans, reference candidates annotated directly on the uploaded photo, registration statistics, processing time, image sharpness/brightness, depth/range, evidence quality, road/traffic context, and an experimental environmental score.
- When a matched foreground candidate has a usable image-change boundary, an automatic **illustrative demo estimate** uses the prototype’s explicit 250 mm assumption and a broad heuristic range. It does not verify object identity or water segmentation. No fixed water-depth result is coded. Reference selection is handled automatically; the reporting flow does not ask users to supply calibration or a baseline. Research-only reviewed caliper input remains supported by the backend, outside this flow. The assumed 250 mm height is displayed prominently; it is not a universal Indian infrastructure standard. The displayed ±20% + 10 mm range is heuristic, not a validated accuracy interval.
- The photo-analysis overlay evaluates only photo evidence. A separate small chat opens from **Help in adding context** below the left evidence card. Text answers persist per analysis; closing/reopening restores history. Voice remains available through configured Transcribe/Polly adapters. The original photo-only result remains separate from the report’s added observations.
- The optional deterministic follow-up assistant asks about body-relative water level, height, traffic/bus observations, road type, moving water, and drains. Body-reference answers yield an explicit broad estimate, never calibrated CV depth. Image sharpness, exposure, registration/inlier quality and reference type contribute to the experimental evidence index. Answers do not raise confidence above the publication threshold.
- Risk score is an experimental **environmental screening index**: upper estimated depth in mm / 5, plus 10 for an underpass, 15 for observed moving water, and 10 for an obscured road surface, capped at 100. It is not a vehicle-specific safe-crossing verdict, calibrated loss probability, or medical/financial estimate. Vehicle intake, exhaust and wading specifications remain necessary for personalized assessment.

## Persistence and publication

`.data/reports/analyses.sqlite` stores sanitized evidence photos, aligned baseline, results and answers. `.data/reports/waterlogs.sqlite` stores the final GPS-bound photo report and analysis snapshot. Both are local server databases and need durable storage when deploying.

Each new analysis stores a versioned comparison: baseline ID/hash, assumed 250 mm scale basis, normalized dry/water points, pixel spans, mm-per-pixel values and projected lengths. An immutable `photo_result` snapshot survives chat edits. Each saved incident copies that snapshot, the updated contextual result, risk guidance and the aligned dry JPEG into its own report record. Later analysis edits do not change the incident’s comparison. Legacy analyses with existing answers cannot retroactively recover an original photo-only snapshot.

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
