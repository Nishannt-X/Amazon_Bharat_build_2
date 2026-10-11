/** Live, synthetic Polly -> S3 -> Transcribe smoke test. Removes only its own test artifacts. */
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import nextEnv from '@next/env';
import {S3Client,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {TranscribeClient,DeleteTranscriptionJobCommand} from '@aws-sdk/client-transcribe';
if (!process.argv.includes('--live')) throw new Error('Pass --live to synthesize test speech and run billable AWS transcription.');
nextEnv.loadEnvConfig(process.cwd());
const directory=mkdtempSync(join(process.cwd(),'.cache/voice-live-'));
const jobs=[];
const region=process.env.TRANSCRIBE_REGION||process.env.S3_REGION||process.env.AWS_REGION||'ap-south-1';
try {
 for(const name of ['analysis-voice','voice-language']) writeFileSync(join(directory,`${name}.js`),ts.transpileModule(readFileSync(`src/lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
 const {speak,startVoice,readVoice,voiceBucket}=createRequire(import.meta.url)(join(directory,'analysis-voice.js'));
 for(const [language,text] of [['en-IN','The water reaches my ankles. My height is 170 centimetres.'],['hi-IN','पानी मेरे टखनों तक है। मेरी लंबाई 170 सेंटीमीटर है।']]) {
  const bytes=await speak(text,language);
  const id=`ff-voice-smoke-${randomUUID()}`;
  const job={id,bucket:voiceBucket(),started:false};jobs.push(job);
  console.log(JSON.stringify({language,speechBytes:bytes.length,status:"SYNTHESIZED"}));
  await startVoice(Buffer.from(bytes),'audio/mpeg',id,language);
  job.started=true;
  console.log(JSON.stringify({language,speechBytes:bytes.length,status:'SUBMITTED'}));
  const deadline=Date.now()+150000;
  let transcript;
  while(Date.now()<deadline) {
   transcript=await readVoice(id);
   if(transcript.status==='FAILED') throw new Error(`${language}: ${transcript.error}`);
   if(transcript.status==='COMPLETED') break;
   await new Promise(resolve=>setTimeout(resolve,3000));
  }
  if(transcript?.status!=='COMPLETED'||!transcript.text?.trim()) throw new Error(`${language}: transcription did not complete with text.`);
  console.log(JSON.stringify({language,status:transcript.status,transcript:transcript.text}));
 }
} finally {
 const s3=new S3Client({region});const transcribe=new TranscribeClient({region});
 for(const {id,bucket,started} of jobs) {
  for(const key of [`voice/recordings/${id}.mp3`,`voice/transcripts/${id}.json`]) {
   try {await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));} catch(error) {console.error('Synthetic artifact cleanup failed:',error.name);}
  }
  if (started) try {await transcribe.send(new DeleteTranscriptionJobCommand({TranscriptionJobName:id}));} catch(error) {console.error('Synthetic job cleanup failed:',error.name);}
 }
 rmSync(directory,{recursive:true,force:true});
}
