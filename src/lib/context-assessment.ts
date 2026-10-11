import {applyAnswer,applyContextAssessment,withRisk,type AnalysisResult} from "./photo-analysis";
import {evaluateObservationAnswer,type AnswerContextExtraction} from "./aws/bedrock";
type Evaluator=(question:string,answer:string,context?:Record<string,unknown>)=>Promise<AnswerContextExtraction|null>;

export async function assessContextAnswer(current:AnalysisResult,previous:AnalysisResult,photo:AnalysisResult,question:string,answer:string,evaluate:Evaluator=evaluateObservationAnswer):Promise<AnalysisResult> {
 let assessment:AnswerContextExtraction|null=null;
 try {
  assessment=await evaluate(question,answer,{
   photoEvidence:{depthMm:photo.depthMm,depthRangeMm:photo.depthRangeMm,confidence:photo.photoConfidence??photo.confidence,scene:photo.scene},
   priorAnswers:previous.answers,
   scoreBefore:current.contextConfidence,
   newObservation:{scene:current.scene,citizenDepthRangeMm:current.citizenDepthRangeMm,possibleContradiction:current.contextEvidence?.contradiction},
  });
 } catch { /* No guessed adjustment when the cloud is unavailable. */ }
 const scene={...current.scene};
 if(typeof assessment?.movingWater==="boolean")scene.movingWater=assessment.movingWater;
 if(typeof assessment?.roadSurfaceVisible==="boolean")scene.roadSurfaceVisible=assessment.roadSurfaceVisible;
 if(assessment?.hazardsToAdd?.length)scene.hazards=Array.from(new Set([...scene.hazards,...assessment.hazardsToAdd]));
 return applyContextAssessment(withRisk({...current,scene}),assessment);
}

/** Reassess existing answers from the immutable photo snapshot, never from a legacy hard cap. */
export async function reassessContext(current:AnalysisResult,photo:AnalysisResult,evaluate:Evaluator=evaluateObservationAnswer):Promise<AnalysisResult> {
 let updated:AnalysisResult=withRisk({...photo,answers:[],confidence:photo.photoConfidence??photo.confidence,contextConfidence:undefined,contextEvidence:undefined});
 for(const item of current.answers.slice(0,4)) {
  const previous=updated;
  updated=applyAnswer(updated,item.answer);
  updated={...updated,answers:[...updated.answers.slice(0,-1),item]};
  updated=await assessContextAnswer(updated,previous,photo,item.question,item.answer,evaluate);
 }
 return updated;
}
