import test from "node:test";
import assert from "node:assert/strict";
import {applyAnswer,applyContextAssessment,withRisk,type AnalysisResult} from "./photo-analysis";
import {assessContextAnswer,reassessContext} from "./context-assessment";
const photo=():AnalysisResult=>({id:"test",owner:"test",photoHash:"test",createdAt:"2026-10-12",cv:null,scene:{roadType:"Underpass",traffic:[],hazards:[],movingWater:true,explanation:""},provider:"local-cv",baseline:"demo",depthMm:74,depthRangeMm:[12,136],depthSource:"demo-assumed-reference",confidence:49,confidenceMeaning:"Experimental",riskScore:30,riskType:"elevated",publication:"pending",notes:[],answers:[]});

test("each answer changes score only by a bounded model delta and never lowers raw photo confidence",()=>{
 let result=photo();
 for(const [answer,delta,expected] of [["ankle",99,52],["170 cm",-99,50],["cars",3,53],["still water",-2,51]] as const){
  const parsed=applyAnswer(result,answer);assert.equal(parsed.contextConfidence,result.contextConfidence??49);
  result=applyContextAssessment(parsed,{confidenceDelta:delta,confidenceReason:"Test model assessment."});assert.equal(result.contextConfidence,expected);assert.equal(result.confidence,49);
 }
 assert.deepEqual(result.contextEvidence?.adjustments?.map(item=>item.delta),[3,-2,3,-2]);
 assert.equal(applyContextAssessment(result,{confidenceDelta:3,confidenceReason:"Retry"}).contextConfidence,51);
});

test("missing/invalid model assessment has zero effect; context can exceed 74 without promoting publication",()=>{
 let result=applyContextAssessment(applyAnswer({...photo(),confidence:74},"ankle"),{confidenceDelta:3,confidenceReason:"Clear observation"});
 assert.equal(result.contextConfidence,77);assert.equal(result.confidence,74);assert.equal(result.publication,"pending");
 result=applyContextAssessment(applyAnswer(result,"170 cm"),null);assert.equal(result.contextConfidence,77);
 result=applyContextAssessment(applyAnswer(result,"cars"),{confidenceDelta:NaN,confidenceReason:"Bad output"});assert.equal(result.contextConfidence,77);
});

test("MCQ-equivalent and typed answers both receive model photo/prior-answer context",async()=>{
 const initial=photo();const result=await assessContextAnswer(applyAnswer(initial,"Water reaches my ankles"),initial,initial,"Where does water reach?","Water reaches my ankles",async(_question,_answer,context)=>{
  assert.equal((context?.photoEvidence as {confidence:number}).confidence,49);assert.deepEqual(context?.priorAnswers,[]);
  return {confidenceDelta:3,confidenceReason:"Specific visual landmark",movingWater:false};
 });
 assert.equal(result.contextConfidence,52);assert.equal(result.scene.movingWater,false);
});

test("legacy contradiction cap is repaired by rescoring original answers from the original baseline",async()=>{
 const initial=withRisk({...photo(),comparison:{version:1,baselineId:"mural-underpass-demo-v1",baselineHash:"test",referenceHeightMm:250,scaleBasis:"demo-assumption",primaryReferenceId:null,measurements:[]}});
 const legacy={...initial,confidence:25,photoConfidence:49,contextConfidence:25,answers:[{question:"Where?",answer:"ankle"},{question:"Height?",answer:"170 cm"}],contextEvidence:{contribution:0,reasons:["capped at 25"],contradiction:true}};
 const updated=await reassessContext(legacy,initial,async()=>({confidenceDelta:-2,confidenceReason:"Observation conflicts with the photo.",contradiction:true}));
 assert.equal(updated.contextConfidence,45);assert.equal(updated.demoConfidence,undefined);assert.equal(updated.confidence,49);
 assert.equal(updated.contextEvidence?.adjustments?.length,2);assert.equal(updated.publication,"pending");
});

 test("confidence has a 95 ceiling without an additive boost",()=>{
 const initial=withRisk({...photo(),confidence:94});
 const updated=applyContextAssessment(applyAnswer(initial,"ankle"),{confidenceDelta:3,confidenceReason:"Specific observation"});
 assert.equal(updated.contextConfidence,95);assert.equal(updated.confidence,94);
 });
