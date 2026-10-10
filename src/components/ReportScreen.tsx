"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, Check, ChevronRight, Crosshair, MapPin, RefreshCw, Waves, ArrowLeft, LoaderCircle } from "lucide-react";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES, isAcceptedPhotoType, type PhotoState, type SharedWaterlogReport, type VehicleDetails } from "../lib/report";
import { freshPhotoLocation, watchDeviceLocation, type DeviceFix, type LocationFailure } from "../lib/report-geolocation";
import { fetchSharedReports, publishReport } from "../lib/shared-reports";
import { inIndiaMapArea } from "../lib/map-region";
import { listMakes, suggestModels } from "../lib/vehicle-catalog";
import styles from "./ReportScreen.module.css";
import theme from "./map-experience-theme.module.css";

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false, loading: () => <div className={styles.mapLoading} role="status">Opening India’s waterlogging map…</div> });
type BoundPhoto = PhotoState & { source: "camera"; selectedAt: string };
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
  const [phase, setPhase] = useState<"photo" | "review" | "success">("photo");
  const [photo, setPhoto] = useState<BoundPhoto | null>(null);
  const [photoGps, setPhotoGps] = useState<DeviceFix | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SharedWaterlogReport | null>(null);
  const [observedDepth, setObservedDepth] = useState("");
  const [vehicle, setVehicle] = useState<VehicleDetails>({ make: "", model: "", year: "", variant: "" });
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [tileRetry, setTileRetry] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const stopLocation = useRef<(() => void) | null>(null);
  const latestGps = useRef<DeviceFix | null>(null);
  const generation = useRef(0);
  const photoRef = useRef<BoundPhoto | null>(null);
  const mounted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

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
    setPhoto(null); setPhotoGps(null); setError(""); setChecking(false);
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
      // The entry fix can be old after the camera stays open; bind a fresh fix.
      // A continuously watched fix from the last five seconds is already fresh.
      // Avoid competing location requests on browsers with one active provider.
      const recent = latestGps.current;
      let fix: DeviceFix;
      if (recent && recent.accuracyMeters <= 100 && Date.now() - Date.parse(recent.capturedAt) <= 5000) {
        fix = recent;
      } else {
        stopLocation.current?.();
        fix = await freshPhotoLocation((next) => { if (mounted.current && token === generation.current) { latestGps.current = next; setGps(next); } });
      }
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("Photo could not be read."));
        image.src = url;
      });
      if (!mounted.current || token !== generation.current) { URL.revokeObjectURL(url); return; }
      const next: BoundPhoto = { file, objectUrl: url, name: file.name || "waterlogging.jpg", sizeBytes: file.size, mimeType: file.type, ...dimensions, source: "camera", selectedAt: new Date().toISOString() };
      photoRef.current = next;
      setPhoto(next); setPhotoGps(fix); setGps(fix); setLocationState("ready"); setRecenterSignal((n) => n + 1);
    } catch (failure) {
      URL.revokeObjectURL(url);
      if (mounted.current && token === generation.current) {
        const reason = failure instanceof Error ? failure.message : "unavailable";
        setError(reason in locationMessages ? locationMessages[reason as LocationFailure] : "The photo could not be read. Take it again.");
        if (reason in locationMessages) setLocationState(reason as LocationFailure);
      }
    } finally { if (mounted.current && token === generation.current) setChecking(false); }
  }

  async function submit() {
    if (!photo || !photoGps || saving) return;
    if (Date.now() - Date.parse(photoGps.capturedAt) > 600000) { clearPhoto(); setPhase("photo"); setError("The location attached to this photo expired. Take a new photo here."); return; }
    const depth = observedDepth.trim() === "" ? null : Number(observedDepth);
    if (depth !== null && (!Number.isFinite(depth) || depth < 0 || depth > 300)) { setError("Enter a depth between 0 and 300 cm, or leave it blank."); return; }
    if (vehicle.year && (!/^\d{4}$/.test(vehicle.year) || Number(vehicle.year) < 1980 || Number(vehicle.year) > new Date().getFullYear() + 1)) { setError("Enter a valid vehicle year, or leave it blank."); return; }
    setSaving(true); setError("");
    try {
      const result = await publishReport({ photo, gps: photoGps, reportLat: photoGps.lat, reportLng: photoGps.lng, vehicle, observedDepthCm: depth } as Parameters<typeof publishReport>[0], `${photoGps.lat.toFixed(5)}, ${photoGps.lng.toFixed(5)}`);
      setReports((previous) => [...previous.filter((r) => r.id !== result.id), result]); setSaved(result); setPhase("success"); setFocusedReport(result); setFocusSignal((n) => n + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Please retry."); }
    finally { setSaving(false); }
  }

  const inServiceArea = gps !== null && inIndiaMapArea(gps);
  const precise = inServiceArea && gps !== null && gps.accuracyMeters <= 100 && locationState === "ready";
  const samples = reports.filter((r) => r.provenance === "sample");
  const communityCount = reports.length - samples.length;
  const blocked = locationState in locationMessages;
  const buttonClass = styles.primary;

  return <div className={`${styles.page} ${theme.experience}`}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><Waves size={23} />FloodFlow<span> / Report</span></Link>
      <Link href="/map" className={styles.navLink}>Explore map & routes <ChevronRight size={16} /></Link>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.panel} aria-label="Report a waterlog">
        <div className={styles.panelHeading}><span className={styles.eyebrow}>ON-SITE REPORTING</span><h1>Show us the<br />waterlogging.</h1><p>A photo. Your location.<br />A clearer picture for everyone.</p></div>
        <div className={styles.locationCard} aria-live="polite">
          <div className={styles.locationTop}><span className={styles.locationIcon}>{precise ? <Check size={18} /> : <Crosshair size={18} />}</span><div><strong>{precise ? "You’re on the map" : gps && !inServiceArea ? "Outside the reporting area" : gps ? "Location found · refining accuracy" : blocked ? "Location needs attention" : "Finding your location"}</strong><span>{gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} · ±${Math.round(gps.accuracyMeters)} m` : "Your device positions the report automatically."}</span></div>{!blocked && !gps ? <LoaderCircle className={styles.spinner} size={18} /> : null}</div>
          {gps && !inServiceArea ? <p className={styles.locationHelp}>This prototype covers India. Your device returned a position outside its reporting area, so the map stays over India.</p> : null}
          {blocked ? <><p className={styles.locationHelp}>{locationMessages[locationState as LocationFailure]}</p><details className={styles.permissionHelp}><summary>Location settings help</summary><p>In Safari: Settings → Websites → Location → Allow for localhost. On your Mac: System Settings → Privacy & Security → Location Services → enable Safari.</p><p>On a phone, enable Location Services and allow precise location for your browser.</p></details><button onClick={startLocation} className={styles.textButton}><RefreshCw size={15} />Retry location</button></> : null}
          {gps && inServiceArea && !precise && !blocked ? <p className={styles.locationHelp}>Your area is visible. Waiting for accuracy within 100 m to attach your photo.</p> : null}
        </div>
        <div className={styles.steps} aria-label="Report progress"><span aria-current={phase === "photo" ? "step" : undefined}><b>{phase !== "photo" ? <Check size={12} /> : "1"}</b>Capture</span><i /><span aria-current={phase === "review" ? "step" : undefined}><b>{phase === "success" ? <Check size={12} /> : "2"}</b>Review</span><i /><span aria-current={phase === "success" ? "step" : undefined}><b>3</b>On the map</span></div>
        <div className={styles.formBody}>
          {phase === "photo" ? <section>
            <h2 ref={heading}>Capture what you see.</h2><p className={styles.help}>Take a photo of the waterlogged road from where you are. Your report stays at this location.</p>
            {photo ? <div className={styles.preview}>
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={photo.objectUrl} alt="Your waterlogging photo" /><div><span><Check size={14} />Photo and location attached</span><button onClick={() => { clearPhoto(); cameraInput.current?.click(); }}>Retake</button></div></div> : <button className={styles.capture} onClick={() => cameraInput.current?.click()} disabled={!precise || checking} aria-label="Take a photo"><span className={styles.cameraCircle}>{checking ? <LoaderCircle className={styles.spinner} size={28} /> : <Camera size={28} />}</span><strong>{checking ? "Attaching photo & location…" : "Take a photo"}</strong><span>{precise ? "Opens your camera" : "Available once your location is ready"}</span></button>}
            <div className={styles.smallNote}><MapPin size={15} /><span>Location comes from your device. Tapping the map never moves your report.</span></div>
          </section> : null}
          {phase === "review" && photo && photoGps ? <section>
            <button className={styles.textButton} onClick={() => { setPhase("photo"); setError(""); }} disabled={saving}><ArrowLeft size={15} />Back to photo</button>
            <h2>Ready to add your report?</h2><div className={styles.reviewPhoto}>
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={photo.objectUrl} alt="Photo to publish" /><span><MapPin size={14} />{photoGps.lat.toFixed(4)}, {photoGps.lng.toFixed(4)}</span></div>
            <label className={styles.field}>Water depth <span>Optional · only if measured</span><div className={styles.depthInput}><input type="number" min="0" max="300" step="0.1" value={observedDepth} onChange={(e) => setObservedDepth(e.target.value)} placeholder="Unknown" aria-label="Measured water depth" disabled={saving} /><span>cm</span></div></label>
            <details className={styles.vehicleDetails}><summary>Add vehicle context <span>Optional</span></summary><p className={styles.help}>If a vehicle appears in your photo, add its details.</p><div className={styles.vehicleGrid}>{(["make", "model", "year", "variant"] as const).map((key) => <label className={styles.field} key={key}>{key === "make" ? "Manufacturer" : key[0].toUpperCase() + key.slice(1)}<input value={vehicle[key]} onChange={(e) => setVehicle((v) => ({ ...v, [key]: e.target.value }))} maxLength={key === "year" ? 4 : 60} placeholder={key === "year" ? "e.g. 2024" : "Optional"} list={key === "make" || key === "model" ? `report-${key}-options` : undefined} disabled={saving} /></label>)}</div><datalist id="report-make-options">{listMakes().map((make) => <option key={make} value={make} />)}</datalist><datalist id="report-model-options">{suggestModels(vehicle.make).map((model) => <option key={model} value={model} />)}</datalist></details>
            <p className={styles.smallNote}>Your photo, location and time will be visible on the map. Reports are observations, not crossing-safety assessments.</p>
          </section> : null}
          {phase === "success" && saved ? <section className={styles.success}><span className={styles.successIcon}><Check size={26} /></span><h2>Your report is on the map.</h2><p>Saved to the database. Anyone using this app can open its pin and see your photo.</p><Link href={`/map?report=${saved.id}`} className={styles.textButton}>View report & plan a route <ChevronRight size={16} /></Link></section> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </div>
        <div className={styles.actions}>
          {phase === "photo" ? <button className={buttonClass} disabled={!photo || checking} onClick={() => { setPhase("review"); setError(""); }}>Review report <ChevronRight size={18} /></button> : phase === "review" ? <button className={buttonClass} disabled={saving} onClick={() => void submit()}>{saving ? <LoaderCircle className={styles.spinner} size={18} /> : <MapPin size={18} />}{saving ? "Saving your report…" : "Add to the map"}</button> : <button className={buttonClass} onClick={() => { clearPhoto(); setPhase("photo"); setSaved(null); setObservedDepth(""); setVehicle({ make: "", model: "", year: "", variant: "" }); startLocation(); }}>Report another waterlog <Camera size={18} /></button>}
          <span>{phase === "photo" ? "Camera first. A short review. You’re done." : "Keep yourself out of the water while reporting."}</span>
        </div>
      </aside>
      <main className={styles.map} aria-label="India waterlogging map">
        <MapComponent mode="report" reportingLocked gps={gps} reportPin={photoGps} onReportPinChange={() => {}} recenterSignal={recenterSignal} overviewSignal={overviewSignal} reports={reports} heatMode={heatMode} focusPin={focusedReport} focusPinSignal={focusSignal} tileRetrySignal={tileRetry} onTilesUnavailable={setTilesUnavailable} />
        <div className={styles.mapToolbar}><div><span className={styles.liveDot} /><strong>India waterlogging</strong><span>{communityCount} community · {samples.length} sample</span></div><button onClick={() => { setOverviewSignal((n) => n + 1); }} aria-label="Show India overview">India overview</button></div>
        <div className={styles.mapTools}><button onClick={() => { if (gps) setRecenterSignal((n) => n + 1); else startLocation(); }} aria-label="Recenter map on my position"><Crosshair size={19} /></button><button onClick={() => setShowIncidents((v) => !v)} aria-expanded={showIncidents}>Reported spots <b>{reports.length}</b></button></div>
        {showIncidents ? <div className={styles.incidentList} aria-label="Reported spots">{reports.map((report) => <button key={report.id} onClick={() => { setFocusedReport(report); setFocusSignal((n) => n + 1); }}><Waves size={18} /><span><strong>{report.locationLabel}</strong><small>{report.provenance === "sample" ? "Sample incident" : "Community report"} · {report.observedDepthCm == null ? "Depth unknown" : `${report.observedDepthCm} cm reported`}</small></span><ChevronRight size={15} /></button>)}</div> : null}
        <div className={styles.legend}><div><Waves size={17} /><strong>Zoom in for report pins. Zoom out for heat.</strong></div><fieldset><legend>Heatmap</legend><label><input type="radio" name="report-heat" checked={heatMode === "depth"} onChange={() => setHeatMode("depth")} />Water depth</label><label><input type="radio" name="report-heat" checked={heatMode === "density"} onChange={() => setHeatMode("density")} />Report density</label></fieldset><p>{heatMode === "depth" ? "Stronger blue = more water · Grey = unknown depth" : "Stronger blue = more reported spots"}</p><small>Six illustrative samples. Community observations remain unverified.</small></div>
        {feedError || tilesUnavailable ? <div role="status" className={styles.mapError}>{feedError || "Map tiles unavailable. Reports and your location remain visible."}{tilesUnavailable ? <button onClick={() => { setTilesUnavailable(false); setTileRetry((n) => n + 1); }}>Retry map</button> : null}</div> : null}
      </main>
    </div>
    {/* Persistent picker: the camera opens only after an explicit user gesture. */}
    <input ref={cameraInput} type="file" accept={ACCEPTED_PHOTO_TYPES.join(",")} capture="environment" aria-label="Take a photo with camera" hidden onChange={(e) => void attachPhoto(e.target.files?.[0])} />
  </div>;
}
