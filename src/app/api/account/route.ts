import { accessDenied } from "../../../lib/demo-access";
import { authenticate, createAccount, createSession, currentAccount, guardAccountMutation, readGarage, revokeSession, sessionCookie } from "../../../lib/account-store";
import { boundedJson, guestEvidenceOwner } from "../../../lib/analysis-http";
import { claimGuestAnalyses } from "../../../lib/analysis-store";
import { claimGuestReports } from "../../../lib/report-store";
const headers = {"Cache-Control":"no-store"};
export async function GET(request: Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  const account = currentAccount(request);
  return Response.json({account,cars:account?readGarage(account.id):[],emailVerification:"not-configured"}, {headers});
}
export async function POST(request: Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    const body = await boundedJson(request, 4000);
    const email = typeof body.email==="string" ? body.email.trim().toLowerCase() : "invalid";
    // Email bucket persists across cookie changes; origin prevents browser CSRF.
    guardAccountMutation(request, `credentials:${email}`);
    guardAccountMutation(request, "account-service", 120);
    if(body.action!=="register" && body.action!=="login") throw new Error("Choose login or registration.");
    const account = body.action==="register" ? await createAccount(body.email,body.password) : await authenticate(body.email,body.password);
    if(!account) return Response.json({error:"Email or password is incorrect."},{status:401,headers});
    const guest = guestEvidenceOwner(request);
    if(guest && !currentAccount(request)) { claimGuestAnalyses(guest,account.id); claimGuestReports(guest,account.id); }
    revokeSession(request);
    const token = createSession(account);
    const responseHeaders = new Headers(headers);
    responseHeaders.append("Set-Cookie",sessionCookie(request,token));
    responseHeaders.append("Set-Cookie","ff_evidence=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return Response.json({account,cars:readGarage(account.id),emailVerification:"not-configured"},{headers:responseHeaders});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"Account request failed."},{status:400,headers});
  }
}
export async function DELETE(request: Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    guardAccountMutation(request,`logout:${currentAccount(request)?.id ?? "guest"}`);
    revokeSession(request);
    const responseHeaders = new Headers(headers);
    responseHeaders.append("Set-Cookie",sessionCookie(request,null));
    responseHeaders.append("Set-Cookie","ff_evidence=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return Response.json({account:null,cars:[]},{headers:responseHeaders});
  } catch(error) {return Response.json({error:error instanceof Error?error.message:"Logout failed."},{status:400,headers});}
}
