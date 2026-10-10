"use client";

import { MapPin, Trash2 } from "lucide-react";
import { groupLocalReports, type LocalFloodReport } from "../lib/report";
import ReportTimestamp from "./ReportTimestamp";

export default function LocalReportsList({ reports, selectedId, onSelect, onDelete }: {
  reports: LocalFloodReport[];
  selectedId: string | null;
  onSelect: (report: LocalFloodReport) => void;
  onDelete: (id: string) => void;
}) {
  if (!reports.length) return null;
  return (
    <section aria-labelledby="local-reports-heading" className="mt-6 border-t border-border pt-4">
      <h2 id="local-reports-heading" tabIndex={-1} className="text-lg font-semibold">Reports in this tab ({reports.length})</h2>
      <p className="ff-help mt-1">Select a report to see its marker and photo. These reports are not shared.</p>
      <ul className="mt-3 space-y-2">
        {groupLocalReports(reports).map((group) => (
          <li key={group.id}>
            {group.reports.length > 1 ? <p className="mb-2 text-sm font-medium">{group.reports.length} reports near this spot <span className="text-foreground-secondary">· within 25 m of the first pin</span></p> : null}
            <ul className="space-y-2">
            {group.reports.map((report) => (
          <li key={report.id} className={`ff-plate overflow-hidden ${selectedId === report.id ? "!border-accent" : ""}`}>
            <button type="button" onClick={() => onSelect(report)} aria-pressed={selectedId === report.id}
              aria-label={`View local report at ${report.locationLabel}`}
              className="flex min-h-11 w-full min-w-0 gap-3 p-3 text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={report.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{report.locationLabel}</span>
                <span className="block truncate text-sm text-foreground-secondary">{report.vehicle.make} {report.vehicle.model} · {report.vehicle.year}</span>
                <ReportTimestamp reportedAt={report.reportedAt} />
                <span className="mt-1 inline-flex items-center gap-1 text-sm text-accent"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> View on map</span>
              </span>
            </button>
            <div className="flex items-center justify-between gap-2 border-t border-border px-3">
              <span className="text-xs text-foreground-secondary">Local only · Unable to assess</span>
              <button type="button" onClick={() => onDelete(report.id)} aria-label={`Delete local report at ${report.locationLabel}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-danger">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
              </button>
            </div>
          </li>
            ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
