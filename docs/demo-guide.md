# FloodFlow: three-minute demonstration

**Audience:** Environmental Hacks judges, Track 02: Heat and Water.

**Story:** A driver sees water on a familiar road. FloodFlow turns a photo into inspectable evidence, adds missing context, relates it to the driver's vehicle, and preserves the observation on a shared map.

## Before recording

- Start the app and local CV interpreter. Prepare optional model weights ahead of time; the upload path does not download them.
- Allow browser location access on localhost or HTTPS. Confirm the report can acquire an accurate location.
- Have the wet companion image for the mural-underpass example ready. The dry baseline is bundled. Keep the Delhi wet image available if showing the second example.
- For AWS segments, confirm the configured Bedrock model actually responds. Check Transcribe, Polly, and their bucket only if demonstrating voice.
- Seed the sample reports. Keep their sample labels visible.
- Prepare a guest flow and a registered account with two saved vehicles. Do not record account passwords, keys, or local environment files.
- Show the actual hosted URL if submitting a deployed application. Do not describe a local browser tab as proof of deployment.

## Recording sequence

| Time | Show | Explain |
|---|---|---|
| **0:00–0:20** | Landing page, then the India map | Urban waterlogging leaves drivers with a road marker but little vehicle-specific context. Introduce the intended users. |
| **0:20–0:55** | Open the report page, confirm device position, upload the wet image | Citizen evidence is attached to coordinates, GPS accuracy, and time. Watch the streamed analysis stages. |
| **0:55–1:25** | Uploaded image, dry reference, measurement annotations and metrics | Compare the scene, show a measured pixel span and depth range, and name the physical-reference assumption. |
| **1:25–1:50** | Open the context chat and answer one question | Demonstrate the missing-context loop. Identify Bedrock's role; show speech only if Transcribe and Polly are configured. |
| **1:50–2:20** | Choose a scooter and then a car, or switch saved garage vehicles | Explain that vehicle context changes the guidance. Show available sourced specifications and distinguish them from missing trim data. |
| **2:20–2:40** | Save, follow the map link, refresh | Show a durable report with a nearby place name. Point out that a visible observation and verified detailed evidence are separate states. |
| **2:40–3:00** | Architecture figure | Locate CV, Bedrock, voice services, storage, and the cloud blueprint. Close with the value of better local evidence for monsoon travel. |

## Claims to keep precise

- Show depth **and its range/source**, rather than calling an assumed-scale estimate ground truth.
- Explain confidence as an evidence/presentation signal; do not claim validated model accuracy from the demo percentage.
- Credit Bedrock for scene context and conversation. Local CV performs geometric measurement.
- Show the registered baseline as the current source. Google Street View Static integration is deferred.
- Name only AWS paths demonstrated with successful calls. DynamoDB tables in Terraform are not proof of runtime database migration.
- Describe the environmental benefit as the intended impact; avoid numerical claims about accidents, emissions, or trips prevented without a study.

## Judge checklist

The [official rubric](https://www.wemakedevs.org/aws/env#judging) asks for impact, AWS use, usability, execution, and a recorded three-minute demonstration. The video should show the complete citizen-to-map outcome, with enough time to understand what AWS contributes.
