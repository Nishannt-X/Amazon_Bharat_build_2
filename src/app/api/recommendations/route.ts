import { accessDenied } from "../../../lib/demo-access";
import { analysisOwner, boundedJson, sameOrigin } from "../../../lib/analysis-http";
import { readAnalysis } from "../../../lib/analysis-store";
import { publicAnalysis } from "../../../lib/photo-analysis";
import { findNameEntry } from "../../../lib/vehicle-catalog";
import { readVehicleReference } from "../../../lib/vehicle-store";
import { recommendVehicle } from "../../../lib/vehicle-recommendations";
import { guardAccountMutation } from "../../../lib/account-store";
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    if(!sameOrigin(request)) return Response.json({error:"Use this site's reporting form."},{status:403,headers});
    const owner=analysisOwner(request);
    if(!owner) return Response.json({error:"Analysis session expired."},{status:401,headers});
    guardAccountMutation(request, `recommendations:${owner}`, 60);
    const body=await boundedJson(request,4000);
    const analysis=typeof body.analysisId==="string"?readAnalysis(body.analysisId,owner):null;
    if(!analysis) return Response.json({error:"Analysis not found."},{status:404,headers});
    const v=body.vehicle as Record<string,unknown>|undefined;
    if(!v||typeof v.make!=="string"||typeof v.model!=="string"||typeof v.year!=="string"||!/^\d{4}$/.test(v.year)||Number(v.year)<1980||Number(v.year)>new Date().getFullYear()||typeof v.variant!=="string"||v.variant.length>100||!findNameEntry(v.make,v.model)) throw new Error("Select a catalog car and valid year.");
    const stored=readVehicleReference(v.make,v.model);
    const recommendation=await recommendVehicle({analysis:publicAnalysis(analysis),vehicle:{make:v.make,model:v.model,year:v.year,variant:v.variant},...stored});
    return Response.json({recommendation},{headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Recommendation unavailable."},{status:400,headers});}
}
