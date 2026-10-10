import type { ReportDraft, SharedWaterlogReport } from "./report";

export interface ReportPage {
  reports: SharedWaterlogReport[];
  nextCursor: string | null;
  total: number;
  scope: "single-server";
}

export async function fetchReportPage(cursor?: string, signal?: AbortSignal): Promise<ReportPage> {
  const query = new URLSearchParams({ limit: "500" });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/reports?${query}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Shared reports could not be loaded. Please retry.");
  return response.json();
}

export async function fetchSharedReports(signal?: AbortSignal): Promise<SharedWaterlogReport[]> {
  const reports: SharedWaterlogReport[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchReportPage(cursor, signal);
    reports.push(...page.reports);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return reports;
}

export async function publishReport(draft: ReportDraft, locationLabel: string): Promise<SharedWaterlogReport> {
  const form = new FormData();
  form.set("photo", draft.photo.file);
  form.set("metadata", JSON.stringify({
    gps: draft.gps, reportLat: draft.reportLat, reportLng: draft.reportLng,
    vehicle: draft.vehicle, locationLabel,
    photoSource: (draft.photo as typeof draft.photo & { source?: string }).source ?? "upload",
    observedDepthCm: (draft as ReportDraft & { observedDepthCm?: number | null }).observedDepthCm ?? null,
  }));
  const response = await fetch("/api/reports", { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Report could not be published. Please retry.");
  return body.report;
}
