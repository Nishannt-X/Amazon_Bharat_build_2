"use client";
import { useState } from "react";
import type { Account, GarageCar } from "../lib/account-store";
export default function AccountForm({onAccount}:{onAccount:(account:Account,cars:GarageCar[])=>void}) {
  const [mode,setMode]=useState<"login"|"register">("login");
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");
    try {const response=await fetch("/api/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:mode,email,password})});const data=await response.json();if(!response.ok)throw new Error(data.error);setPassword("");onAccount(data.account,data.cars);}
    catch(e){setError(e instanceof Error?e.message:"Account request failed.");}finally{setBusy(false);}
  }
  return <form className="ff-account-form" onSubmit={submit}>
    <strong>{mode==="register"?"Create your account":"Sign in to your garage"}</strong>
    <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete={mode==="register"?"new-password":"current-password"} required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <small>Use 12–128 characters. Email delivery and verification are not configured.</small>
    {error&&<p role="alert" className="ff-report-error">{error}</p>}
    <button disabled={busy} type="submit">{busy?"Please wait…":mode==="register"?"Register":"Sign in"}</button>
    <button disabled={busy} type="button" onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}}>{mode==="login"?"Create an account":"Already registered? Sign in"}</button>
  </form>;
}
