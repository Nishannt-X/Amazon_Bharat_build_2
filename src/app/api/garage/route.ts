import { accessDenied } from "../../../lib/demo-access";
import { addGarageCar, currentAccount, guardAccountMutation, readGarage } from "../../../lib/account-store";
import { boundedJson } from "../../../lib/analysis-http";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  const account=currentAccount(request);
  return account?Response.json({cars:readGarage(account.id)},{headers}):Response.json({error:"Sign in to access your garage."},{status:401,headers});
}
export async function POST(request:Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  const account=currentAccount(request);
  if(!account) return Response.json({error:"Sign in to save your car."},{status:401,headers});
  try {guardAccountMutation(request,`garage:${account.id}`);return Response.json({cars:addGarageCar(account.id,await boundedJson(request,3000))},{status:201,headers});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"Car could not save."},{status:400,headers});}
}
