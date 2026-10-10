"use client";

// @refresh reset

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, Check, ChevronRight, Crosshair, MapPin, RefreshCw, Waves, LoaderCircle, ScanLine, UserRound } from "lucide-react";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES, isAcceptedPhotoType, type PhotoState, type SharedWaterlogReport, type VehicleDetails } from "../lib/report";
import { freshPhotoLocation, watchDeviceLocation, type DeviceFix, type LocationFailure } from "../lib/report-geolocation";
import { fetchSharedReports, publishReport } from "../lib/shared-reports";
import { approximateLocationNote, usableRecenterFix } from "../lib/recenter-fix";
import { inIndiaMapArea } from "../lib/map-region";
import ThemeToggle from "./ThemeToggle";
import VehicleContextPanel from "./VehicleContextPanel";

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false, loading: () => <div className="ff-report-mapLoading" role="status">Opening India’s waterlogging map…</div> });
type BoundPhoto = PhotoState & { source: "upload"; selectedAt: string };
type LocationState = "locating" | "ready" | "approximate" | LocationFailure;
const locationMessages: Record<LocationFailure, string> = {
  denied: "Location is blocked for this site, and browsers won’t show the permission prompt again on their own. Open your browser’s site settings (the icon beside the address), set Location to Allow, then tap Try location again.",
  unavailable: "Your device could not provide a location. Check device Location Services and your connection, then retry.",
  timeout: "Your device hasn’t returned a location yet. Check Location Services, then retry.",
  "no-response": "The browser didn’t answer the location request. Tap Use my location to ask again, and choose Allow if a prompt appears.",
  inaccurate: "We found your area, but need a more precise fix before attaching a photo. Try again near a window or outdoors.",
};

// Browsers only expose location on HTTPS or localhost; read lazily, after an error.
const insecureContext = () => typeof window !== "undefined" && !window.isSecureContext;

export default function ReportScreen({ initialReporting = true }: { initialReporting?: boolean }) {
  const [reports, setReports] = useState<SharedWaterlogReport[]>([]);
  const [feedError, setFeedError] = useState("");
  const [gps, setGps] = useState<DeviceFix | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("locating");
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [focusedReport, setFocusedReport] = useState<SharedWaterlogReport | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [showIncidents, setShowIncidents] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [cvBypassed, setCvBypassed] = useState(false);
  const [guest, setGuest] = useState(false);
  const [loginNotice, setLoginNotice] = useState(false);
  const [photo, setPhoto] = useState<BoundPhoto | null>(null);
  const [photoGps, setPhotoGps] = useState<DeviceFix | null>(null);
  const [checking, setChecking] = useState(false);
  const [bindingLocation, setBindingLocation] = useState(false);
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
  const freshAbort = useRef<AbortController | null>(null);
  const freshSignal = () => { freshAbort.current?.abort(); freshAbort.current = new AbortController(); return freshAbort.current.signal; };
  const photoRef = useRef<BoundPhoto | null>(null);
  const mounted = useRef(false);
  const cvFrame = useRef<HTMLElement>(null);
  const accessFrame = useRef<HTMLElement>(null);

  useEffect(() => {
    mounted.current = true;
    // Ask on load (the browser prompts only if permission is undecided); the crosshair and
    // retry buttons ask again from a click. startLocation stops any previous request first.
    startLocation();
    return () => { mounted.current = false; generation.current += 1; freshAbort.current?.abort(); stopLocation.current?.(); if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl); };
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

  // Replaces any in-flight request, so load and click never run two acquisitions at once.
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
      setError((previous) => (Object.values(locationMessages).includes(previous) ? "" : previous));
      if (!centered || (!precise && fix.accuracyMeters <= 100)) { setRecenterSignal((n) => n + 1); centered = true; }
      precise = precise || fix.accuracyMeters <= 100;
    }, (reason) => { if (mounted.current) setLocationState(reason); });
  }

  // The crosshair centres on a recent device fix only. A stale or missing one is dropped and
  // re-acquired; the photo-bound fix (photoGps) is left untouched so publishing still needs a precise one.
  function recenterOnMe() {
    setRecenterSignal((n) => n + 1);
    if (usableRecenterFix(latestGps.current)) return;
    if (bindingLocation) return;
    latestGps.current = null; setGps(null);
    startLocation();
  }

  function clearPhoto() {
    generation.current += 1;
    freshAbort.current?.abort();
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
    photoRef.current = null;
    setPhoto(null); setPhotoGps(null); setError(""); setChecking(false); setBindingLocation(false); setCvOpen(false); setCvBypassed(false); setGuest(false); setLoginNotice(false); setSaved(null); setVehicle({ make: "", model: "", year: "", variant: "" });
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function attachPhoto(file?: File) {
    if (!file) return;
    // Reset first so the same file can be chosen again, even after a rejection.
    if (cameraInput.current) cameraInput.current.value = "";
    // A rejected pick keeps the current photo and any pending location binding untouched.
    if (!isAcceptedPhotoType(file.type) || file.size > MAX_PHOTO_BYTES) { setError("Use a JPEG, PNG or WebP photo up to 10 MB."); return; }
    const token = ++generation.current;
    setChecking(true); setError(""); setBindingLocation(false);
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
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
      photoRef.current = next;
      setPhoto(next); setPhotoGps(null); setCvOpen(true); setCvBypassed(false); setGuest(false); setLoginNotice(false); setSaved(null); setVehicle({ make: "", model: "", year: "", variant: "" });
      setChecking(false);
      setBindingLocation(true);
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
        fix = await freshPhotoLocation((nextFix) => { if (mounted.current && token === generation.current) { latestGps.current = nextFix; setGps(nextFix); } }, freshSignal());
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
    } finally { if (mounted.current && token === generation.current) { setChecking(false); setBindingLocation(false); } }
  }

  async function retryPhotoLocation() {
    if (!photoRef.current || bindingLocation || checking) return;
    const token = generation.current;
    setBindingLocation(true); setError(""); setLocationState("locating");
    stopLocation.current?.();
    try {
      const fix = await freshPhotoLocation((nextFix) => { if (mounted.current && token === generation.current) { latestGps.current = nextFix; setGps(nextFix); } }, freshSignal());
      if (!mounted.current || token !== generation.current) return;
      latestGps.current = fix; setGps(fix); setPhotoGps(fix); setLocationState("ready"); setRecenterSignal((n) => n + 1);
    } catch (failure) {
      if (!mounted.current || token !== generation.current) return;
      const reason = failure instanceof Error ? failure.message : "unavailable";
      setError(reason in locationMessages ? locationMessages[reason as LocationFailure] : "Location could not be attached. Retry when Location Services are available.");
      if (reason in locationMessages) setLocationState(reason as LocationFailure);
    } finally { if (mounted.current && token === generation.current) setBindingLocation(false); }
  }

  async function submit() {
    if (!photo || !photoGps || saving) return;
    if (!cvBypassed || !guest || !vehicle.model || !vehicle.year) { setError("Choose your vehicle model and age before sharing."); return; }
    if (Date.now() - Date.parse(photoGps.capturedAt) > 600000) { setPhotoGps(null); setError("The location attached to this photo expired. Retry location to attach a fresh one; your photo stays here."); return; }
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
  const blocked = locationState in locationMessages;


  return <div className="ff-report-page ff-themed">
    <header className="ff-report-header">
      <Link href="/" className="ff-report-brand"><Waves size={23} />FloodFlow<span> / Report</span></Link>
      <div className="ff-report-headerEnd"><Link href="/map" className="ff-report-navLink">Explore map & routes <ChevronRight size={16} /></Link><ThemeToggle /></div>
    </header>
    <main>
      <section className="ff-report-map" aria-label="India waterlogging map" style={{ position: "relative", width: "100%", height: "clamp(380px, 65dvh, 720px)", flexShrink: 0, isolation: "isolate", overflow: "hidden" }}>
        <MapComponent mode="report" reportingLocked gps={gps} reportPin={photoGps} onReportPinChange={() => {}} recenterSignal={recenterSignal} reports={reports} focusPin={focusedReport} focusPinSignal={focusSignal} tileRetrySignal={tileRetry} onTilesUnavailable={setTilesUnavailable} />
        <div className="ff-report-mapTools"><button onClick={recenterOnMe} aria-label="Recenter map on my position"><Crosshair size={19} /></button><button onClick={() => setShowIncidents((v) => !v)} aria-expanded={showIncidents}>Spots <b>{reports.length}</b></button></div>
        {showIncidents ? <div className="ff-report-incidentList" aria-label="Reported spots">{reports.map((report) => <button key={report.id} onClick={() => { setFocusedReport(report); setFocusSignal((n) => n + 1); setShowIncidents(false); }}><Waves size={18} /><span><strong>{report.locationLabel}</strong><small>{report.provenance === "sample" ? "Sample incident" : "Community report"} · {report.observedDepthCm == null ? "Depth unknown" : `${report.observedDepthCm} cm reported`}</small></span><ChevronRight size={15} /></button>)}</div> : null}
        {feedError || tilesUnavailable ? <div role="status" className="ff-report-mapError">{feedError || "Map tiles unavailable. Reports and your location remain visible."}{tilesUnavailable ? <button onClick={() => { setTilesUnavailable(false); setTileRetry((n) => n + 1); }}>Retry map</button> : null}</div> : null}
      </section>
      <section className="ff-report-reportBody" aria-label="Report a waterlog">
        <div className="ff-report-uploadHeading"><div><h2>Upload photo</h2><p>Your current location is attached automatically.</p></div></div>
        <div className="ff-report-uploadRow"><button className="ff-report-primary" onClick={() => cameraInput.current?.click()} disabled={checking || saving}><Camera size={20} />{photo ? "Replace picture" : "Upload picture"}</button><span>{checking ? "Opening photo…" : bindingLocation ? "Photo ready · attaching current location…" : photo ? `${photo.name} · photo uploaded` : "JPEG, PNG or WebP · up to 10 MB"}</span></div>
    {cvOpen && photo ? <section className="ff-report-cvFrame" ref={cvFrame} tabIndex={-1} aria-labelledby="cv-heading">
      <div className="ff-report-cvImage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.objectUrl} alt="Uploaded waterlogging evidence" />
        <span>YOUR UPLOADED PHOTO</span>
      </div>
      <div className="ff-report-cvContent"><h2 id="cv-heading">Preview your photo</h2><p>Check that the waterlogged road is visible. Your full photo is shown here.</p><p className="ff-report-photoMeta">{photo.name} · {(photo.sizeBytes / 1024 / 1024).toFixed(1)} MB · {photo.width} × {photo.height}</p><div className="ff-report-cvStatus">{cvBypassed ? <Check size={17} /> : <ScanLine size={17} />}<span>{cvBypassed ? "Photo selected · no water-depth estimate generated" : "Photo analysis is unavailable. No depth or safety score is generated."}</span></div><div className="ff-report-photoActions"><button className="ff-report-secondary" disabled={checking || saving} onClick={() => cameraInput.current?.click()}>Replace photo</button><button className="ff-report-textButton" disabled={saving} onClick={clearPhoto}>Remove photo</button></div><button className="ff-report-primary" disabled={cvBypassed} onClick={() => { setCvBypassed(true); requestAnimationFrame(() => { accessFrame.current?.scrollIntoView({ behavior: "smooth", block: "center" }); accessFrame.current?.focus({ preventScroll: true }); }); }}>{cvBypassed ? "Photo confirmed" : "Use this photo"} <ChevronRight size={18} /></button></div>
    </section> : null}
        <div className="ff-report-locationCard" aria-live="polite"><div className="ff-report-locationTop"><span className="ff-report-locationIcon">{precise ? <Check size={18} /> : <Crosshair size={18} />}</span><div><strong>{photoGps ? "Photo location attached" : precise ? "Your current location is ready" : gps && !inServiceArea ? "Outside India’s reporting area" : gps ? "Refining your location" : blocked ? "Location needs attention" : "Finding your current location"}</strong><span>{gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} · ±${Math.round(gps.accuracyMeters)} m` : "Allow location access so your report belongs to the place you are."}</span></div>{!blocked && !gps ? <LoaderCircle className="ff-report-spinner" size={18} /> : null}</div>
        {blocked ? <><p className="ff-report-locationHelp">{locationState === "unavailable" && insecureContext() ? "Location needs a secure (HTTPS) address on phones; only localhost is exempt. Open the HTTPS link." : locationMessages[locationState as LocationFailure]} You can preview your photo and vehicle; publishing needs an accurate location.</p><details className="ff-report-permissionHelp"><summary>Location settings help</summary><p>In your browser’s site settings, allow Location for this website. On a computer, also check that system Location Services are on for your browser.</p><p>On a phone, enable Location Services and allow precise location for your browser.</p></details></> : null}
        {blocked || (photo && !photoGps && !checking) ? <button disabled={bindingLocation || checking} onClick={() => photo ? void retryPhotoLocation() : startLocation()} className="ff-report-textButton"><RefreshCw size={15} />{bindingLocation ? "Attaching location…" : locationState === "denied" ? "Try location again" : locationState === "no-response" || locationState === "unavailable" || locationState === "timeout" ? "Use my location" : "Retry location"}</button> : null}
        {approximateLocationNote(gps) ? <p className="ff-report-locationHelp">{approximateLocationNote(gps)} A photo can only be shared with a precise fix.</p> : null}
        {gps && !inServiceArea ? <p className="ff-report-locationHelp">Reports cover India. The map stays over India when a device returns a position outside this area.</p> : null}
        </div>
        {error && !(blocked && Object.values(locationMessages).includes(error)) ? <p role="alert" className="ff-report-error">{error}</p> : null}
        <section className="ff-report-contextSection" ref={accessFrame} tabIndex={-1} aria-label="Your vehicle context">
          {!guest ? <><div className="ff-report-lockedPreview" aria-hidden="true"><div className="ff-report-previewColumns"><div><h3>The details that matter.</h3><div className="ff-report-placeholderField">Select a car model</div><div className="ff-report-placeholderField">Vehicle age</div></div><div><h3>A clearer picture.</h3><div className="ff-report-placeholderStats"><span>Estimated value</span><span>Ground clearance</span><span>Vehicle specifications</span></div></div></div><div className="ff-report-placeholderRisk"><h3>Risk & confidence</h3><p>Your vehicle context and evidence, brought together.</p></div></div><div className="ff-report-accessGate"><span className="ff-report-gateIcon"><UserRound size={22} /></span><h2>Your vehicle. Your context.</h2><p>{!photo ? "Upload a photo to begin, then continue as a guest." : !cvBypassed ? "Confirm your photo above to continue." : "Continue as a guest to choose your car and explore its details."}</p><div className="ff-report-accessButtons"><button className="ff-report-secondary" disabled={!photo || !cvBypassed} onClick={() => setLoginNotice(true)}>Login</button><button className="ff-report-primary" disabled={!photo || !cvBypassed} onClick={() => { setGuest(true); setLoginNotice(false); }}>Continue as guest</button></div>{loginNotice ? <p role="status" className="ff-report-loginNotice">Login is not connected yet. Continue as a guest to keep going.</p> : null}</div></> : <><div className="ff-report-contextHeading"><span /><span className="ff-report-guestBadge"><UserRound size={14} />Guest session</span></div><VehicleContextPanel onVehicleChange={setVehicle} /><section className="ff-report-publishSection"><div><h2>Keep the report on the map.</h2><p>Shares your photo, current location and vehicle. No depth or safety score is saved.</p></div>{saved ? <div role="status" className="ff-report-saved"><Check size={20} /><div><strong>Report saved to the database.</strong><Link href={`/map?report=${saved.id}`}>View your report <ChevronRight size={15} /></Link></div></div> : <button className="ff-report-primary" disabled={!photoGps || !inIndiaMapArea(photoGps) || checking || bindingLocation || saving || !vehicle.model || !vehicle.year} onClick={() => void submit()}>{saving ? <LoaderCircle className="ff-report-spinner" size={18} /> : <MapPin size={18} />}{saving ? "Saving report…" : "Share waterlog report"}</button>}{!photoGps ? <p className="ff-report-smallNote">Sharing unlocks after an accurate current location is attached. Retry location to attach a fix to this photo. Your selected photo stays here.</p> : !vehicle.model || !vehicle.year ? <p className="ff-report-smallNote">Choose your vehicle model and age before sharing.</p> : null}</section></>}
        </section>
      </section>
    </main>
    {/* Persistent picker: selecting a photo requires an explicit user gesture. */}
    <input ref={cameraInput} type="file" accept={ACCEPTED_PHOTO_TYPES.join(",")} aria-label="Upload waterlogging picture" hidden onChange={(e) => void attachPhoto(e.target.files?.[0])} />
  </div>;
}
