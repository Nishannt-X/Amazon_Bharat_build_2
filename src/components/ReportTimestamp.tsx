"use client";

import { useEffect, useState } from "react";
import { reportAgeLabel } from "../lib/report";

export default function ReportTimestamp({ reportedAt }: { reportedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return <time dateTime={reportedAt} title={new Date(reportedAt).toLocaleString("en-IN")} className="block text-xs text-foreground-secondary">
    {reportAgeLabel(reportedAt, now)} · {new Date(reportedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
  </time>;
}
