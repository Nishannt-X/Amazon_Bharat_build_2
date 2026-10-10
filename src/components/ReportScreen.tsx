"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Camera,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Image as ImageIcon,
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
  type FloodReport,
  type GpsFix,
  type PhotoState,
  type ReportPin,
  type VehicleDetails,
} from "../lib/report";
import LocationSearchBar, {
  type PlaceSearchResult,
} from "./LocationSearchBar";
import MapHero from "./MapHero";
import { usePlaceSearch } from "../hooks/usePlaceSearch";
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

/** Shared flood reports. Empty: no backend data source is connected yet,
 *  so no shared points render. To verify the overlay, inject
 *  temporary entries via browser devtools only — never seed samples as real.
 */
const SHARED_REPORTS: FloodReport[] = [];

type LocationStage =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout";

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
    "Location permission was denied. You can try again, or place the report pin on the map by hand.",
  unavailable:
    "Your position is unavailable right now. You can try again, or place the report pin on the map by hand.",
  timeout:
    "Finding your position took too long. You can try again, or place the report pin on the map by hand.",
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

export default function ReportScreen() {
  const [phase, setPhase] = useState<Phase>("location");
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoChecking, setPhotoChecking] = useState(false);
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [locationStage, setLocationStage] = useState<LocationStage>("idle");
  const [reportPin, setReportPin] = useState<ReportPin | null>(null);
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
  const [panelExpanded, setPanelExpanded] = useState(false);
  /** Set when the header photo button is tapped before the spot exists:
   *  the location step explains, and the next tap opens the camera. */
  const [awaitingPhoto, setAwaitingPhoto] = useState(false);

  /** Live Photon place search (explicit submit only, India-focused via the
   *  documented `countrycode` param). Mounted at the root so the typed query
   *  and results survive phase changes. Never fires per keystroke. */
  const placeSearch = usePlaceSearch({ countryCodes: ["IN"] });

  /** Names-only suggestions from the structured catalog (never spec-implying;
   *  ambiguous names such as "Himalayan" stay bare, no generation/year).
   *  Model options narrow to the typed manufacturer when it matches a known
   *  make; freeform input is always preserved. */
  const makeSuggestions = listMakes();
  const modelSuggestions = suggestModels(vehicle.make);
  /** Honest spec boundary: exact normalized make/model/year/variant lookup
   *  against curated verified rows (currently empty by audit:
   *  brochure-edition dating cannot verify a model year, so the 46
   *  researched combinations stay quarantined in
   *  unverified-spec-candidates.ts, never wired in). Every spec reads
   *  "Not available" instead of an ad-hoc value. A blank year matches no
   *  row, so specs stay "Not available" when the year is skipped. */
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
  /** Summary copy follows the lookup, never a hardcoded claim: with no
   *  verified row for the entered combination this reads "not available";
   *  a future verified row flips it without a copy change. */
  const specsUnknown =
    specDisplay.tyre === "Not available" &&
    specDisplay.groundClearance === "Not available" &&
    specDisplay.exhaust === "Not available";

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
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
  /** Pin revision: bumped on every deliberate manual/search pin move so a
   *  late GPS callback can tell whether the pin changed since its request
   *  began. The GPS recenter button never touches this (viewport only). */
  const pinRevisionRef = useRef(0);

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
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    // Invalidate FIRST, before validation: an earlier valid selection that
    // is still decoding must not complete after this attempt's error and
    // dismiss it, set a photo, or clear the checking state. The token below
    // is this attempt's; only it may write photo/error/checking state.
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
      const dims = await decodePhoto(file);
      if (!mountedRef.current || id !== uploadId.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
      setPhoto({
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
        setPhotoError("This photo could not be opened. Try another file.");
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
    setPhotoError(null);
    setPhotoChecking(false);
    resetPickerValues();
  }

  function openCameraPicker() {
    cameraInputRef.current?.click();
  }

  /**
   * Header "Click a photo": location first, never the camera first. Without a
   * report pin it routes to the location step (requesting permission when
   * idle) and waits for an explicit second tap — mobile browsers require a
   * user gesture to open the picker, so the camera is never auto-opened after
   * the async GPS fix. Denial/unavailability shows retry + manual pin before
   * any camera. Once the spot exists, this tap opens the camera directly.
   */
  function handleHeaderPhotoClick() {
    if (!reportPin) {
      setAwaitingPhoto(true);
      setPhase("location");
      setPanelExpanded(true);
      if (locationStage === "idle") requestLocation();
      return;
    }
    setAwaitingPhoto(false);
    setPhase("photo");
    setPanelExpanded(true);
    openCameraPicker();
  }

  /** Replacing the photo from a later step returns to the upload phase for
   *  coherent validation/preview. The picker opens only on an explicit tap. */
  function replacePhotoFromLaterStep() {
    setPhase("photo");
    setPanelExpanded(true);
  }

  function requestLocation() {
    // Single-flight guard: never fire a duplicate permission prompt.
    if (locatingRef.current) return;
    if (!("geolocation" in navigator)) {
      setLocationStage("unavailable");
      return;
    }
    locatingRef.current = true;
    const id = ++locationRequestId.current;
    // Snapshot the pin revision: only seed/move the pin below when nothing
    // deliberate (manual place/drag, search pick) happened since this
    // request began. The explicit "Use my location" tap itself starts the
    // request, so a settled pin with no edits since is intentionally moved.
    const pinRevAtRequest = pinRevisionRef.current;
    setLocationStage("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locatingRef.current = false;
        if (!mountedRef.current || id !== locationRequestId.current) return;
        const fix: GpsFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy ?? 0),
        };
        // The GPS dot/accuracy always updates — it is the device position,
        // never the user's chosen spot.
        setGps(fix);
        setLocationStage("granted");
        // Late callback vs. newer deliberate spot: the user's newer pin
        // wins. Skip the seed/move (and the viewport steal) without
        // dropping their pick highlight.
        if (pinRevisionRef.current !== pinRevAtRequest) return;
        // The report pin starts at the GPS fix but stays independent:
        // dragging the pin never moves the blue dot. A GPS move replaces
        // any search pick, so the stale area highlight is dropped.
        setReportPin({ lat: fix.lat, lng: fix.lng });
        placeSearch.clearSelection();
        setRecenterSignal((n) => n + 1);
      },
      (err) => {
        locatingRef.current = false;
        if (!mountedRef.current || id !== locationRequestId.current) return;
        if (err.code === 1) setLocationStage("denied");
        else if (err.code === 3) setLocationStage("timeout");
        else setLocationStage("unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function handlePinChange(pin: ReportPin) {
    // Manual drag/tap moves the pin freely with no map auto-jump. Any
    // search pick is now stale, so its highlight is dropped (the typed
    // query and result list stay for re-picking).
    pinRevisionRef.current += 1;
    setReportPin(pin);
    placeSearch.clearSelection();
  }

  /** Typing never fetches: it only updates the hook input. A divergent
   *  query drops the stale area highlight; results stay labelled with the
   *  submitted text until the next explicit search. */
  function handleSearchQueryChange(next: string) {
    placeSearch.setQuery(next);
    if (placeSearch.selectedResultId) placeSearch.clearSelection();
  }

  /** Explicit pick: record the selection, move the report pin, and recenter
   *  the map once. The GPS dot is untouched; afterwards the pin drags
   *  freely with no auto-jump. */
  function handleSelectSearchResult(result: PlaceSearchResult) {
    placeSearch.selectResult(result);
    const pin = { lat: result.lat, lng: result.lng };
    // A search pick is a deliberate spot: it must win over any pending GPS
    // callback, so it bumps the pin revision like a manual move.
    pinRevisionRef.current += 1;
    setReportPin(pin);
    setFocusPin(pin);
    setFocusPinSignal((n) => n + 1);
  }

  function validateVehicle(v: VehicleDetails): Partial<VehicleDetails> {
    const errors: Partial<VehicleDetails> = {};
    if (!v.make.trim()) errors.make = "Enter the manufacturer.";
    else if (v.make.trim().length > 60)
      errors.make = "Keep this under 60 characters.";
    if (!v.model.trim()) errors.model = "Enter the model.";
    else if (v.model.trim().length > 60)
      errors.model = "Keep this under 60 characters.";
    // Year is optional: blank stays blank (specs then read "Not
    // available" — a blank year never matches a verified row). A typed
    // year must be a 4-digit year in range.
    const yearTrimmed = v.year.trim();
    if (yearTrimmed.length > 0) {
      if (!/^\d{4}$/.test(yearTrimmed)) {
        errors.year = "Enter a 4-digit year.";
      } else {
        const y = Number(yearTrimmed);
        if (y < 1980 || y > CURRENT_YEAR + 1) {
          errors.year = `Enter a year between 1980 and ${CURRENT_YEAR + 1}.`;
        }
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
    pinRevisionRef.current = 0;
    locatingRef.current = false;
    removePhoto();
    placeSearch.reset();
    setGps(null);
    setLocationStage("idle");
    setReportPin(null);
    setFocusPin(null);
    setFocusPinSignal(0);
    setAwaitingPhoto(false);
    setVehicle({ make: "", model: "", year: "", variant: "" });
    setVehicleErrors({});
    vehicleAttemptedRef.current = false;
    setPhase("location");
    setPanelExpanded(false);
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5 sm:px-4">
        <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-[17px] font-semibold tracking-[-0.01em]">
          <Waves
            className="h-[22px] w-[22px] shrink-0 text-accent"
            aria-hidden="true"
          />
          <span className="truncate">FloodFlow</span>
        </p>
        <button
          type="button"
          onClick={handleHeaderPhotoClick}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
        >
          <Camera className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          Click a photo
        </button>
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
            gps={gps}
            reportPin={reportPin}
            onReportPinChange={handlePinChange}
            recenterSignal={recenterSignal}
            focusPin={focusPin}
            focusPinSignal={focusPinSignal}
            reports={SHARED_REPORTS}
          />
          <div className="pointer-events-none absolute right-2 top-2 z-[500] max-w-[11rem] rounded-xl border border-border bg-surface/95 px-2.5 py-2 text-xs leading-relaxed text-foreground-secondary shadow-[0_4px_14px_rgb(0_0_0/0.12)] min-[480px]:max-w-[17rem]">
            <p>
              {gps ? "Blue dot is you. " : null}Pin is the flood spot.
            </p>
            {!reportPin ? (
              <p className="mt-1">
                {gps
                  ? "Tap the map to place the pin."
                  : "Starting view of India — tap the map to place the pin."}
              </p>
            ) : null}
            <p className="mt-1.5 border-t border-border pt-1.5">
              {SHARED_REPORTS.length === 0 ? (
                <>Shared reports are not available yet.</>
              ) : (
                <>
                  Shared floods: {SHARED_REPORTS.length} hotspot
                  {SHARED_REPORTS.length === 1 ? "" : "s"}. Tap a wave for
                  details.
                </>
              )}
            </p>
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
            {phase === "location" ? (
              <section aria-labelledby="location-heading">
                <h2
                  id="location-heading"
                  ref={phaseHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-[-0.01em]"
                >
                  Where is the water?
                </h2>
                <p className="ff-help mt-1.5 !text-base !leading-relaxed">
                  Set the flood spot, then continue. Use your location or tap
                  the map to place the pin.
                </p>

                {awaitingPhoto ? (
                  <p
                    role="status"
                    className="mt-3 rounded-2xl border border-accent bg-accent-soft px-3.5 py-3 text-base leading-relaxed text-foreground"
                  >
                    {reportPin
                      ? "Spot is set. Tap “Click a photo” again to open the camera."
                      : "You tapped “Click a photo”. Set the spot first — use your location or place the pin by hand — then tap “Click a photo” again to open the camera."}
                  </p>
                ) : null}

                {/* Live Photon lookup (explicit Search submit only — never per
                    keystroke). A pick moves the report pin and recenters once;
                    the GPS dot stays separate. Manual pin stays working. */}
                <div className="mt-3 min-w-0">
                  <LocationSearchBar
                    hasProvider={placeSearch.hasProvider}
                    results={placeSearch.results}
                    status={placeSearch.status}
                    errorMessage={placeSearch.errorMessage}
                    committedQuery={placeSearch.committedQuery}
                    selectedResultId={placeSearch.selectedResultId}
                    attribution={placeSearch.attribution}
                    query={placeSearch.query}
                    onQueryChange={handleSearchQueryChange}
                    isLocating={locationStage === "requesting"}
                    onSearch={(q) => placeSearch.search(q)}
                    onSelectResult={handleSelectSearchResult}
                    onRequestLocation={requestLocation}
                  />
                </div>

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
                        Drag the pin or tap the map to move it.
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
                  JPEG, PNG, or WebP, up to 10 MB.
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
                    Checking that the photo opens…
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
                  Change location
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
                  Specifications appear only for exact supported
                  make/model/year/variant combinations — anything else
                  reads “Not available”.
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
                        Year{" "}
                        <span className="font-normal text-foreground-secondary">
                          (optional)
                        </span>
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
                      Change location
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
                        {gps
                          ? `Placed from your position (±${gps.accuracyMeters} m), adjustable.`
                          : "Placed by hand."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhase("location")}
                      aria-label="Edit location"
                      className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-accent"
                    >
                      Edit
                    </button>
                  </li>
                  <li className="flex min-w-0 items-center gap-3 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.objectUrl}
                      alt={`Photo attached to this report, taken near ${reportPin.lat.toFixed(3)}, ${reportPin.lng.toFixed(3)}`}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground-secondary">Photo</p>
                      <p className="truncate text-sm text-foreground">
                        {photo.name} ·{" "}
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
                      aria-label="Edit photo"
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
                        {[
                          `${vehicle.make.trim()} ${vehicle.model.trim()}`.trim(),
                          vehicle.year.trim(),
                          vehicle.variant.trim(),
                        ]
                          .filter((part) => part.length > 0)
                          .join(" · ")}
                      </p>
                      <details>
                        <summary className="ff-disclosure text-sm font-medium">
                          Specifications:{" "}
                          {specsUnknown ? "not available" : "available"}
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
                  Sharing and rerouting aren&apos;t available yet.
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
                  disabled={!reportPin}
                  onClick={() => {
                    setAwaitingPhoto(false);
                    setPhase("photo");
                  }}
                  className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-xl bg-accent px-4 text-base font-semibold text-accent-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue to photo
                </button>
                {!reportPin ? (
                  <p className="ff-help mt-2">Set the flood spot first.</p>
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
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={photoChecking}
                  className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  <ImageIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Choose from gallery
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
              <button
                type="button"
                onClick={startNewReport}
                className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-xl border border-border-strong bg-surface-raised px-4 text-base font-semibold transition-transform active:scale-[0.98]"
              >
                Start a new report
              </button>
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
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        className="hidden"
        aria-label="Choose a photo from the gallery"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <footer className="shrink-0 border-t border-border bg-surface px-4 py-1.5 text-xs leading-relaxed text-foreground-secondary sm:text-sm">
        Photos stay on this device. Refreshing or closing clears this report.
      </footer>
    </div>
  );
}
