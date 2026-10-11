import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {authenticate,accountDatabase,createAccount,createSession,currentAccount,readGarage,addGarageCar,revokeSession,guardAccountMutation,sessionCookie} from "./account-store";
import {readVehicleReference,vehicleDatabase,readVehicleCatalog} from "./vehicle-store";
import {deterministicRecommendation,recommendVehicle,validateCloudSelection} from "./vehicle-recommendations";
import {applyAnswer,publicAnalysis,type AnalysisResult} from "./photo-analysis";
import {saveAnalysis,readPhotoAnalysis,readAnalysis} from "./analysis-store";
import {analysisOwner} from "./analysis-http";
import {POST as login} from "../app/api/account/route";
import {POST as garage} from "../app/api/garage/route";
import {POST as recommendations} from "../app/api/recommendations/route";
const base=():AnalysisResult=>({id:randomUUID(),owner:randomUUID(),photoHash:"test",createdAt:new Date().toISOString(),cv:null,scene:{roadType:"Unknown",traffic:[],hazards:[],explanation:""},provider:"local-cv",baseline:"demo",depthMm:74,depthRangeMm:[50,100],depthSource:"demo-assumed-reference",confidence:49,confidenceMeaning:"Experimental evidence index, not accuracy",riskScore:20,riskType:"water-present",publication:"pending",notes:[],answers:[]});
const request=(url:string,body:unknown,cookie="",origin="http://localhost")=>new Request(`http://localhost${url}`,{method:"POST",headers:{"Content-Type":"application/json",origin,cookie},body:JSON.stringify(body)});
test("accounts: salted hashing, invalid login, sessions, expiry, logout and isolated garage",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"ff-auth-"));process.env.REPORT_STORE_DIR=directory;
 try{
  const first=await createAccount("First@example.test","correct-password-one");const second=await createAccount("second@example.test","correct-password-one");
  const hashes=accountDatabase().prepare("SELECT password_hash,salt FROM accounts").all() as {password_hash:string;salt:string}[];
  assert.notEqual(hashes[0].salt,hashes[1].salt);assert.notEqual(hashes[0].password_hash,hashes[1].password_hash);assert.ok(!JSON.stringify(hashes).includes("correct-password"));
  assert.equal(await authenticate(first.email,"wrong-password-one"),null);assert.equal((await authenticate(first.email,"correct-password-one"))?.id,first.id);
  const token=createSession(first);const req=new Request("http://localhost/api/account",{headers:{cookie:`ff_session=${token}`}});assert.equal(currentAccount(req)?.id,first.id);
  addGarageCar(first.id,{vehicleId:"maruti-swift",year:"2023",variant:"LXi"});addGarageCar(first.id,{vehicleId:"hyundai-creta",year:"2024",variant:"E"});assert.equal(readGarage(first.id).length,2);assert.deepEqual(readGarage(second.id),[]);
  const blocked=await garage(request("/api/garage",{vehicleId:"maruti-swift",year:"2023"},""));assert.equal(blocked.status,401);
  assert.throws(()=>guardAccountMutation(request("/api/account",{},"","https://evil.example"),"origin"));
  assert.throws(()=>guardAccountMutation(request("/api/account",{},"","https://localhost"),"scheme"));
  assert.match(sessionCookie(new Request("https://localhost/api/account"),token),/; Secure$/);
  assert.match(sessionCookie(new Request("http://localhost/api/account",{headers:{"x-forwarded-proto":"https"}}),token),/; Secure$/);
  accountDatabase().prepare("UPDATE sessions SET expires_at=0").run();assert.equal(currentAccount(req),null);
  const another=createSession(second);const other=new Request("http://localhost",{headers:{cookie:`ff_session=${another}`}});revokeSession(other);assert.equal(currentAccount(other),null);
  for(let i=0;i<10;i++)guardAccountMutation(request("/api/account",{}),"rate-test");assert.throws(()=>guardAccountMutation(request("/api/account",{}),"rate-test"),/Too many/);
 }finally{delete process.env.REPORT_STORE_DIR;rmSync(directory,{recursive:true,force:true});}
});
test("login claims current guest evidence only, origin rejects CSRF, and recommendations remain owner scoped",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"ff-login-"));process.env.REPORT_STORE_DIR=directory;
 try{
  const photo=base();saveAnalysis(photo,Buffer.from("test"));const another=base();saveAnalysis(another,Buffer.from("other"));
  const response=await login(request("/api/account",{action:"register",email:"qa@example.test",password:"long-password-qa"},`ff_evidence=${photo.owner}`));assert.equal(response.status,200);
  const body=await response.json();const cookies=response.headers.get("set-cookie")!;assert.match(cookies,/HttpOnly/);assert.match(cookies,/SameSite=Strict/);assert.match(cookies,/Max-Age=604800/);assert.ok(!JSON.stringify(body).includes("password"));
  const token=cookies.match(/ff_session=([a-f0-9]{64})/)![1];assert.equal(readAnalysis(photo.id,photo.owner),null);assert.equal(readAnalysis(photo.id,body.account.id)?.depthMm,74);assert.equal(readPhotoAnalysis(photo.id,body.account.id)?.depthMm,74);assert.equal(readAnalysis(another.id,another.owner)?.depthMm,74);
  assert.equal(analysisOwner(new Request("http://localhost",{headers:{cookie:`ff_evidence=${body.account.id}`}})),null,"Account UUID cannot impersonate an account through a guest cookie");
  const blocked=await login(request("/api/account",{action:"login",email:"qa@example.test",password:"long-password-qa"},"","https://evil.example"));assert.equal(blocked.status,400);
  const vehicle={make:"Maruti",model:"Swift",year:"2023",variant:"LXi"};const ok=await recommendations(request("/api/recommendations",{analysisId:photo.id,vehicle},`ff_session=${token}`));assert.equal(ok.status,200);
  const denied=await recommendations(request("/api/recommendations",{analysisId:another.id,vehicle},`ff_session=${token}`));assert.equal(denied.status,404);
  const rotated=await login(request("/api/account",{action:"login",email:"qa@example.test",password:"long-password-qa"},`ff_session=${token}`));assert.equal(rotated.status,200);assert.equal(currentAccount(new Request("http://localhost",{headers:{cookie:`ff_session=${token}`}})),null);
 }finally{delete process.env.REPORT_STORE_DIR;rmSync(directory,{recursive:true,force:true});}
});
test("catalog database seeds idempotently, preserves provenance and explicitly unknown specs",()=>{
 const directory=mkdtempSync(join(tmpdir(),"ff-catalog-"));process.env.REPORT_STORE_DIR=directory;
 try{
  assert.ok(readVehicleCatalog().length>200);const count=vehicleDatabase().prepare("SELECT count(*) AS n FROM vehicle_catalog").get() as {n:number};assert.equal(count.n,318);readVehicleCatalog();assert.equal((vehicleDatabase().prepare("SELECT count(*) AS n FROM vehicle_catalog").get() as {n:number}).n,count.n);
  const kwid=readVehicleReference("Renault","Kwid").reference!;assert.equal(kwid.startingPriceInr,452900);assert.equal(kwid.groundClearanceMm,184);assert.equal(kwid.intakeHeightMm,null);assert.equal(kwid.exhaustHeightMm,null);assert.equal(kwid.modelYear,null);assert.equal(kwid.provenance?.groundClearanceMm?.unit,"mm");assert.equal(kwid.provenance?.startingPriceInr?.unit,"INR");assert.equal(kwid.checkedAt,"2026-10-11");
  assert.equal(readVehicleReference("Mahindra","Thar").reference?.wadingMm,650);assert.match(readVehicleReference("Mahindra","Thar").reference!.label,/Historical/);assert.equal(readVehicleReference("Tata","Harrier").reference,null);assert.ok(readVehicleReference("Tata","Harrier").research);
 }finally{delete process.env.REPORT_STORE_DIR;rmSync(directory,{recursive:true,force:true});}
});
test("tailored recommendations change on reselection and constrain cloud output/failure",async()=>{
 const analysis=publicAnalysis({...base(),depthMm:180,depthRangeMm:[150,220],scene:{roadType:"Underpass",traffic:["scooters"],hazards:["open drain"],movingWater:true,explanation:""}});
 const first={analysis,vehicle:{make:"Renault",model:"Kwid",year:"2024",variant:"Evolution"},reference:null,research:null};const second={...first,vehicle:{make:"Mahindra",model:"Thar",year:"2020",variant:"AX"}};
 const one=deterministicRecommendation(first);const two=deterministicRecommendation(second);assert.notEqual(one.vehicleKey,two.vehicleKey);assert.match(one.heading,/Kwid/);assert.match(two.heading,/Thar/);assert.ok(one.reasons.some(reason=>/180 mm/.test(reason)));assert.ok(one.reasons.some(reason=>/Underpass/.test(reason)));assert.equal(one.level,"high");
 const failed=await recommendVehicle(first,async()=>{throw new Error("cloud down");});assert.equal(failed.provider,"deterministic-cloud-failure");assert.deepEqual(failed.checkedFacts,one.checkedFacts);
 const hostile=await recommendVehicle(first,async()=>({actionOrder:[0,1,2],depthMm:0,confidence:99}));assert.equal(hostile.provider,"deterministic-cloud-failure");
 const valid=await recommendVehicle(first,async()=>({actionOrder:[0,2,1]}));assert.equal(valid.provider,"bedrock");assert.equal(valid.actions[0],one.actions[0]);assert.equal(valid.checkedFacts.depthMm,180);assert.throws(()=>validateCloudSelection({actionOrder:[1,0,2]},one));
});
test("context index adds only specific bounded evidence; unknowns, contradictions and raw snapshots stay honest",()=>{
 const original=base();const unknown=applyAnswer(original,"unknown");assert.equal(unknown.confidence,49);assert.equal(unknown.contextConfidence,49);assert.equal(unknown.contextEvidence?.contribution,0);
 const specific=applyAnswer(original,"ankle");assert.equal(specific.confidence,49);assert.equal(specific.contextConfidence,51);assert.equal(specific.publication,"pending");
 const contradiction=applyAnswer(applyAnswer(original,"knee"),"175 cm");assert.equal(contradiction.contextEvidence?.contradiction,true);assert.ok(contradiction.contextConfidence!<=25);assert.equal(contradiction.contextEvidence?.contribution,0);assert.equal(original.depthMm,74);assert.equal(original.confidence,49);assert.equal(original.answers.length,0);
 const directory=mkdtempSync(join(tmpdir(),"ff-context-"));process.env.REPORT_STORE_DIR=directory;
 try{saveAnalysis(original,Buffer.from("test"));saveAnalysis(specific);assert.deepEqual(readPhotoAnalysis(original.id,original.owner),original);assert.equal(readAnalysis(original.id,original.owner)?.contextConfidence,51);}finally{delete process.env.REPORT_STORE_DIR;rmSync(directory,{recursive:true,force:true});}
});
