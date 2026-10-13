import test from "node:test";
import assert from "node:assert/strict";
import {runCloudCv,runLocalCv,runPhotoOnlyCv} from "./cv-runtime";
import {localFirstCv} from "./cv-selection";
const config={localEnabled:true,python:"/missing/cv/python",referencePython:"/missing/cv/python",serviceUrl:"https://cv.example.com",token:"test-only",timeoutMs:1000};
const evidence={width:100,height:100,blurVariance:100,brightness:100,matches:10,inliers:8,inlierRatio:.8,registered:false,homography:null,candidateWaterlineY:null,structuralEdges:[],traffic:[],durationMs:1,limitations:[]};
const photo=Buffer.from("test image");
const responder=(change:Record<string,unknown>={}) => (async(_url,init)=>{
  const payload=JSON.parse(init!.body as string);
  return Response.json({version:1,photoHash:payload.photoHash,baselineId:payload.baselines[0].id,
    baselineHash:payload.baselines[0].sha256,evidence,...change});
}) as typeof fetch;

test("real missing executable falls back to cloud with matching upload and baseline",async()=>{
  let cloudCalls=0;
  const result=await localFirstCv(()=>runLocalCv(photo,config),()=>{cloudCalls++;return runCloudCv(photo,config,responder());});
  assert.equal(result.engine,"fargate");assert.equal(cloudCalls,1);assert.equal(result.value.cv.inliers,8);
});
test("cloud responses for another photo or invalid evidence are rejected",async()=>{
  await assert.rejects(runCloudCv(photo,config,responder({photoHash:"different"})),/does not match/);
  await assert.rejects(runCloudCv(photo,config,responder({evidence:{...evidence,width:null}})),/Invalid CV response/);
});
test("missing credentials, insecure endpoints and cloud errors do not fabricate evidence",async()=>{
  await assert.rejects(runCloudCv(photo,{...config,token:""}),/not configured/);
  await assert.rejects(runCloudCv(photo,{...config,serviceUrl:"http://cv.example.com"}),/HTTPS/);
  await assert.rejects(runCloudCv(photo,config,async()=>new Response("failure",{status:503})),/503/);
});
test("an unmatched reference retains independent inventory but never aligned imagery",async()=>{
  const unmatched=await runCloudCv(photo,config,responder({alignedBaseline:Buffer.from("aligned").toString("base64"),dryProfile:{version:1}}));
  assert.equal(unmatched.matched,false);assert.equal(unmatched.baseline,null);assert.deepEqual(unmatched.baselineProfile,{version:1});
  const matched=await runCloudCv(photo,config,responder({evidence:{...evidence,sceneMatched:true},alignedBaseline:Buffer.from("aligned").toString("base64")}));
  assert.equal(matched.matched,true);assert.ok(matched.baseline?.length);
});

test("upload-only cloud CV runs photo evidence but cannot return reference alignment",async()=>{
  let uploadOnly=false;
  const fetcher=(async(url,init)=>{
    uploadOnly=JSON.parse(init!.body as string).allowComparison===false;
    return responder()(url,init);
  }) as typeof fetch;
  const result=await runCloudCv(photo,config,fetcher,undefined,false);
  assert.equal(uploadOnly,true);
  assert.ok(result.cv);
  assert.equal(result.matched,false);
  assert.equal(result.baseline,null);
  await assert.rejects(runCloudCv(photo,config,responder({evidence:{...evidence,registered:true}}),undefined,false),/contains reference alignment/);
});

test("a missing location reference still runs upload-only CV with cloud fallback",async()=>{
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=(async(url,init)=>{
    calls++;
    assert.equal(JSON.parse(init!.body as string).allowComparison,false);
    return responder()(url,init);
  }) as typeof fetch;
  try {
    const outcome=await runPhotoOnlyCv(photo,config);
    assert.equal(outcome.engine,"fargate");
    assert.equal(calls,1);
    assert.ok(outcome.value.cv);
    assert.equal(outcome.value.matched,false);
    assert.equal(outcome.value.baseline,null);
  } finally { globalThis.fetch=original; }
});
