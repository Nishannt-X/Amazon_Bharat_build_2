"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  MapPin,
  RefreshCw,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  isAcceptedPhotoType,
  type SharedWaterlogReport,
  type GpsFix,
  type PhotoState,
  type ReportPin,
  type VehicleDetails,
} from "../lib/report";
import MapHero from "./MapHero";
import { fetchSharedReports, publishReport } from "../lib/shared-reports";
import {
  listMakes,
  lookupVehicleSpecs,
  suggestModels,
  toSpecDisplay,
} from "../lib/vehicle-catalog";

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex h-full w-full items-center justify-center bg-surface-sunken text-base text-foreground-secondary"
    >
      Loading map…
    </div>
  ),
});

const CURRENT_YEAR = new Date().getFullYear();

type LocationStage =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "inaccurate"
  | "timeout";

type BoundGps = GpsFix & { capturedAt: string };
type BoundPhoto = PhotoState & { source: "camera" | "upload"; selectedAt: string };

type Phase = "location" | "photo" | "vehicle" | "summary";

const PHASE_LABELS: { id: Phase; label: string }[] = [
  { id: "location", label: "Location" },
  { id: "photo", label: "Photo" },
  { id: "vehicle", label: "Vehicle" },
  { id: "summary", label: "Summary" },
];

const LOCATION_COPY: Record<
  Exclude<LocationStage, "idle" | "requesting" | "granted">,
  string
> = {
  denied:
    "Location permission was denied. Reporting needs your current GPS position. Enable location and try again.",
  unavailable:
    "Your position is unavailable right now. Reporting needs your current GPS position. Enable location and try again.",
  inaccurate: "GPS accuracy must be within 100 m to bind this photo. Move to a place with a clearer sky view and try again.",
  timeout:
    "Finding your position took too long. Reporting needs your current GPS position. Enable location and try again.",
};

function decodePhoto(
  file: File,
): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap !== "undefined") {
    return createImageBitmap(file).then((bitmap) => {
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    });
  }
  return new Promise((resolve, reject) => {
    // Decode-only temporary URL, distinct from the preview object URL owned
    // by the caller. Revoking here never touches the visible preview.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode-failed"));
    };
    img.src = url;
  });
}

export default function ReportScreen({ initialReporting = false }: { initialReporting?: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [sharedReports, setSharedReports] = useState<SharedWaterlogReport[]>([]);
  const [sharedFeedLoaded, setSharedFeedLoaded] = useState(false);
  const [sharedFeedError, setSharedFeedError] = useState("");

  useEffect(() => {
    let stopped = false;
    let loading = false;
    const controller = new AbortController();
    async function refreshReports() {
      if (loading) return;
      loading = true;
      try {
        const reports = await fetchSharedReports(controller.signal);
        if (!stopped) {
          setSharedReports(reports);
          setSharedFeedLoaded(true);
          setSharedFeedError("");
        }
      } catch {
        if (!stopped) setSharedFeedError("Community reports could not refresh. Previous reports are kept; retrying automatically.");
      } finally { loading = false; }
    }
    void refreshReports();
    const timer = setInterval(() => void refreshReports(), 15000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, []);
  const [reporting, setReporting] = useState(initialReporting);
  const [observedDepth, setObservedDepth] = useState("");
  const [photoGps, setPhotoGps] = useState<BoundGps | null>(null);
  const [phase, setPhase] = useState<Phase>("location");
  const [photo, setPhoto] = useState<BoundPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoChecking, setPhotoChecking] = useState(false);
  const [gps, setGps] = useState<BoundGps | null>(null);
  const [locationStage, setLocationStage] = useState<LocationStage>("idle");
  const [reportPin, setReportPin] = useState<ReportPin | null>(null);
  const [reportNotice, setReportNotice] = useState("");
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [tileRetrySignal, setTileRetrySignal] = useState(0);
  const [recenterSignal, setRecenterSignal] = useState(0);
  /** Search-selection focus: only a future provider result bumps this, so the
   *  map recenters to the chosen pin. Manual drag/click never touches it. */
  const [focusPin, setFocusPin] = useState<ReportPin | null>(null);
  const [focusPinSignal, setFocusPinSignal] = useState(0);
  const [vehicle, setVehicle] = useState<VehicleDetails>({
    make: "",
    model: "",
    year: "",
    variant: "",
  });
  const [vehicleErrors, setVehicleErrors] = useState<Partial<VehicleDetails>>(
    {},
  );
  const [panelExpanded, setPanelExpanded] = useState(initialReporting);
  /** Set when the header photo button is tapped before the spot exists:
   *  the location step explains, and the next tap opens the camera. */
  const [awaitingPhoto, setAwaitingPhoto] = useState(false);

  /** Names-only suggestions from the structured catalog (never spec-implying;
   *  ambiguous names such as "Himalayan" stay bare, no generation/year).
   *  Model options narrow to the typed manufacturer when it matches a known
   *  make; freeform input is always preserved. */
  const makeSuggestions = listMakes();
  const modelSuggestions = suggestModels(vehicle.make);
  /** Honest spec boundary: exact normalized make/model/year/variant lookup
   *  against curated verified rows (currently empty), so every spec reads
   *  "Not available" instead of an ad-hoc value. */
  const specDisplay = toSpecDisplay(
    lookupVehicleSpecs({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      variant: vehicle.variant,
    }),
  );
  const specOrUnknown = (value: string) =>
    value === "Not available" ? "not available" : value;

  const cameraInputRef = useRef<HTMLInputElement>(null);
  /** Current step heading: focused after an actual phase change so keyboard
   *  and screen-reader users land on the new step. Never touched on mount. */
  const phaseHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const isFirstPhaseRender = useRef(true);
  const makeInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const yearInputRef = useRef<HTMLInputElement | null>(null);
  const variantInputRef = useRef<HTMLInputElement | null>(null);
  /** True once vehicle validation has been attempted: individual fields
   *  revalidate as they change from then on. Reset with the report. */
  const vehicleAttemptedRef = useRef(false);
  const photoRef = useRef<PhotoState | null>(null);
  const mountedRef = useRef(true);
  const locatingRef = useRef(false);
  const locationRequestId = useRef(0);
  const uploadId = useRef(0);
  const autoLocationStarted = useRef(false);
  useEffect(() => {
    if (!initialReporting || autoLocationStarted.current) return;
    autoLocationStarted.current = true;
    // Start after mount; browsing the map never asks for location.
    const timer = setTimeout(() => requestLocation(), 0);
    return () => { clearTimeout(timer); autoLocationStarted.current = false; };
  // The entry mode is fixed for this mounted screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReporting]);

  useEffect(() => {
    photoRef.current = photo;
  }, [photo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Invalidate any in-flight location or upload callbacks.
      locationRequestId.current += 1;
      uploadId.current += 1;
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
    };
  }, []);

  const phaseIndex = PHASE_LABELS.findIndex((p) => p.id === phase);

  // After an actual phase change (never on initial mount), move focus to the
  // new step heading. preventScroll avoids a scroll jump or map focus theft;
  // the heading itself is the announcement, so no duplicate live region.
  useEffect(() => {
    if (isFirstPhaseRender.current) {
      isFirstPhaseRender.current = false;
      return;
    }
    phaseHeadingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  /** Clear both picker values so picking the same file again still fires
   *  a change event (lets a failed validation be retried with the same file). */
  function resetPickerValues() {
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleFile(file: File | undefined, source: "camera" | "upload") {
    if (!file) return;
    if (!reporting) {
      setPhotoError("Confirm that this photo shows the waterlogging where you are now.");
      resetPickerValues();
      return;
    }
    // Invalidate FIRST, before validation: an earlier valid selection that
    // is still decoding must not complete after this attempt's error and
    // dismiss it, set a photo, or clear the checking state. The token below
    // is this attempt's; only it may write photo/error/checking state.
    removePhoto();
    const id = ++uploadId.current;
    setPhotoError(null);
    if (!isAcceptedPhotoType(file.type)) {
      // Invalid selection: keep any previously accepted photo until a valid
      // replacement arrives; reset checking coherently and free the pickers
      // for a same-file retry.
      setPhotoChecking(false);
      setPhotoError(
        "That file type is not supported. Use JPEG, PNG, or WebP.",
      );
      resetPickerValues();
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoChecking(false);
      setPhotoError("That photo is too large. Choose a photo up to 10 MB.");
      resetPickerValues();
      return;
    }
    setPhotoChecking(true);
    const url = URL.createObjectURL(file);
    try {
      const selectedAt = new Date().toISOString();
      // Bind a new, uncached fix when evidence is selected. A camera picker
      // may stay open for minutes, so the entry fix cannot locate the photo.
      const fix = await acquireGps();
      const dims = await decodePhoto(file);
      if (!mountedRef.current || id !== uploadId.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
      setPhotoGps(fix);
      setGps(fix);
      setReportPin({ lat: fix.lat, lng: fix.lng });
      setLocationStage("granted");
      setRecenterSignal((n) => n + 1);
      setPhoto({
        source, selectedAt,
        file,
        objectUrl: url,
        name: file.name || "flood photo",
        sizeBytes: file.size,
        mimeType: file.type,
        width: dims.width,
        height: dims.height,
      });
    } catch {
      URL.revokeObjectURL(url);
      if (mountedRef.current && id === uploadId.current) {
        setPhotoError("Photo could not be attached. A fresh GPS fix and a readable photo are required. Retry location, then select the photo again.");
        setGps(null);
        setReportPin(null);
        setLocationStage((stage) => stage === "granted" ? "unavailable" : stage);
        setPhase("location");
        resetPickerValues();
      }
    } finally {
      if (mountedRef.current && id === uploadId.current) {
        setPhotoChecking(false);
      }
    }
  }

  function removePhoto() {
    // Invalidate any in-flight decode for a previous selection.
    uploadId.current += 1;
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
    photoRef.current = null;
    setPhoto(null);
    setPhotoGps(null);
    setPhotoError(null);
    setPhotoChecking(false);
    resetPickerValues();
  }

  function openCameraPicker() {
    cameraInputRef.current?.click();
  }

  /**
   * Header report action: location first, never the camera first. Without a
   * report pin it routes to the location step (requesting permission when
   * idle) and waits for an explicit second tap — mobile browsers require a
   * user gesture to open the picker, so the camera is never auto-opened after
   * the async GPS fix. Denial/unavailability blocks the photo picker before
   * any camera. Once the spot exists, this tap opens the camera directly.
   */
  function handleHeaderPhotoClick() {
    setReporting(true);
    setPanelExpanded(true);
    if (!gps || locationStage !== "granted") {
      setAwaitingPhoto(true);
      setPhase("location");
      requestLocation();
      return;
    }
    setAwaitingPhoto(false);
    setPhase("photo");
    openCameraPicker();
  }

  function replacePhotoFromLaterStep() {
    setPhase("photo");
    setPanelExpanded(true);
  }

  function acquireGps(): Promise<BoundGps> {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        setLocationStage("unavailable");
        reject(new Error("GPS unavailable"));
        return;
      }
      navigator.geolocation.getCurrentPosition((pos) => {
        if (pos.coords.accuracy > 100) {
          if (mountedRef.current) setLocationStage("inaccurate");
          reject(new Error("GPS accuracy must be within 100 m"));
          return;
        }
        if (!Number.isFinite(pos.coords.latitude) || Math.abs(pos.coords.latitude) > 90 || !Number.isFinite(pos.coords.longitude) || Math.abs(pos.coords.longitude) > 180 || !Number.isFinite(pos.coords.accuracy) || pos.coords.accuracy < 0 || !Number.isFinite(pos.timestamp) || Date.now() - pos.timestamp > 30000 || pos.timestamp > Date.now() + 5000) {
          setLocationStage("unavailable");
          reject(new Error("No fresh GPS fix"));
          return;
        }
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy, capturedAt: new Date(pos.timestamp).toISOString() });
      }, (err) => {
        if (mountedRef.current) setLocationStage(err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable");
        reject(err);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  }

  async function requestLocation() {
    if (locatingRef.current) return;
    locatingRef.current = true;
    const id = ++locationRequestId.current;
    setLocationStage("requesting");
    setReportPin(null);
    try {
      const fix = await acquireGps();
      if (!mountedRef.current || id !== locationRequestId.current) return;
      setGps(fix);
      setReportPin({ lat: fix.lat, lng: fix.lng });
      setLocationStage("granted");
      setRecenterSignal((n) => n + 1);
      setPhase("photo");
    } catch {
      // Error state is supplied by acquireGps; no manual location fallback.
    } finally { locatingRef.current = false; }
  }

  function validateVehicle(v: VehicleDetails): Partial<VehicleDetails> {
    const errors: Partial<VehicleDetails> = {};
    if (!v.make.trim()) errors.make = "Enter the manufacturer.";
    else if (v.make.trim().length > 60)
      errors.make = "Keep this under 60 characters.";
    if (!v.model.trim()) errors.model = "Enter the model.";
    else if (v.model.trim().length > 60)
      errors.model = "Keep this under 60 characters.";
    if (!/^\d{4}$/.test(v.year.trim())) {
      errors.year = "Enter a 4-digit year.";
    } else {
      const y = Number(v.year);
      if (y < 1980 || y > CURRENT_YEAR + 1) {
        errors.year = `Enter a year between 1980 and ${CURRENT_YEAR + 1}.`;
      }
    }
    if (v.variant.trim().length > 60)
      errors.variant = "Keep this under 60 characters.";
    return errors;
  }

  function handleVehicleSubmit(e: React.FormEvent) {
    e.preventDefault();
    vehicleAttemptedRef.current = true;
    const errors = validateVehicle(vehicle);
    setVehicleErrors(errors);
    if (Object.keys(errors).length === 0) {
      setPhase("summary");
      setPanelExpanded(true);
      return;
    }
    // Failed submit: focus the first invalid field in form order so its
    // inline error is found immediately. role=alert errors + describedby stay.
    if (errors.make) makeInputRef.current?.focus();
    else if (errors.model) modelInputRef.current?.focus();
    else if (errors.year) yearInputRef.current?.focus();
    else if (errors.variant) variantInputRef.current?.focus();
  }

  /** After a validation attempt, revalidate as each field changes: a
   *  corrected field clears the moment it turns valid, while a still-invalid
   *  field keeps its error without waiting for resubmit. Year range,
   *  required make/model lengths, and aria wiring are unchanged. */
  function updateVehicleField(key: keyof VehicleDetails, value: string) {
    const next = { ...vehicle, [key]: value };
    setVehicle(next);
    if (vehicleAttemptedRef.current) setVehicleErrors(validateVehicle(next));
  }

  function startNewReport() {
    // Invalidate in-flight callbacks so they cannot repopulate a fresh report.
    locationRequestId.current += 1;
    uploadId.current += 1;
    locatingRef.current = false;
    removePhoto();
    setGps(null);
    setLocationStage("idle");
    setReportPin(null);
    setRecenterSignal(0);
    setFocusPin(null);
    setFocusPinSignal(0);
    setAwaitingPhoto(false);
    setVehicle({ make: "", model: "", year: "", variant: "" });
    setVehicleErrors({});
    vehicleAttemptedRef.current = false;
    setPhase("location");
    setPanelExpanded(false);
    setReporting(true);
    setObservedDepth("");
    setTimeout(() => { if (mountedRef.current) void requestLocation(); }, 0);
  }

  async function saveReport() {
    if (!photo || !photoGps || !reportPin || photoChecking || saving) return;
    const depth = observedDepth === "" ? undefined : Number(observedDepth);
    if (depth !== undefined && (!Number.isFinite(depth) || depth < 0 || depth > 300)) {
      setReportNotice("Enter a measured depth between 0 and 300 cm, or leave it blank.");
      return;
    }
    if (Date.now() - Date.parse(photoGps.capturedAt) > 10 * 60000) {
      removePhoto();
      setPhotoError("The photo's GPS fix expired. Take the photo again here to bind a fresh location.");
      setPhase("photo");
      return;
    }
    setSaving(true);
    setReportNotice("");
    try {
      const draft = { photo, gps: photoGps, reportLat: photoGps.lat, reportLng: photoGps.lng,
        vehicle, observedDepthCm: depth ?? null };
      const saved = await publishReport(draft, `${photoGps.lat.toFixed(5)}, ${photoGps.lng.toFixed(5)}`);
      router.push(`/map?report=${encodeURIComponent(saved.id)}`);
    } catch (error) {
      setReportNotice(error instanceof Error ? error.message : "The report could not be shared. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5 sm:px-4">
        <Link href="/" aria-label="FloodFlow home" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 truncate text-[17px] font-semibold tracking-[-0.01em]">
          <Waves
            className="h-[22px] w-[22px] shrink-0 text-accent"
            aria-hidden="true"
          />
          <span className="truncate">FloodFlow</span>
        </Link>
        <button
          type="button"
          onClick={handleHeaderPhotoClick}
          disabled={saving || photoChecking}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
        >
          <Camera className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          Take photo
        </button>
        <Link href="/map" className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-accent">Browse map</Link>
      </header>

      <MapHero />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main
          aria-label="Map"
          className={
            panelExpanded
              ? "ff-map-expanded relative order-1 min-w-0 flex-none lg:order-2 lg:h-auto lg:max-h-none lg:min-h-0 lg:flex-1"
              : "ff-map-collapsed relative order-1 min-w-0 flex-1 lg:order-2 lg:min-h-0"
          }
        >
          <MapComponent
            mode="report"
            reportingLocked
            gps={gps}
            tileRetrySignal={tileRetrySignal}
            onTilesUnavailable={setTilesUnavailable}
            reportPin={reportPin}
            onReportPinChange={() => {}}
            recenterSignal={recenterSignal}
            focusPin={focusPin}
            focusPinSignal={focusPinSignal}
            reports={sharedReports}

          />
          {tilesUnavailable ? <div role="status" className="absolute bottom-16 left-2 right-2 z-[600] rounded-xl border border-border bg-surface/95 p-3 text-sm shadow-lg sm:right-auto sm:max-w-sm">
            <p className="font-semibold">Map background unavailable</p>
            <p className="mt-1 text-foreground-secondary">Your GPS location and reports are kept. Retry the map background when connected.</p>
            <button type="button" onClick={() => { setTilesUnavailable(false); setTileRetrySignal((n) => n + 1); }} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold text-accent"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry map</button>
          </div> : null}
          <div className="pointer-events-none absolute right-2 top-2 z-[500] max-w-[11rem] rounded-xl border border-border bg-surface/95 px-2.5 py-2 text-xs leading-relaxed text-foreground-secondary shadow-[0_4px_14px_rgb(0_0_0/0.12)] min-[480px]:max-w-[17rem]">
            <p>
              {gps ? "Blue dot is you. " : null}Reporting uses your GPS position.
            </p>
            {!reportPin ? (
              <p className="mt-1">
                {gps
                  ? "Take a photo at your current location."
                  : "Browse the map or start an on-site report."}
              </p>
            ) : null}
            <p role="status" className="mt-1.5 border-t border-border pt-1.5">
              {sharedFeedLoaded ? `${sharedReports.length} community report${sharedReports.length === 1 ? "" : "s"} on this map. Tap a wave for details.` : "Loading community reports…"}
            </p>
            {sharedFeedError ? <p role="status" className="mt-1 text-danger">{sharedFeedError}</p> : null}

          </div>
          <div className="pointer-events-none absolute bottom-2 left-2 z-[500] flex max-w-[calc(100%-5.5rem)] items-center gap-2 rounded-xl border border-border bg-surface/95 px-2.5 py-2 shadow-[0_4px_14px_rgb(0_0_0/0.12)]">
            <MapPin
              className="h-4 w-4 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span className="ff-coords truncate text-foreground">
              {reportPin
                ? `${reportPin.lat.toFixed(4)}, ${reportPin.lng.toFixed(4)}`
                : "No report pin yet"}
            </span>
          </div>
          {gps ? (
            <button
              type="button"
              onClick={() => setRecenterSignal((n) => n + 1)}
              className="absolute bottom-2 right-2 z-[500] inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-surface-raised px-3 text-sm font-semibold shadow-[0_4px_14px_rgb(0_0_0/0.18)]"
              aria-label="Recenter map on my position"
            >
              <Crosshair className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </main>

        <aside
          aria-label="Report panel"
          className={`order-2 flex w-full min-w-0 flex-col border-t border-border bg-surface lg:order-1 lg:w-[400px] lg:shrink-0 lg:flex-none lg:border-r lg:border-t-0 lg:max-h-none ${
            panelExpanded
              ? "min-h-0 flex-1 max-h-none"
              : "min-h-0 flex-none max-h-[42vh] max-h-[42dvh]"
          }`}
        >
          <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 py-1.5">
            <p
              aria-label={`Step ${phaseIndex + 1} of 4: ${PHASE_LABELS[phaseIndex].label}`}
              className="ff-step-tag min-w-0 truncate sm:hidden"
            >
              <span className="font-medium text-foreground">
                Step {phaseIndex + 1} of 4
              </span>{" "}
              <span aria-hidden="true">·</span> {PHASE_LABELS[phaseIndex].label}
            </p>
            <ol
              aria-label="Report progress"
              className="hidden min-w-0 items-center gap-1.5 sm:flex"
            >
              {PHASE_LABELS.map((p, i) => {
                const n = i + 1;
                const done = i < phaseIndex;
                const current = i === phaseIndex;
                return (
                  <li key={p.id} className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-current={current ? "step" : undefined}
                      className={`inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                        done
                          ? "border-accent bg-accent-soft text-accent"
                          : current
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border-strong text-foreground-secondary"
                      }`}
                    >
                      {done ? (
                        <Check className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        n
                      )}
                    </span>
                    <span
                      className={`text-xs ${current ? "font-medium text-foreground" : "hidden text-foreground-secondary min-[1100px]:inline"}`}
                    >
                      {p.label}
                    </span>
                    {n < 4 ? (
                      <span
                        aria-hidden="true"
                        className="mx-0.5 shrink-0 text-border-strong"
                      >
                        /
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              onClick={() => setPanelExpanded((v) => !v)}
              aria-expanded={panelExpanded}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-raised lg:hidden"
              aria-label={
                panelExpanded
                  ? "Shrink panel to see more map"
                  : "Expand panel"
              }
            >
              {panelExpanded ? (
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              ) : (
                <ChevronUp className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
            {reportNotice ? <div className="ff-help mb-3 rounded-xl border border-border bg-accent-soft p-3 !text-foreground">
              <p role="status">{reportNotice}</p>

            </div> : null}
            {phase === "location" ? (
              <section aria-labelledby="location-heading">
                <h2
                  id="location-heading"
                  ref={phaseHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-[-0.01em]"
                >
                  Report at your current location
                </h2>
                <p className="ff-help mt-1.5 !text-base !leading-relaxed">
                  {reporting ? "Allow location to report the waterlogging where you are now. The photo will be bound to a fresh GPS fix; the pin cannot be moved." : "Explore locations without sharing your position. Start a report to capture waterlogging at your current GPS location."}
                </p>
                {awaitingPhoto ? <p role="status" className="ff-help mt-3">Waiting for GPS. Then tap Take a photo.</p> : null}


                {locationStage !== "idle" ? (
                  <div className="ff-plate mt-3 min-w-0 p-3.5">
                    {locationStage === "requesting" ? (
                      <p role="status" className="text-base">
                        Asking the browser for your position…
                      </p>
                    ) : null}
                    {locationStage === "granted" && gps ? (
                      <p className="min-w-0 break-words text-base">
                        Your position:{" "}
                        <span className="ff-coords !text-sm text-foreground">
                          {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                        </span>{" "}
                        <span className="text-sm text-foreground-secondary">
                          (±{gps.accuracyMeters} m)
                        </span>
                      </p>
                    ) : null}
                  {locationStage === "denied" ||
                  locationStage === "unavailable" ||
                  locationStage === "inaccurate" ||
                  locationStage === "timeout" ? (
                    <div>
                      <p role="alert" className="text-base leading-relaxed">
                        {LOCATION_COPY[locationStage]}
                      </p>
                      <button
                        type="button"
                        onClick={requestLocation}
                        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-4 text-base font-semibold"
                      >
                        <RefreshCw
                          className="h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />{" "}
                        Try again
                      </button>
                    </div>
                  ) : null}
                  </div>
                ) : null}

                <div className="mt-3 min-w-0 text-base">
                  {reportPin ? (
                    <p className="break-words">
                      Flood spot:{" "}
                      <span className="ff-coords !text-sm text-foreground">
                        {reportPin.lat.toFixed(5)}, {reportPin.lng.toFixed(5)}
                      </span>
                      <span className="ff-help mt-1 block">
                        GPS position is fixed for this photo.
                      </span>
                    </p>
                  ) : (
                    <p className="ff-help !text-base">No flood spot yet.</p>
                  )}
                </div>

              </section>
            ) : null}

            {phase === "photo" ? (
              <section aria-labelledby="photo-heading">
                <h2
                  id="photo-heading"
                  ref={phaseHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-[-0.01em]"
                >
                  Add a photo of the water
                </h2>
                <p className="mt-1 text-base leading-relaxed text-foreground-secondary">
                  Take a photo here. JPEG, PNG, or WebP, up to 10 MB. GPS is refreshed when selected. Camera access uses your device picker; capture time and image location are not independently verified.
                  {reportPin ? (
                    <>
                      {" "}
                      For{" "}
                      <span className="ff-coords !text-sm text-foreground">
                        {reportPin.lat.toFixed(4)}, {reportPin.lng.toFixed(4)}
                      </span>
                      .
                    </>
                  ) : null}
                </p>

                {photoChecking ? (
                  <p role="status" className="ff-help mt-3 !text-base">
                    Getting a fresh GPS fix and checking the photo…
                  </p>
                ) : null}
                {photoError ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-danger/60 bg-surface-raised px-3.5 py-3 text-base font-medium leading-relaxed text-danger"
                  >
                    {photoError}
                  </p>
                ) : null}

                {!photo ? (
                  <p className="ff-help mt-3 !text-base">
                    Choose how to add the photo below.
                  </p>
                ) : (
                  <>
                    <figure className="ff-plate mt-3 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.objectUrl}
                        alt={`Preview of ${photo.name}`}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <figcaption className="ff-help border-t border-border px-3 py-2">
                        {(photo.sizeBytes / 1024 / 1024).toFixed(1)} MB ·{" "}
                        {photo.width}×{photo.height}
                      </figcaption>
                    </figure>
                    <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                      <p className="ff-help min-w-0 truncate">
                        {photo.name}
                      </p>
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-border-strong px-3 text-sm font-semibold"
                      >
                        <X className="h-4 w-4" aria-hidden="true" /> Remove
                      </button>
                    </div>
                    <p className="ff-help mt-3 !text-base">
                      Continue below when the preview looks right.
                    </p>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPhase("location")}
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-base font-medium text-foreground-secondary"
                >
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{" "}
                  View GPS location
                </button>
              </section>
            ) : null}

            {phase === "vehicle" && photo && reportPin ? (
              <section aria-labelledby="vehicle-heading">
                <h2
                  id="vehicle-heading"
                  ref={phaseHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-[-0.01em]"
                >
                  Note your vehicle
                </h2>
                <p className="ff-help mt-1.5 !text-base">
                  Names only. No verified specifications exist yet, so tyre
                  size, ground clearance, and exhaust position read
                  “Not available”.
                </p>
                <div className="ff-plate mt-3 flex min-w-0 items-center gap-3 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.objectUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground-secondary">
                      {photo.name} · {(photo.sizeBytes / 1024 / 1024).toFixed(1)}{" "}
                      MB
                    </p>
                    <p className="ff-coords truncate !text-xs text-foreground-secondary">
                      {reportPin.lat.toFixed(4)}, {reportPin.lng.toFixed(4)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={replacePhotoFromLaterStep}
                      aria-label="Replace photo in the photo step"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border-strong bg-surface"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removePhoto();
                        setPhase("photo");
                      }}
                      aria-label="Remove photo and go back to photo step"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border-strong bg-surface"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <form
                  id="vehicle-form"
                  onSubmit={handleVehicleSubmit}
                  noValidate
                  className="mt-4 min-w-0 space-y-4"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor="vehicle-make"
                      className="text-base font-medium text-foreground"
                    >
                      Manufacturer
                    </label>
                    <input
                      id="vehicle-make"
                      ref={makeInputRef}
                      type="text"
                      autoComplete="off"
                      list="vehicle-make-suggestions"
                      value={vehicle.make}
                      onChange={(e) =>
                        updateVehicleField("make", e.target.value)
                      }
                      aria-invalid={Boolean(vehicleErrors.make)}
                      aria-describedby={
                        vehicleErrors.make ? "vehicle-make-error" : undefined
                      }
                      className="ff-field min-w-0"
                      placeholder="e.g. Maruti Suzuki"
                    />
                    <datalist id="vehicle-make-suggestions">
                      {makeSuggestions.map((make) => (
                        <option key={make} value={make} />
                      ))}
                    </datalist>
                    {vehicleErrors.make ? (
                      <p
                        id="vehicle-make-error"
                        role="alert"
                        className="ff-help mt-1.5 font-medium !text-danger"
                      >
                        {vehicleErrors.make}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      htmlFor="vehicle-model"
                      className="text-base font-medium text-foreground"
                    >
                      Model
                    </label>
                    <input
                      id="vehicle-model"
                      ref={modelInputRef}
                      type="text"
                      autoComplete="off"
                      list="vehicle-model-suggestions"
                      value={vehicle.model}
                      onChange={(e) =>
                        updateVehicleField("model", e.target.value)
                      }
                      aria-invalid={Boolean(vehicleErrors.model)}
                      aria-describedby={
                        vehicleErrors.model ? "vehicle-model-error" : undefined
                      }
                      className="ff-field min-w-0"
                      placeholder="e.g. Swift"
                    />
                    <datalist id="vehicle-model-suggestions">
                      {modelSuggestions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    {vehicleErrors.model ? (
                      <p
                        id="vehicle-model-error"
                        role="alert"
                        className="ff-help mt-1.5 font-medium !text-danger"
                      >
                        {vehicleErrors.model}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label
                        htmlFor="vehicle-year"
                        className="text-base font-medium text-foreground"
                      >
                        Year
                      </label>
                      <input
                        id="vehicle-year"
                        ref={yearInputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={vehicle.year}
                        onChange={(e) =>
                          updateVehicleField("year", e.target.value)
                        }
                        aria-invalid={Boolean(vehicleErrors.year)}
                        aria-describedby={
                          vehicleErrors.year ? "vehicle-year-error" : undefined
                        }
                        className="ff-field min-w-0"
                        placeholder="e.g. 2022"
                      />
                      {vehicleErrors.year ? (
                        <p
                        id="vehicle-year-error"
                        role="alert"
                        className="ff-help mt-1.5 font-medium !text-danger"
                        >
                          {vehicleErrors.year}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label
                        htmlFor="vehicle-variant"
                        className="text-base font-medium text-foreground"
                      >
                        Variant{" "}
                        <span className="font-normal text-foreground-secondary">
                          (optional)
                        </span>
                      </label>
                      <input
                        id="vehicle-variant"
                        ref={variantInputRef}
                        type="text"
                        autoComplete="off"
                        value={vehicle.variant}
                        onChange={(e) =>
                          updateVehicleField("variant", e.target.value)
                        }
                        aria-invalid={Boolean(vehicleErrors.variant)}
                        aria-describedby={
                          vehicleErrors.variant
                            ? "vehicle-variant-error"
                            : undefined
                        }
                        className="ff-field min-w-0"
                        placeholder="e.g. VXi"
                      />
                      {vehicleErrors.variant ? (
                        <p
                        id="vehicle-variant-error"
                        role="alert"
                        className="ff-help mt-1.5 font-medium !text-danger"
                        >
                          {vehicleErrors.variant}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <dl className="ff-plate mt-1 min-w-0 p-3 text-base">
                    <div className="flex justify-between gap-2 py-1.5">
                      <dt className="text-foreground-secondary">Tyre size</dt>
                      <dd className="font-medium">{specDisplay.tyre}</dd>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-border py-1.5">
                      <dt className="text-foreground-secondary">
                        Ground clearance
                      </dt>
                      <dd className="font-medium">
                        {specDisplay.groundClearance}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-border py-1.5">
                      <dt className="text-foreground-secondary">
                        Exhaust position
                      </dt>
                      <dd className="font-medium">{specDisplay.exhaust}</dd>
                    </div>
                  </dl>

                  <div className="flex min-w-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setPhase("photo")}
                      className="inline-flex min-h-11 flex-1 min-w-0 items-center justify-center rounded-xl px-3 text-sm font-medium text-foreground-secondary"
                    >
                      Back to photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhase("location")}
                      className="inline-flex min-h-11 flex-1 min-w-0 items-center justify-center rounded-xl px-3 text-sm font-medium text-foreground-secondary"
                    >
                      View GPS location
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {phase === "summary" && photo && reportPin ? (
              <section aria-labelledby="summary-heading">
                <h2
                  id="summary-heading"
                  ref={phaseHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-[-0.01em]"
                >
                  Report summary
                </h2>
                <label className="mt-3 block text-sm font-medium" htmlFor="observed-depth">Measured water depth in cm (optional)</label>
                <input id="observed-depth" type="number" min="0" max="300" step="0.1" value={observedDepth} onChange={(e) => setObservedDepth(e.target.value)} className="ff-input mt-1 w-full rounded-xl border border-border bg-surface-raised p-3" placeholder="Leave blank if unknown" />
                <p className="ff-help mt-1">Only enter a depth you measured safely. It is labeled user-reported, not verified.</p>
                <ul className="ff-plate mt-3 min-w-0 divide-y divide-border text-base">
                  <li className="flex min-w-0 items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground-secondary">
                        Location
                      </p>
                      <p className="ff-coords mt-0.5 !text-sm text-foreground">
                        {reportPin.lat.toFixed(5)}, {reportPin.lng.toFixed(5)}
                      </p>
                      <p className="mt-0.5 text-sm text-foreground-secondary">
                        {photoGps ? `GPS ±${Math.round(photoGps.accuracyMeters)} m · ${new Date(photoGps.capturedAt).toLocaleTimeString()}. Bound when the photo was selected.` : "GPS fix required."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhase("location")}
                      aria-label="View bound GPS location"
                      className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-accent"
                    >
                      View
                    </button>
                  </li>
                  <li className="flex min-w-0 items-center gap-3 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.objectUrl}
                      alt={`Photo attached to this report at GPS ${reportPin.lat.toFixed(3)}, ${reportPin.lng.toFixed(3)}`}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground-secondary">Photo</p>
                      <p className="truncate text-sm text-foreground">
                        {photo.source === "camera" ? "Camera picker" : "Gallery upload (capture location unverified)"} · {photo.name} ·{" "}
                        {(photo.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                      <details>
                        <summary className="ff-disclosure text-sm font-medium">
                          View larger preview
                        </summary>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.objectUrl}
                          alt={`Larger preview of ${photo.name}`}
                          className="mt-1 aspect-[4/3] w-full rounded-lg object-cover"
                        />
                      </details>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhase("photo")}
                      aria-label="Replace photo"
                      className="inline-flex min-h-11 shrink-0 items-center self-start rounded-xl px-3 text-sm font-semibold text-accent"
                    >
                      Edit
                    </button>
                  </li>
                  <li className="flex min-w-0 items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground-secondary">
                        Vehicle
                      </p>
                      <p className="break-words text-foreground">
                        {vehicle.make.trim()} {vehicle.model.trim()} ·{" "}
                        {vehicle.year.trim()}
                        {vehicle.variant.trim()
                          ? ` · ${vehicle.variant.trim()}`
                          : ""}
                      </p>
                      <details>
                        <summary className="ff-disclosure text-sm font-medium">
                          Specifications: not available
                        </summary>
                        <ul className="mt-1 space-y-1 text-sm text-foreground-secondary">
                          <li>
                            Tyre size: {specOrUnknown(specDisplay.tyre)}.
                          </li>
                          <li>
                            Ground clearance:{" "}
                            {specOrUnknown(specDisplay.groundClearance)}.
                          </li>
                          <li>
                            Exhaust position:{" "}
                            {specOrUnknown(specDisplay.exhaust)}.
                          </li>
                        </ul>
                      </details>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhase("vehicle")}
                      aria-label="Edit vehicle"
                      className="inline-flex min-h-11 shrink-0 items-center self-start rounded-xl px-3 text-sm font-semibold text-accent"
                    >
                      Edit
                    </button>
                  </li>
                </ul>

                <div
                  role="status"
                  className="mt-4 rounded-2xl border border-border bg-accent-soft p-4"
                >
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    <TriangleAlert
                      className="h-5 w-5 shrink-0 text-danger"
                      aria-hidden="true"
                    />
                    Unable to assess
                  </p>
                  <p className="mt-1.5 text-base leading-relaxed">
                    Assessment is not available yet.
                  </p>
                  <p className="mt-2.5 border-t border-border-strong/40 pt-2.5 text-base font-semibold">
                    Avoid crossing.
                  </p>
                </div>

                <p className="ff-help mt-3">
                  Water depth is not measured from photos. Reports are community observations, not road safety assessments.
                </p>

              </section>
            ) : null}
          </div>

          {/* Dedicated non-scrolling action row: a flex sibling of the scroll
              area above, so the primary action owns its own layout space and
              can never paint over the search field, results, or last fields.
              Sticky-in-scroller is deliberately not used here. */}
          <div className="ff-panel-actions">
            {phase === "location" ? (
              <div>
                <button
                  type="button"
                  disabled={reporting && (!reportPin || locationStage !== "granted")}
                  onClick={() => {
                    if (!reporting) { handleHeaderPhotoClick(); return; }
                    setAwaitingPhoto(false);
                    setPhase("photo");
                  }}
                  className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reporting ? "Continue to photo" : "Report a waterlog"}
                </button>
                {!reportPin ? (
                  <p className="ff-help mt-2">Current GPS is required to report.</p>
                ) : null}
              </div>
            ) : null}

            {phase === "photo" && !photo ? (
              <div className="grid min-w-0 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={photoChecking}
                  className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {photoChecking ? "Checking photo…" : "Take a photo"}
                </button>

              </div>
            ) : null}

            {phase === "photo" && photo ? (
              <button
                type="button"
                onClick={() => setPhase("vehicle")}
                className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
              >
                Continue to vehicle
              </button>
            ) : null}

            {phase === "vehicle" && photo && reportPin ? (
              <button
                type="submit"
                form="vehicle-form"
                className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
              >
                <Car className="h-5 w-5 shrink-0" aria-hidden="true" /> Prepare
                report summary
              </button>
            ) : null}

            {phase === "summary" && photo && reportPin ? (
              <div className="grid gap-2">
                <button type="button" onClick={() => void saveReport()} disabled={photoChecking || saving}
                  className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50">
                  <MapPin className="h-5 w-5" aria-hidden="true" /> {saving ? "Sharing report…" : "Share waterlogging report"}
                </button>
                <button type="button" onClick={startNewReport} disabled={saving}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm text-foreground-secondary">
                  Start over without saving
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Persistent pickers: mounted in every phase so the header
          “Click a photo” button and all panel actions share one pair.
          The camera opens only on an explicit tap (user gesture). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        capture="environment"
        className="hidden"
        aria-label="Take a photo with the camera"
        onChange={(e) => void handleFile(e.target.files?.[0], "camera")}
      />


      <footer className="shrink-0 border-t border-border bg-surface px-4 py-1.5 text-xs leading-relaxed text-foreground-secondary sm:text-sm">
        Sharing uploads your photo, GPS accuracy and timestamp, vehicle details, and optional measured depth. Community reports do not establish road safety.
      </footer>
    </div>
  );
}
