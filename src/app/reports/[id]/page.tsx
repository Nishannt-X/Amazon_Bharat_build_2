import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Camera,
  CarFront,
  Clock3,
  History,
  Layers,
  MapPin,
  Waves,
  Zap,
} from "lucide-react";
import ThemeToggle from "../../../components/ThemeToggle";
import { readHotspotIncidentById } from "../../../lib/report-store";
import styles from "./report-detail.module.css";

export const metadata: Metadata = {
  title: "Hotspot Incident Details · FloodFlow",
  description: "View consolidated flood observations, AI evidence analysis, and historical logs at this waterlogging hotspot.",
};

export const instant = false;

const dateTimeFull = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  }).format(new Date(value));

const dateTimeCompact = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incident = await readHotspotIncidentById(id);
  if (!incident) notFound();

  const primary = incident.primaryReport;
  const isSample = primary.provenance === "sample";
  const vehicle = [
    primary.vehicle.make,
    primary.vehicle.model,
    primary.vehicle.year,
    primary.vehicle.variant,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.pageRoot + " ff-themed"}>
      {/* FloodFlow Theme Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <Waves size={24} className={styles.brandIcon} aria-hidden="true" />
            <span>
              FloodFlow <span className={styles.brandSub}>/ Hotspot Incident</span>
            </span>
          </Link>
          <div className={styles.headerActions}>
            <ThemeToggle />
            <Link
              href={`/map?report=${encodeURIComponent(primary.id)}`}
              className={styles.mapLink}
            >
              View on map <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <Link href="/report" className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to report radar
        </Link>

        {/* Hotspot Header */}
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>
              WATERLOGGING HOTSPOT / {isSample ? "BENCHMARK SAMPLE" : "COMMUNITY OBSERVATION"}
              {incident.reports[0]?.id === primary.id ? (
                <span className={styles.latestHeroPill}>
                  <Zap size={12} aria-hidden="true" /> Latest Observation
                </span>
              ) : null}
            </p>
            <h1>{primary.locationLabel}</h1>
            <p className={styles.intro}>
              {isSample
                ? "An illustrative benchmark report showing how road evidence appears in FloodFlow."
                : `Consolidated hotspot pinger representing ${incident.reportCount} observation${incident.reportCount === 1 ? "" : "s"} within a 40m radius on this road segment.`}
            </p>
          </div>

          <div className={styles.badgeGroup}>
            {incident.activeReportsCount > 0 ? (
              <span className={styles.liveBadge}>
                <span className={styles.pulseDot} aria-hidden="true" />
                Active Hotspot · {incident.activeReportsCount} Live Report{incident.activeReportsCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className={styles.historicalBadge}>
                Receded / Historical Spot
              </span>
            )}
            <span className={styles.countPill}>
              {incident.reportCount} Total ({incident.activeReportsCount} active · {incident.pastReportsCount} past)
            </span>
          </div>
        </div>

        {/* 4-Item KPI Summary Grid */}
        <section className={styles.summary} aria-label="Hotspot at a glance">
          <div>
            <span>Peak water depth</span>
            <strong>
              {incident.peakDepthCm != null ? `${incident.peakDepthCm} cm` : "Unknown"}
            </strong>
            <small>
              {isSample
                ? "Illustrative benchmark value"
                : incident.reports.length > 1
                  ? `Peak recorded across ${incident.reports.length} observations`
                  : "Reported depth · unverified"}
            </small>
          </div>

          <div>
            <span>Reports at this spot</span>
            <strong>{incident.reportCount}</strong>
            <small>
              {incident.activeReportsCount} active · {incident.pastReportsCount} historical in archive
            </small>
          </div>

          <div>
            <span>Latest observation</span>
            <strong>{dateTimeCompact(primary.reportedAt)}</strong>
            <small>Observation recorded</small>
          </div>

          <div>
            <span>Cluster radius</span>
            <strong>40 m zone</strong>
            <small>Anti-clutter consolidated pinger</small>
          </div>
        </section>

        {/* 2-Column Grid */}
        <div className={styles.grid}>
          {/* Left Column: Primary Evidence Photo & All Reports at Spot */}
          <div>
            <section className={styles.evidence} aria-labelledby="evidence-title">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={primary.photoUrl}
                alt={
                  isSample
                    ? "Illustrative waterlogging sample"
                    : `Waterlogging evidence for ${primary.locationLabel}`
                }
              />
              <div className={styles.evidenceCaption}>
                <Camera size={20} aria-hidden="true" />
                <div>
                  <h2 id="evidence-title">Latest Photo Evidence</h2>
                  <p>
                    {isSample
                      ? "Illustrative benchmark photo for vehicle clearance screening."
                      : `Submitted for ${primary.locationLabel}. Captured ${dateTimeFull(primary.reportedAt)}.`}
                  </p>
                </div>
              </div>
            </section>

            {/* All Reports at this Spot (Hotspot Timeline) */}
            <section className={styles.historySection} aria-labelledby="history-title">
              <div className={styles.historyHeader}>
                <div className={styles.historyTitle}>
                  <History size={20} className={styles.brandIcon} aria-hidden="true" />
                  <h2 id="history-title">
                    Reports at this Spot ({incident.reportCount})
                  </h2>
                </div>
                <span className={styles.countPill}>
                  <Layers size={13} aria-hidden="true" />
                  40m Clustered Pinger
                </span>
              </div>
              <p className={styles.historySubtitle}>
                All citizen observations recorded at this spot. Past reports that have expired naturally from the live map remain preserved in the permanent DynamoDB archive.
              </p>

              <div className={styles.observationList}>
                {incident.reports.map((obs, idx) => {
                  const isCurrent = obs.id === id;
                  const obsVehicle = [
                    obs.vehicle?.make,
                    obs.vehicle?.model,
                    obs.vehicle?.year,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <Link
                      key={obs.id}
                      href={`/reports/${encodeURIComponent(obs.id)}`}
                      className={styles.observationCard}
                      style={
                        isCurrent
                          ? { borderColor: "var(--accent-ink)", background: "var(--surface)" }
                          : undefined
                      }
                      title={`View observation #${idx + 1} details`}
                    >
                      {obs.photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={obs.photoUrl}
                          alt={`Observation #${idx + 1} evidence`}
                          className={styles.obsThumb}
                        />
                      ) : (
                        <div className={styles.obsPlaceholder}>
                          <Camera size={20} />
                        </div>
                      )}

                      <div className={styles.obsInfo}>
                        <div className={styles.obsHeaderLine}>
                          <div className={styles.obsIndexRow}>
                            <span className={styles.obsIndex}>
                              #{idx + 1}
                            </span>
                            {idx === 0 ? (
                              <span className={styles.latestBadge}>
                                <Zap size={11} aria-hidden="true" />
                                Latest
                              </span>
                            ) : null}
                            {isCurrent ? (
                              <span className={styles.viewingBadge}>
                                Viewing
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={
                              obs.isActive
                                ? styles.obsStatusActive
                                : styles.obsStatusPast
                            }
                          >
                            {obs.isActive ? "Live Active" : "Past / Expired"}
                          </span>
                          <span className={styles.obsTime}>
                            {dateTimeFull(obs.reportedAt)}
                          </span>
                        </div>

                        <div className={styles.obsMetrics}>
                          <span className={styles.obsDepth}>
                            {obs.observedDepthCm != null
                              ? `${obs.observedDepthCm} cm depth`
                              : "Depth unknown"}
                          </span>
                          {obsVehicle ? (
                            <span className={styles.obsVehicle}>
                              🚗 {obsVehicle}
                            </span>
                          ) : null}
                          {obs.analysis?.confidence ? (
                            <span className={styles.obsModel}>
                              AI Confidence: {obs.analysis.confidence}/100
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.obsAction}>
                        <span>{isCurrent ? "Active" : "Inspect"}</span>
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Right Column: Incident Details Stack */}
          <div className={styles.detailStack}>
            {/* Location Card */}
            <section className={styles.card} aria-labelledby="location-title">
              <div className={styles.cardHeading}>
                <MapPin size={20} aria-hidden="true" />
                <h2 id="location-title">Location Intelligence</h2>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>Place</dt>
                  <dd>{primary.locationLabel}</dd>
                </div>
                <div>
                  <dt>Coordinates</dt>
                  <dd className={styles.mono}>
                    {primary.lat.toFixed(5)}, {primary.lng.toFixed(5)}
                  </dd>
                </div>
                <div>
                  <dt>GPS Accuracy</dt>
                  <dd>
                    {isSample
                      ? "Not applicable to sample"
                      : `±${Math.round(primary.gps.accuracyMeters)} m`}
                  </dd>
                </div>
                <div>
                  <dt>Incident Spot Radius</dt>
                  <dd>40 m anti-clutter cluster</dd>
                </div>
              </dl>
              <Link
                href={`/map?report=${encodeURIComponent(primary.id)}`}
                className={styles.inlineLink}
              >
                Center this spot on map <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </section>

            {/* Vehicle Context Card */}
            <section className={styles.card} aria-labelledby="vehicle-title">
              <div className={styles.cardHeading}>
                <CarFront size={20} aria-hidden="true" />
                <h2 id="vehicle-title">Vehicle Context</h2>
              </div>
              <p className={styles.vehicle}>
                {vehicle || "No vehicle details saved for this observation."}
              </p>
            </section>

            {/* AI Model Evidence Analysis Card */}
            {primary.analysis ? (
              <section className={styles.card} aria-labelledby="analysis-title">
                <div className={styles.cardHeading}>
                  <Waves size={20} aria-hidden="true" />
                  <h2 id="analysis-title">Bedrock & CV Evidence Analysis</h2>
                </div>
                <dl className={styles.facts}>
                  <div>
                    <dt>Screening Result</dt>
                    <dd>{primary.riskGuidance?.label ?? "Risk uncertain"}</dd>
                  </div>
                  <div>
                    <dt>Evidence Quality</dt>
                    <dd>{primary.analysis.confidence}/100 · confidence score</dd>
                  </div>
                  <div>
                    <dt>Estimated Depth Range</dt>
                    <dd>
                      {primary.analysis.depthRangeMm
                        ? `${(primary.analysis.depthRangeMm[0] / 10).toFixed(1)}–${(primary.analysis.depthRangeMm[1] / 10).toFixed(1)} cm`
                        : "Unknown"}
                    </dd>
                  </div>
                  {primary.analysis.comparison?.baselineLabel ? (
                    <div>
                      <dt>Baseline Reference</dt>
                      <dd>{primary.analysis.comparison.baselineLabel}</dd>
                    </div>
                  ) : null}
                </dl>
                {primary.analysis.scene.explanation ? (
                  <p className={styles.analysisNote}>
                    {primary.analysis.scene.explanation}
                  </p>
                ) : null}

              </section>
            ) : null}

            {/* Timing & Source Card */}
            <section className={styles.card} aria-labelledby="timing-title">
              <div className={styles.cardHeading}>
                <Clock3 size={20} aria-hidden="true" />
                <h2 id="timing-title">Timing & Provenance</h2>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>{isSample ? "Sample added" : "Latest report"}</dt>
                  <dd>
                    <time dateTime={primary.reportedAt}>
                      {dateTimeFull(primary.reportedAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Photo Source</dt>
                  <dd>
                    {isSample
                      ? "Illustrative image"
                      : primary.photoSource === "camera"
                        ? "Live Camera Submission"
                        : "Uploaded Photo"}
                  </dd>
                </div>
                <div>
                  <dt>Spot ID</dt>
                  <dd className={styles.mono}>{primary.id}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>

        {/* Advisory Banner */}
        <aside className={styles.note}>
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            {isSample
              ? "This is a sample benchmark report. Its location, depth and photo are illustrative and excluded from live route routing."
              : "This hotspot reflects aggregated community observations. Road water conditions can fluctuate rapidly with rainfall and drainage. Do not use as a definitive crossing safety guarantee."}
          </span>
        </aside>
      </main>
    </div>
  );
}
