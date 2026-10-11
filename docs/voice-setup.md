# Hindi and English context voice

The context overlay starts in text mode. **Start voice conversation** enables Polly playback, including the next question after an answer is sent. **Reply by voice** records an answer; **Finish voice reply** stops recording and requests transcription. **Stop voice · Use text** cancels audio, microphone tracks and pending transcript requests without clearing typed text. Text input stays visible in either mode.

The context overlay has an English / हिन्दी selector. It sets the displayed question language, Polly speech language and Transcribe recording language. Hindi transcripts remain editable in Devanagari; known observation terms and Devanagari digits are normalized internally without replacing the recorded answer.

## Deepgram voice replies

Set `DEEPGRAM_API_KEY` in the ignored `.env.local` file. A blank server-only line has been added; no key is sent to the browser or committed. When configured, `/api/analysis/voice` sends recorded audio directly to Deepgram and returns a transcript for review; it does not start an AWS Transcribe job. The reply button stays disabled until Deepgram is configured.

Default model is `nova-3`; `DEEPGRAM_MODEL` can override it. English uses `language=en`; Hindi uses `language=hi`. Model support was checked against [Deepgram models/languages](https://developers.deepgram.com/docs/models-languages-overview/). This remains explicit language selection rather than automatic mixed-language detection.

## Runtime settings

- `AWS_REGION`: default service region.
- `S3_EVIDENCE_BUCKET`: existing evidence bucket, also used for voice when no dedicated bucket is provided.
- `TRANSCRIBE_BUCKET`: optional dedicated bucket. Recordings use `voice/recordings/`; transcripts use `voice/transcripts/`.
- `TRANSCRIBE_REGION`: optional region override; the voice bucket must be in the region used for transcription.
- `POLLY_REGION`: optional speech-region override.
- `POLLY_ENABLED=false`: explicit speech opt-out. Otherwise Polly is enabled and uses the SDK credential chain.
- `POLLY_VOICE_ID=Kajal`: bilingual neural voice, the default. An explicit `Aditi` override selects the standard voice.
- `POLLY_SPEECH_RATE`: percentage speaking rate, default 125; clamped to 100–150. Text is XML-escaped before being wrapped in SSML.

No environment file was changed for this integration. Credentials remain server-side and never enter the browser.

## Permissions

The server role/user needs `polly:SynthesizeSpeech`, `transcribe:StartTranscriptionJob`, `transcribe:GetTranscriptionJob`, and S3 `PutObject`/`GetObject` access to its voice prefixes. The live smoke test additionally needs deletion access to its own synthetic jobs and objects for cleanup.

An explicit AWS Organizations service control policy deny cannot be overridden by attaching an IAM allow policy. The organization administrator must approve the service in the chosen region. Do not switch regions to bypass an organization restriction.

## Behavior

- Recordings stop after 30 seconds, can be stopped manually and release microphone tracks when finished or the overlay closes.
- Transcription is asynchronous. The browser polls for up to roughly two minutes and handles failure, empty speech and network timeouts.
- The transcript is displayed for review; it is never automatically submitted as evidence.
- Playback can be stopped. Starting recording or submitting an answer stops the question audio to prevent it entering the recording.
- English uses `en-IN`; Hindi uses `hi-IN`. This implementation uses explicit language selection, not automatic mixed-language identification.
- Hindi body-reference questions have no fixed ankle/knee/wheel-hub depth. The height step remains a rough estimate with user-provided height.
- Existing historical answers are preserved; switching language does not migrate or delete evidence.

## Checks

Offline SDK/request tests: `node scripts/run-voice-tests.mjs`.

Observation parsing tests: `npm run test:analysis`.

Explicit live synthetic test: `node scripts/check-voice-services.mjs --live`. This invokes billable Polly and Transcribe requests, creates test objects under voice prefixes and removes only its own synthetic artifacts.

Verification on 2026-10-12: both speech endpoints returned HTTP 200 with MP3 audio from live Polly. Starting Transcribe was denied explicitly by the AWS organization service control policy in ap-southeast-2. Live transcription remains unverified until the organization administrator permits it. The attempted smoke-test recordings were cleaned up; no successful transcription job was created.

Sources: [Polly bilingual voices](https://docs.aws.amazon.com/polly/latest/dg/bilingual-voices.html), [Transcribe supported languages](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html).
