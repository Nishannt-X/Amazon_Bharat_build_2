import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Camera, CarFront, Clock3, MapPin, Waves } from "lucide-react";
import { readPublicReportById } from "../../../lib/report-store";
import styles from "./report-detail.module.css";

export const metadata: Metadata = {
  title: "Waterlogging report details",
  description: "View the saved evidence and location for a FloodFlow waterlogging report.",
};

// Report IDs and SQLite rows are request-time data; this page renders per visit.
export const instant = false;

const dateTime = (value: string) => new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", timeZoneName: "short",
}).format(new Date(value));

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await readPublicReportById(id);
  if (!report) notFound();

  const sample = report.provenance === "sample";
  const vehicle = [report.vehicle.make, report.vehicle.model, report.vehicle.year, report.vehicle.variant].filter(Boolean).join(" · ");

  return <div className="ff-report-page">
    <header className="ff-report-header">
      <Link href="/" className="ff-report-brand"><Waves size={23} />FloodFlow<span> / Report details</span></Link>
      <Link href={`/map?report=${encodeURIComponent(report.id)}`} className="ff-report-navLink">View on map <ArrowUpRight size={16} /></Link>
    </header>

    <main className={styles.main}>
      <Link href="/report" className={styles.back}><ArrowLeft size={16} /> Back to reports</Link>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>WATERLOGGING REPORT / {sample ? "EXAMPLE" : "COMMUNITY OBSERVATION"}</p>
          <h1>{report.locationLabel}</h1>
          <p className={styles.intro}>{sample ? "An illustrative report showing how road evidence appears in FloodFlow." : "A community observation saved with a photo and device location."}</p>
        </div>
        <span className={sample ? styles.sampleBadge : styles.communityBadge}>{sample ? "Sample · not live" : "Community report"}</span>
      </div>

      <section className={styles.summary} aria-label="Report at a glance">
        <div><span>Water depth</span><strong>{report.observedDepthCm == null ? "Unknown" : `${report.observedDepthCm} cm`}</strong><small>{sample ? "Illustrative value" : report.analysis?.depthMm != null ? "Evidence estimate · unverified" : "Reported depth · unverified"}</small></div>
        <div><span>Reports at this spot</span><strong>{report.reportCount}</strong><small>Saved observation{report.reportCount === 1 ? "" : "s"}</small></div>
        <div><span>{sample ? "Sample added" : "Last reported"}</span><strong>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(report.reportedAt))}</strong><small>No later update recorded</small></div>
      </section>

      <div className={styles.grid}>
        <section className={styles.evidence} aria-labelledby="evidence-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={report.photoUrl} alt={sample ? "Illustrative waterlogging sample" : `Waterlogging evidence for ${report.locationLabel}`} />
          <div className={styles.evidenceCaption}><Camera size={18} /><div><h2 id="evidence-title">Photo evidence</h2><p>{sample ? "Illustrative image; not captured at this location." : "Submitted photo; location and conditions have not been independently verified."}</p></div></div>
        </section>

        <div className={styles.detailStack}>
          <section className={styles.card} aria-labelledby="location-title">
            <div className={styles.cardHeading}><MapPin size={20} /><h2 id="location-title">Location</h2></div>
            <dl className={styles.facts}>
              <div><dt>Place</dt><dd>{report.locationLabel}</dd></div>
              <div><dt>Coordinates</dt><dd className={styles.mono}>{report.lat.toFixed(5)}, {report.lng.toFixed(5)}</dd></div>
              <div><dt>GPS accuracy</dt><dd>{sample ? "Not applicable to sample" : `±${Math.round(report.gps.accuracyMeters)} m`}</dd></div>
            </dl>
            <Link href={`/map?report=${encodeURIComponent(report.id)}`} className={styles.inlineLink}>See this spot on the map <ArrowUpRight size={16} /></Link>
          </section>

          <section className={styles.card} aria-labelledby="timing-title">
            <div className={styles.cardHeading}><Clock3 size={20} /><h2 id="timing-title">Timing & source</h2></div>
            <dl className={styles.facts}>
              <div><dt>{sample ? "Sample added" : "Reported"}</dt><dd><time dateTime={report.reportedAt}>{dateTime(report.reportedAt)}</time></dd></div>
              <div><dt>Last updated</dt><dd>No later update recorded</dd></div>
              <div><dt>Photo source</dt><dd>{sample ? "Illustrative image" : report.photoSource === "camera" ? "Camera submission" : "Uploaded photo"}</dd></div>
              <div><dt>Report ID</dt><dd className={styles.mono}>{report.id}</dd></div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="vehicle-title">
            <div className={styles.cardHeading}><CarFront size={20} /><h2 id="vehicle-title">Vehicle context</h2></div>
            <p className={styles.vehicle}>{vehicle || "No vehicle details saved for this report."}</p>
          </section>

          {report.analysis ? <section className={styles.card} aria-labelledby="analysis-title">
            <div className={styles.cardHeading}><Waves size={20} /><h2 id="analysis-title">Evidence analysis</h2></div>
            <dl className={styles.facts}>
              <div><dt>Screening result</dt><dd>{report.riskGuidance?.label ?? "Risk uncertain"}</dd></div>
              <div><dt>Evidence quality</dt><dd>{report.analysis.confidence}/100 · not a safety probability</dd></div>
              <div><dt>Depth range</dt><dd>{report.analysis.depthRangeMm ? `${(report.analysis.depthRangeMm[0] / 10).toFixed(1)}–${(report.analysis.depthRangeMm[1] / 10).toFixed(1)} cm` : "Unknown"}</dd></div>
              {report.analysis.streetReference ? <div><dt>Street reference</dt><dd>{report.analysis.streetReference.distanceMeters} m away · heading {Math.round(report.analysis.streetReference.heading)}° · captured {report.analysis.streetReference.capturedAt?.slice(0, 10) ?? "date unknown"} · {report.analysis.streetReference.attribution}</dd></div> : null}
            </dl>
            {report.analysis.scene.explanation ? <p className={styles.analysisNote}>{report.analysis.scene.explanation}</p> : null}
            {report.analysis.notes.length ? <ul className={styles.analysisNotes}>{report.analysis.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
          </section> : null}
        </div>
      </div>

      <aside className={styles.note}>{sample ? "This is a sample report. Its location, depth and photo are illustrative and are excluded from route risk checks." : "This report reflects a past observation. Depth, location and photo are unverified, and road conditions may have changed. Do not use it as a crossing safety assessment."}</aside>
    </main>
  </div>;
}
