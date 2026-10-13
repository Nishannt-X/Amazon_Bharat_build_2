"use client";
import { useEffect, useId, useState } from "react";

export function useJudgeAccess() {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { void fetch("/api/demo-access", { cache: "no-store", signal: controller.signal }).then(r => r.json()).then(data => setUnlocked(data.unlocked === true)).catch(() => {}); };
    refresh();
    window.addEventListener("ff-access-changed", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("ff-access-changed", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  return unlocked;
}

export default function JudgePasscode({ unlocked }: { unlocked: boolean }) {
  const id = useId();
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/demo-access", { method: unlocked ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, ...(unlocked ? {} : { body: JSON.stringify({ passcode }) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Access could not be unlocked.");
      setPasscode(""); setShowPasscode(false); window.dispatchEvent(new Event("ff-access-changed"));
    } catch (err) { setError(err instanceof Error ? err.message : "Access unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="ff-judge-access">
    <label htmlFor={id}>Passcode</label>
    <div className="ff-judge-access-row">
      {unlocked ? <span role="status">Access unlocked</span> : <>
        <input id={id} type={showPasscode ? "text" : "password"} autoComplete="off" maxLength={256} value={passcode} placeholder="Enter passcode" aria-describedby={error ? `${id}-error` : undefined} onChange={e => setPasscode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (passcode && !busy) void submit(); } }} />
        <button type="button" aria-label={showPasscode ? "Hide passcode" : "Show passcode"} aria-controls={id} aria-pressed={showPasscode} onClick={() => setShowPasscode(value => !value)}>{showPasscode ? "Hide" : "Show"}</button>
      </>}
      <button type="button" disabled={busy || (!unlocked && !passcode)} onClick={() => void submit()}>{busy ? "Checking…" : unlocked ? "Lock" : "Unlock"}</button>
    </div>
    {error ? <p id={`${id}-error`} role="alert">{error}</p> : null}
  </div>;
}
