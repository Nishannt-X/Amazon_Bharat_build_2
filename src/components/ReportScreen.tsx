"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, Check, ChevronRight, Crosshair, MapPin, RefreshCw, Waves, LoaderCircle, ScanLine, UserRound } from "lucide-react";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES, isAcceptedPhotoType, type PhotoState, type SharedWaterlogReport, type VehicleDetails } from "../lib/report";
import { freshPhotoLocation, watchDeviceLocation, type DeviceFix, type LocationFailure } from "../lib/report-geolocation";
import { fetchSharedReports, publishReport } from "../lib/shared-reports";
import { inIndiaMapArea } from "../lib/map-region";
import VehicleContextPanel from "./VehicleContextPanel";
import styles from "./ReportScreen.module.css";
import theme from "./map-experience-theme.module.css";

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false, loading: () => <div className={styles.mapLoading} role="status">Opening India’s waterlogging map…</div> });
type BoundPhoto = PhotoState & { source: "upload"; selectedAt: string };
type LocationState = "locating" | "ready" | "approximate" | LocationFailure;
const locationMessages: Record<LocationFailure, string> = {
  denied: "Location permission is blocked. Allow this website to access your location, then retry.",
  unavailable: "Your device could not provide a location. Check device Location Services and your connection, then retry.",
  timeout: "Your device hasn’t returned a location yet. Check Location Services, then retry.",
  inaccurate: "We found your area, but need a more precise fix before attaching a photo. Try again near a window or outdoors.",
};

export default function ReportScreen({ initialReporting = true }: { initialReporting?: boolean }) {
  const [reports, setReports] = useState<SharedWaterlogReport[]>([]);
  const [feedError, setFeedError] = useState("");
  const [gps, setGps] = useState<DeviceFix | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("locating");
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [overviewSignal, setOverviewSignal] = useState(0);
  const [focusedReport, setFocusedReport] = useState<SharedWaterlogReport | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [heatMode, setHeatMode] = useState<"depth" | "density">("depth");
  const [showIncidents, setShowIncidents] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [cvBypassed, setCvBypassed] = useState(false);
  const [guest, setGuest] = useState(false);
  const [loginNotice, setLoginNotice] = useState(false);
  const [photo, setPhoto] = useState<BoundPhoto | null>(null);
  const [photoGps, setPhotoGps] = useState<DeviceFix | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SharedWaterlogReport | null>(null);

  const [vehicle, setVehicle] = useState<VehicleDetails>({ make: "", model: "", year: "", variant: "" });
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [tileRetry, setTileRetry] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const stopLocation = useRef<(() => void) | null>(null);
  const latestGps = useRef<DeviceFix | null>(null);
  const generation = useRef(0);
  const photoRef = useRef<BoundPhoto | null>(null);
  const mounted = useRef(false);
  const cvFrame = useRef<HTMLElement>(null);
  const accessFrame = useRef<HTMLElement>(null);

  useEffect(() => {
    mounted.current = true;
    // The report entry always requests permission; the separate map is browse-only.
    const timer = setTimeout(() => startLocation(), 0);
    return () => { mounted.current = false; generation.current += 1; clearTimeout(timer); stopLocation.current?.(); if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl); };
    // Entry mode does not change the on-site reporting contract.
  }, [initialReporting]);

  useEffect(() => {
    let stopped = false;
    let busy = false;
    const controller = new AbortController();
    const load = async () => {
      if (busy) return;
      busy = true;
      try { const data = await fetchSharedReports(controller.signal); if (!stopped) { setReports(data); setFeedError(""); } }
      catch { if (!stopped) setFeedError("Reports could not refresh. Showing the last loaded map."); }
      finally { busy = false; }
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, []);

  function startLocation() {
    stopLocation.current?.();
    setLocationState("locating");
    let centered = false;
    let precise = false;
    stopLocation.current = watchDeviceLocation((fix) => {
      if (!mounted.current) return;
      latestGps.current = fix;
      setGps(fix);
      setLocationState(fix.accuracyMeters <= 100 ? "ready" : "approximate");
      if (!centered || (!precise && fix.accuracyMeters <= 100)) { setRecenterSignal((n) => n + 1); centered = true; }
      precise = fix.accuracyMeters <= 100;
    }, (reason) => { if (mounted.current) setLocationState(reason); });
  }

  function clearPhoto() {
    generation.current += 1;
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
    photoRef.current = null;
    setPhoto(null); setPhotoGps(null); setError(""); setChecking(false); setCvOpen(false); setCvBypassed(false); setGuest(false); setLoginNotice(false); setSaved(null); setVehicle({ make: "", model: "", year: "", variant: "" });
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function attachPhoto(file?: File) {
    if (!file) return;
    clearPhoto();
    const token = ++generation.current;
    if (!isAcceptedPhotoType(file.type) || file.size > MAX_PHOTO_BYTES) { setError("Use a JPEG, PNG or WebP photo up to 10 MB."); return; }
    setChecking(true);
    const url = URL.createObjectURL(file);
    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("Photo could not be read."));
        image.src = url;
      });
      if (!mounted.current || token !== generation.current) { URL.revokeObjectURL(url); return; }
      const next: BoundPhoto = { file, objectUrl: url, name: file.name || "waterlogging.jpg", sizeBytes: file.size, mimeType: file.type, ...dimensions, source: "upload", selectedAt: new Date().toISOString() };
      photoRef.current = next;
      setPhoto(next); setCvOpen(true);
      requestAnimationFrame(() => { cvFrame.current?.scrollIntoView({ behavior: "smooth", block: "start" }); cvFrame.current?.focus({ preventScroll: true }); });
      // The entry fix can be old after the camera stays open; bind a fresh fix.
      // A continuously watched fix from the last five seconds is already fresh.
      // Avoid competing location requests on browsers with one active provider.
      const recent = latestGps.current;
      let fix: DeviceFix;
      if (recent && recent.accuracyMeters <= 100 && Date.now() - Date.parse(recent.capturedAt) <= 5000) {
        fix = recent;
      } else {
        stopLocation.current?.();
        fix = await freshPhotoLocation((nextFix) => { if (mounted.current && token === generation.current) { latestGps.current = nextFix; setGps(nextFix); } });
      }
      if (!mounted.current || token !== generation.current) return;
      setPhotoGps(fix); setGps(fix); setLocationState("ready"); setRecenterSignal((n) => n + 1);
    } catch (failure) {
      if (photoRef.current?.objectUrl !== url) URL.revokeObjectURL(url);
      if (mounted.current && token === generation.current) {
        const reason = failure instanceof Error ? failure.message : "unavailable";
        setError(reason in locationMessages ? locationMessages[reason as LocationFailure] : "The photo could not be read. Upload another photo.");
        if (reason in locationMessages) setLocationState(reason as LocationFailure);
      }
    } finally { if (mounted.current && token === generation.current) setChecking(false); }
  }

  async function submit() {
    if (!photo || !photoGps || saving) return;
    if (!cvBypassed || !guest || !vehicle.model || !vehicle.year) { setError("Choose your vehicle model and age before sharing."); return; }
    if (Date.now() - Date.parse(photoGps.capturedAt) > 600000) { clearPhoto(); setError("The location attached to this photo expired. Upload a new photo here."); return; }
    const depth = null;
    if (!/^\d{4}$/.test(vehicle.year) || Number(vehicle.year) < 1980 || Number(vehicle.year) > new Date().getFullYear()) { setError("Enter a valid whole-year vehicle age before sharing."); return; }
    setSaving(true); setError("");
    try {
      const result = await publishReport({ photo, gps: photoGps, reportLat: photoGps.lat, reportLng: photoGps.lng, vehicle, observedDepthCm: depth } as Parameters<typeof publishReport>[0], `${photoGps.lat.toFixed(5)}, ${photoGps.lng.toFixed(5)}`);
      setReports((previous) => [...previous.filter((r) => r.id !== result.id), result]); setSaved(result); setFocusedReport(result); setFocusSignal((n) => n + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Please retry."); }
    finally { setSaving(false); }
  }

  const inServiceArea = gps !== null && inIndiaMapArea(gps);
  const precise = inServiceArea && gps !== null && gps.accuracyMeters <= 100 && locationState === "ready";
  const samples = reports.filter((r) => r.provenance === "sample");
  const communityCount = reports.length - samples.length;
  const blocked = locationState in locationMessages;


  return <div className={`${styles.page} ${theme.experience}`}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><Waves size={23} />FloodFlow<span> / Report</span></Link>
      <Link href="/map" className={styles.navLink}>Explore map & routes <ChevronRight size={16} /></Link>
    </header>
    {cvOpen && photo ? <section className={styles.cvFrame} ref={cvFrame} tabIndex={-1} aria-labelledby="cv-heading">
      <div className={styles.cvImage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.objectUrl} alt="Uploaded waterlogging evidence" />
        <span>YOUR UPLOADED PHOTO</span>
      </div>
      <div className={styles.cvContent}><span className={styles.eyebrow}><ScanLine size={16} />PHOTO ANALYSIS</span><h1 id="cv-heading">A closer look.<br /> Your road, in context.</h1><p>Computer vision will live here. For now, bypass this step to explore your vehicle context.</p><div className={styles.cvStatus}>{cvBypassed ? <Check size={17} /> : <ScanLine size={17} />}<span>{cvBypassed ? "Analysis bypassed · no water-depth estimate generated" : "Computer vision is not connected yet"}</span></div><button className={styles.primary} onClick={() => { setCvBypassed(true); requestAnimationFrame(() => { accessFrame.current?.scrollIntoView({ behavior: "smooth", block: "center" }); accessFrame.current?.focus({ preventScroll: true }); }); }}>Bypass <ChevronRight size={18} /></button></div>
    </section> : null}
    <main>
      <section className={styles.map} aria-label="India waterlogging map">
        <MapComponent mode="report" reportingLocked gps={gps} reportPin={photoGps} onReportPinChange={() => {}} recenterSignal={recenterSignal} overviewSignal={overviewSignal} reports={reports} heatMode={heatMode} focusPin={focusedReport} focusPinSignal={focusSignal} tileRetrySignal={tileRetry} onTilesUnavailable={setTilesUnavailable} />
        <div className={styles.mapToolbar}><div><span className={styles.liveDot} /><strong>India waterlogging</strong><span>{communityCount} community · {samples.length} sample</span></div><button onClick={() => { setOverviewSignal((n) => n + 1); }} aria-label="Show India overview">India overview</button></div>
        <div className={styles.mapTools}><button onClick={() => { if (gps) setRecenterSignal((n) => n + 1); else startLocation(); }} aria-label="Recenter map on my position"><Crosshair size={19} /></button><button onClick={() => setShowIncidents((v) => !v)} aria-expanded={showIncidents}>Reported spots <b>{reports.length}</b></button></div>
        {showIncidents ? <div className={styles.incidentList} aria-label="Reported spots">{reports.map((report) => <button key={report.id} onClick={() => { setFocusedReport(report); setFocusSignal((n) => n + 1); }}><Waves size={18} /><span><strong>{report.locationLabel}</strong><small>{report.provenance === "sample" ? "Sample incident" : "Community report"} · {report.observedDepthCm == null ? "Depth unknown" : `${report.observedDepthCm} cm reported`}</small></span><ChevronRight size={15} /></button>)}</div> : null}
        <div className={styles.legend}><div><Waves size={17} /><strong>Zoom in for report pins. Zoom out for heat.</strong></div><fieldset><legend>Heatmap</legend><label><input type="radio" name="report-heat" checked={heatMode === "depth"} onChange={() => setHeatMode("depth")} />Water depth</label><label><input type="radio" name="report-heat" checked={heatMode === "density"} onChange={() => setHeatMode("density")} />Report density</label></fieldset><p>{heatMode === "depth" ? "Stronger blue = more water · Grey = unknown depth" : "Stronger blue = more reported spots"}</p><small>Six illustrative samples. Community observations remain unverified.</small></div>
        {feedError || tilesUnavailable ? <div role="status" className={styles.mapError}>{feedError || "Map tiles unavailable. Reports and your location remain visible."}{tilesUnavailable ? <button onClick={() => { setTilesUnavailable(false); setTileRetry((n) => n + 1); }}>Retry map</button> : null}</div> : null}
      </section>
      <section className={styles.reportBody} aria-label="Report a waterlog">
        <div className={styles.uploadHeading}><div><span className={styles.eyebrow}>REPORT A WATERLOG</span><h2>A photo starts the picture.</h2><p>Upload the waterlogged road you can see. We attach your current device location.</p></div><span className={styles.stepLabel}>01 / PHOTO</span></div>
        <div className={styles.uploadRow}><button className={styles.primary} onClick={() => cameraInput.current?.click()} disabled={checking || saving}><Camera size={20} />Upload picture</button><span>{checking ? "Attaching current location…" : photo ? `${photo.name} · photo uploaded` : "JPEG, PNG or WebP · up to 10 MB"}</span></div>
        <div className={styles.locationCard} aria-live="polite"><div className={styles.locationTop}><span className={styles.locationIcon}>{precise ? <Check size={18} /> : <Crosshair size={18} />}</span><div><strong>{photoGps ? "Photo location attached" : precise ? "Your current location is ready" : gps && !inServiceArea ? "Outside India’s reporting area" : gps ? "Refining your location" : blocked ? "Location needs attention" : "Finding your current location"}</strong><span>{gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} · ±${Math.round(gps.accuracyMeters)} m` : "Allow location access so your report belongs to the place you are."}</span></div>{!blocked && !gps ? <LoaderCircle className={styles.spinner} size={18} /> : null}</div>
        {blocked ? <><p className={styles.locationHelp}>{locationMessages[locationState as LocationFailure]} You can explore the flow; sharing needs an accurate location.</p><details className={styles.permissionHelp}><summary>Location settings help</summary><p>In Safari: Settings → Websites → Location → Allow for localhost. On your Mac: System Settings → Privacy & Security → Location Services → enable Safari.</p><p>On a phone, enable Location Services and allow precise location for your browser.</p></details><button onClick={startLocation} className={styles.textButton}><RefreshCw size={15} />Retry location</button></> : null}
        {gps && !inServiceArea ? <p className={styles.locationHelp}>Reports cover India. The map stays over India when a device returns a position outside this area.</p> : null}
        <p className={styles.locationHelp}>An uploaded photo is not proof of where it was taken. GPS records your location when you upload.</p></div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <section className={styles.contextSection} ref={accessFrame} tabIndex={-1} aria-label="Your vehicle context">
          {!guest ? <><div className={styles.lockedPreview} aria-hidden="true"><div className={styles.previewColumns}><div><span className={styles.eyebrow}>YOUR VEHICLE</span><h3>The details that matter.</h3><div className={styles.placeholderField}>Select a car model</div><div className={styles.placeholderField}>Vehicle age</div></div><div><span className={styles.eyebrow}>VEHICLE CONTEXT</span><h3>A clearer picture.</h3><div className={styles.placeholderStats}><span>Estimated value</span><span>Ground clearance</span><span>Vehicle specifications</span></div></div></div><div className={styles.placeholderRisk}><h3>Risk & confidence</h3><p>Your vehicle context and evidence, brought together.</p></div></div><div className={styles.accessGate}><span className={styles.gateIcon}><UserRound size={22} /></span><h2>Your vehicle. Your context.</h2><p>{!photo ? "Upload a photo to begin, then continue as a guest." : !cvBypassed ? "Use Bypass in the photo frame above to continue." : "Continue as a guest to choose your car and explore its details."}</p><div className={styles.accessButtons}><button className={styles.secondary} disabled={!photo || !cvBypassed} onClick={() => setLoginNotice(true)}>Login</button><button className={styles.primary} disabled={!photo || !cvBypassed} onClick={() => { setGuest(true); setLoginNotice(false); }}>Continue as guest</button></div>{loginNotice ? <p role="status" className={styles.loginNotice}>Login is not connected yet. Continue as a guest to keep going.</p> : null}</div></> : <><div className={styles.contextHeading}><span className={styles.eyebrow}>02 / YOUR VEHICLE</span><span className={styles.guestBadge}><UserRound size={14} />Guest session</span></div><VehicleContextPanel onVehicleChange={setVehicle} /><section className={styles.publishSection}><div><h2>Keep the report on the map.</h2><p>Share your uploaded photo, current GPS location and selected vehicle. Photo analysis was bypassed; no depth or safety score is saved.</p></div>{saved ? <div role="status" className={styles.saved}><Check size={20} /><div><strong>Report saved to the database.</strong><Link href={`/map?report=${saved.id}`}>View your report <ChevronRight size={15} /></Link></div></div> : <button className={styles.primary} disabled={!photoGps || !inIndiaMapArea(photoGps) || checking || saving || !vehicle.model || !vehicle.year} onClick={() => void submit()}>{saving ? <LoaderCircle className={styles.spinner} size={18} /> : <MapPin size={18} />}{saving ? "Saving report…" : "Share waterlog report"}</button>}{!photoGps ? <p className={styles.smallNote}>Sharing unlocks after an accurate current location is attached. Retry location, then upload again if needed.</p> : !vehicle.model || !vehicle.year ? <p className={styles.smallNote}>Choose your vehicle model and age before sharing.</p> : null}</section></>}
        </section>
      </section>
    </main>
    {/* Persistent picker: selecting a photo requires an explicit user gesture. */}
    <input ref={cameraInput} type="file" accept={ACCEPTED_PHOTO_TYPES.join(",")} aria-label="Upload waterlogging picture" hidden onChange={(e) => void attachPhoto(e.target.files?.[0])} />
  </div>;
}
