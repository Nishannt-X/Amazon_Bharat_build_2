import test from "node:test";
import assert from "node:assert/strict";
import {deterministicRecommendation,recommendVehicle,validateCloudSelection,type RecommendationInput} from "./vehicle-recommendations";
const input:RecommendationInput={analysis:{id:"test",createdAt:"2026-10-12",cv:null,scene:{roadType:"Unknown",traffic:[],hazards:["moving water"],movingWater:true,explanation:""},provider:"local-cv",baseline:"demo",depthMm:74,depthRangeMm:[12,136],depthSource:"demo-assumed-reference",confidence:49,confidenceMeaning:"Experimental evidence index",riskScore:37,riskType:"elevated",publication:"pending",notes:[],answers:[]},vehicle:{make:"Honda",model:"Activa 6G",year:"2022",variant:""},reference:null,research:{groundClearanceMm:162} as RecommendationInput["research"]};

test("Activa's incomplete Bedrock order retains all server actions and accepts valid explanation",async()=>{
 const base=deterministicRecommendation(input);
 const result=await recommendVehicle(input,async()=>({actionOrder:[0,2],crispHeading:"Alternative heading",crispReasons:["Scooter screening retains traction concerns despite the clearance margin."]}));
 assert.equal(result.provider,"bedrock");assert.equal(result.level,"high");assert.equal(result.heading,base.heading);
 assert.deepEqual(result.actions,[base.actions[0],base.actions[2],base.actions[1]]);
 assert.deepEqual(result.checkedFacts,base.checkedFacts);
});

test("action completion rejects duplicates, unauthorized metrics and a changed primary action",()=>{
 const base=deterministicRecommendation(input);
 assert.deepEqual(validateCloudSelection({actionOrder:[0]},base),[0,1,2]);
 for(const actionOrder of [[1,0,2],[0,0,2],[0,3],[],[-1,0]])assert.throws(()=>validateCloudSelection({actionOrder},base));
 assert.throws(()=>validateCloudSelection({actionOrder:[0,1,2],depthMm:0},base));
});

test("complete action orders and car recommendations remain unchanged",async()=>{
 const car={...input,vehicle:{make:"Hyundai",model:"Creta",year:"2022",variant:"E"},research:{groundClearanceMm:190} as RecommendationInput["research"]};
 const base=deterministicRecommendation(car);
 const result=await recommendVehicle(car,async()=>({actionOrder:[0,1,2],crispReasons:["The displayed depth is below the clearance reference."]}));
 assert.equal(result.level,"lower");assert.equal(result.provider,"bedrock");assert.deepEqual(result.actions,base.actions);
});
