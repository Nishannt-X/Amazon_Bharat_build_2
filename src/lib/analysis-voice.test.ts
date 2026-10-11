import {VoiceSession} from "./voice-session";
import {transcribeDeepgram} from "./deepgram-voice";
import test from "node:test";
import {contextQuestion,validateContextQuestion} from "./context-questions";
import assert from "node:assert/strict";
import {S3Client,PutObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";
import {TranscribeClient,StartTranscriptionJobCommand,GetTranscriptionJobCommand} from "@aws-sdk/client-transcribe";
import {PollyClient,SynthesizeSpeechCommand} from "@aws-sdk/client-polly";
import {speak,startVoice,readVoice,voiceBucket,pollyEnabled} from "./analysis-voice";
import {parseVoiceLanguage,normalizeObservation} from "./voice-language";

test("bilingual AWS commands preserve selected language, voice engine and private voice object paths",async()=>{
 const keys=["TRANSCRIBE_BUCKET","S3_EVIDENCE_BUCKET","POLLY_ENABLED","POLLY_VOICE_ID","POLLY_SPEECH_RATE"];
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const s3Send=S3Client.prototype.send,transcribeSend=TranscribeClient.prototype.send,pollySend=PollyClient.prototype.send;
 const uploads:Record<string,unknown>[]=[];const jobs:Record<string,unknown>[]=[];const speeches:Record<string,unknown>[]=[];
 let status="COMPLETED";
 // SDK prototype stubs prevent network/credentials use while testing real request builders.
 S3Client.prototype.send=(async(command:unknown)=>{
  if(command instanceof PutObjectCommand){uploads.push(command.input as unknown as Record<string,unknown>);return {};}
  assert.ok(command instanceof GetObjectCommand);assert.equal(command.input.Key,"voice/transcripts/test-hi.json");
  return {Body:{transformToString:async()=>JSON.stringify({results:{transcripts:[{transcript:"पानी टखनों तक है"}]}})}};
 }) as typeof S3Client.prototype.send;
 TranscribeClient.prototype.send=(async(command:unknown)=>{
  if(command instanceof StartTranscriptionJobCommand){jobs.push(command.input as unknown as Record<string,unknown>);return {};}
  assert.ok(command instanceof GetTranscriptionJobCommand);
  return {TranscriptionJob:{TranscriptionJobStatus:status,LanguageCode:"hi-IN"}};
 }) as typeof TranscribeClient.prototype.send;
 PollyClient.prototype.send=(async(command:unknown)=>{
  assert.ok(command instanceof SynthesizeSpeechCommand);speeches.push(command.input as unknown as Record<string,unknown>);
  return {AudioStream:{transformToByteArray:async()=>new Uint8Array([1,2,3])}};
 }) as typeof PollyClient.prototype.send;
 try {
  delete process.env.TRANSCRIBE_BUCKET;delete process.env.POLLY_ENABLED;process.env.S3_EVIDENCE_BUCKET="test-bucket";delete process.env.POLLY_VOICE_ID;delete process.env.POLLY_SPEECH_RATE;
  assert.equal(voiceBucket(),"test-bucket");assert.equal(pollyEnabled(),true);
  for(const language of ["en-IN","hi-IN"] as const){await startVoice(Buffer.from("audio"),"audio/webm;codecs=opus",`test-${language}`,language);await speak(language==="hi-IN"?"पानी कहाँ तक है?":"Where does the water reach?",language);}
  assert.deepEqual(jobs.map(job=>job.LanguageCode),["en-IN","hi-IN"]);
  assert.deepEqual(speeches.map(speech=>speech.LanguageCode),["en-IN","hi-IN"]);
  assert.ok(speeches.every(speech=>speech.VoiceId==="Kajal"&&speech.Engine==="neural"&&speech.TextType==="ssml"&&String(speech.Text).includes('rate="125%"')));
  assert.ok(uploads.every(upload=>String(upload.Key).startsWith("voice/recordings/")&&upload.ServerSideEncryption==="AES256"));
  assert.ok(jobs.every(job=>String(job.OutputKey).startsWith("voice/transcripts/")));
  process.env.POLLY_VOICE_ID="Aditi";await speak("Road <underpass> & traffic","en-IN");assert.equal(speeches.at(-1)?.Engine,"standard");assert.match(String(speeches.at(-1)?.Text),/&lt;underpass&gt; &amp; traffic/);
  process.env.POLLY_ENABLED="false";await assert.rejects(speak("Hello"),/not configured/);
  assert.equal((await readVoice("test-hi")).text,"पानी टखनों तक है");
  status="FAILED";assert.equal((await readVoice("test-hi")).status,"FAILED");
 } finally {
  S3Client.prototype.send=s3Send;TranscribeClient.prototype.send=transcribeSend;PollyClient.prototype.send=pollySend;
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
 }
});

test("language validation and Hindi observation normalization preserve usable dimensions without invented landmarks",()=>{
 assert.equal(parseVoiceLanguage(undefined),"en-IN");assert.equal(parseVoiceLanguage("hi-IN"),"hi-IN");assert.throws(()=>parseVoiceLanguage("fr-FR"));
 assert.match(normalizeObservation("पानी टखनों तक है"),/ankle/);
 assert.match(normalizeObservation("१७० सेंटीमीटर"),/170\s+cm/);
 assert.match(normalizeObservation("पानी बह नहीं रहा"),/still water/);
 assert.match(normalizeObservation("पता नहीं"),/unknown/);
});


test("Hindi context keeps canonical option IDs and rejects English or numeric model wording",()=>{
 const english=contextQuestion(0)!;const hindi=contextQuestion(0,"hi-IN")!;
 assert.deepEqual(hindi.options.map(option=>option.id),english.options.map(option=>option.id));
 assert.ok(hindi.options.every(option=>option.depthMm==null&&/[\u0900-\u097f]/.test(option.label)));
 assert.deepEqual(validateContextQuestion({question:"Where does the water reach?",category:hindi.category},hindi),hindi);
 assert.deepEqual(validateContextQuestion({question:"पानी ३०० मिलीमीटर टखनों तक है?",category:hindi.category},hindi),hindi);
 assert.equal(contextQuestion(1,"hi-IN")?.options.length,0);
});


test("stopping voice cancels pending work and rejects late audio/transcripts without affecting a restarted session",()=>{
 const session=new VoiceSession();const first=session.start();
 assert.equal(session.isCurrent(first),true);
 session.stop();assert.equal(first.signal.aborted,true);assert.equal(session.isCurrent(first),false);
 const second=session.start();assert.equal(session.isCurrent(second),true);assert.equal(session.isCurrent(first),false);
 session.stop();assert.equal(second.signal.aborted,true);
});

test("Deepgram adapter sends audio and selected language server-side and returns an editable transcript",async()=>{
 const savedKey=process.env.DEEPGRAM_API_KEY;const originalFetch=globalThis.fetch;
 process.env.DEEPGRAM_API_KEY="test-only-key";
 const calls:{url:URL;init:RequestInit}[]=[];
 globalThis.fetch=(async(input:URL|RequestInfo,init?:RequestInit)=>{
  calls.push({url:new URL(String(input)),init:init!});
  return Response.json({results:{channels:[{alternatives:[{transcript:"पानी टखनों तक है"}]}]}});
 }) as typeof fetch;
 try {
  const result=await transcribeDeepgram(Buffer.from("test audio"),"audio/webm;codecs=opus","hi-IN");
  assert.equal(result.provider,"deepgram");assert.equal(result.status,"COMPLETED");assert.equal(result.text,"पानी टखनों तक है");
  assert.equal(calls[0].url.searchParams.get("language"),"hi");assert.equal(calls[0].url.searchParams.get("model"),process.env.DEEPGRAM_MODEL||"nova-3");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"),"Token test-only-key");
  await transcribeDeepgram(Buffer.from("test audio"),"audio/mp4","en-IN");assert.equal(calls[1].url.searchParams.get("language"),"en");
  globalThis.fetch=(async()=>new Response("secret provider details",{status:401})) as typeof fetch;
  await assert.rejects(transcribeDeepgram(Buffer.from("test"),"audio/mp4","en-IN"),/rejected the API key/);
 }finally {globalThis.fetch=originalFetch;if(savedKey===undefined)delete process.env.DEEPGRAM_API_KEY;else process.env.DEEPGRAM_API_KEY=savedKey;}
});
