/** A successful local result never launches or pays for a cloud analysis. */
export async function localFirstCv<T>(local:()=>Promise<T>, cloud:()=>Promise<T>, localEnabled=true): Promise<{value:T;engine:"local"|"fargate"}> {
  if (localEnabled) {
    try { return {value:await local(),engine:"local"}; }
    catch { /* Only missing, failed or invalid local processing falls through. */ }
  }
  return {value:await cloud(),engine:"fargate"};
}
