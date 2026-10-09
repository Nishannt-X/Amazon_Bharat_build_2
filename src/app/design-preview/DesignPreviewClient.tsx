"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Crosshair,
  ImagePlus,
  MapPin,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  Waves,
} from "lucide-react";
import type { ReportPin } from "@/lib/report";
import PreviewMap from "./PreviewMap";


type StepId = 0 | 1 | 2 | 3;
const STEP_LABELS = ["Location", "Photo", "Vehicle", "Summary"] as const;

type LocState = "idle" | "locating" | "denied" | "unavailable" | "timeout" | "ready";

interface PhotoPreview {
  url: string;
  name: string;
  sizeKb: number;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

function formatCoords(pin: ReportPin): string {
  return `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;
}

export default function DesignPreviewClient() {
  const [step, setStep] = useState<StepId>(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [gps, setGps] = useState<{
    lat: number;
    lng: number;
    accuracyMeters: number;
  } | null>(null);
  const [pin, setPin] = useState<ReportPin | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [locState, setLocState] = useState<LocState>("idle");
  const locatingRef = useRef(false);

  const [photo, setPhoto] = useState<PhotoPreview | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoChecking, setPhotoChecking] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [variant, setVariant] = useState("");
  const [vehicleAttempted, setVehicleAttempted] = useState(false);

  const mapSectionRef = useRef<HTMLElement | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      setPhoto((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return current;
      });
    };
  }, []);

  function scrollToPanel() {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleHeaderPhotoClick() {
    if (!pin) {
      setStep(0);
      setPanelOpen(true);
      scrollToPanel();
      return;
    }
    setStep(1);
    setPanelOpen(true);
    scrollToPanel();
  }

  function requestLocation() {
    if (locatingRef.current) return;
    if (!("geolocation" in navigator)) {
      setLocState("unavailable");
      return;
    }
    locatingRef.current = true;
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locatingRef.current = false;
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy),
        };
        setGps(fix);
        setLocState("ready");
        setPin((current) => current ?? { lat: fix.lat, lng: fix.lng });
        setRecenterSignal((n) => n + 1);
      },
      (err) => {
        locatingRef.current = false;
        if (err.code === err.PERMISSION_DENIED) setLocState("denied");
        else if (err.code === err.TIMEOUT) setLocState("timeout");
        else setLocState("unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function handlePinChange(next: ReportPin) {
    setPin(next);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchText.trim();
    setSearchNote(
      q.length > 0
        ? `Place search is not available in this preview, so \u201C${q}\u201D was not looked up. Use your location or drag the pin \u2014 nothing is shared.`
        : "Place search is not available in this preview. Use your location or drag the pin \u2014 nothing is looked up or shared.",
    );
  }

  function validateAndPreviewFile(file: File) {
    setPhotoError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPhotoError(
        "That file is not a photo we can read. Choose a JPEG, PNG, or WebP image.",
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhotoError(
        "That photo is over 10 MB. Choose a smaller file or retake it.",
      );
      return;
    }
    setPhotoChecking(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const previewUrl = URL.createObjectURL(file);
      setPhoto((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return {
          url: previewUrl,
          name: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
        };
      });
      setPhotoChecking(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setPhotoChecking(false);
      setPhotoError(
        "That file could not be opened as a photo. Try another file.",
      );
    };
    img.src = url;
  }

  function handleFileInput(files: FileList | null) {
    if (!files || files.length === 0) return;
    validateAndPreviewFile(files[0]);
  }

  function removePhoto() {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setPhotoError(null);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function replacePhotoFromLaterStep() {
    setStep(1);
    setPanelOpen(true);
    scrollToPanel();
    galleryInputRef.current?.click();
  }

  const makeError =
    vehicleAttempted && make.trim().length === 0
      ? "Enter the vehicle make, for example Maruti Suzuki."
      : null;
  const modelError =
    vehicleAttempted && model.trim().length === 0
      ? "Enter the vehicle model, for example Swift."
      : null;
  const yearError =
    year.trim().length > 0 && !/^\d{4}$/.test(year.trim())
      ? "Year must be four digits, for example 2021."
      : null;

  function goToSummary() {
    setVehicleAttempted(true);
    if (make.trim().length === 0 || model.trim().length === 0) {
      setStep(2);
      return;
    }
    setStep(3);
    setPanelOpen(true);
    scrollToPanel();
  }

  const stepLabel = STEP_LABELS[step];

  return (
    <div className="dp-root">
      <p className="dp-notice" role="note">
        <span className="dp-noticeTag">Design preview</span>
        <span>
          A visual proposal only — the current homepage is unchanged and
          nothing here is shared.
        </span>
        <Link href="/" className="dp-noticeLink">
          <ArrowLeft aria-hidden="true" />
          Back to current page
        </Link>
      </p>

      <header className="dp-header">
        <p className="dp-brand">
          <Waves aria-hidden="true" />
          FloodFlow
        </p>
        <button
          type="button"
          onClick={handleHeaderPhotoClick}
          className="dp-photoButton"
        >
          <Camera aria-hidden="true" />
          Click a photo
        </button>
      </header>

      <section className="dp-hero" aria-labelledby="dp-hero-heading">
        <h1 id="dp-hero-heading" className="dp-heroTitle">
          Know the crossing before you commit.
        </h1>
        <span aria-hidden="true" className="dp-heroRule" />
        <p className="dp-heroSub">
          Drop a pin where the water is, then add a photo and your vehicle.
          This preview stays on your device — nothing is shared yet.
        </p>
      </section>

      <main className="dp-layout">
        <section
          ref={mapSectionRef}
          aria-label="Preview map"
          className="dp-mapPlate"
        >
          <div className="dp-toolbar">
            <form className="dp-searchRow" onSubmit={handleSearchSubmit}>
              <label htmlFor="dp-search" className="dp-searchLabel">
                Search location
              </label>
              <div className="dp-searchControls">
                <div className="dp-searchField">
                  <Search aria-hidden="true" />
                  <input
                    id="dp-search"
                    type="search"
                    placeholder="Area or address"
                    autoComplete="off"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    aria-describedby={
                      searchNote ? "dp-search-help dp-search-note" : "dp-search-help"
                    }
                  />
                </div>
                <button type="submit" className="dp-searchSubmit">
                  Search
                </button>
                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={locState === "locating"}
                  className="dp-gpsButton"
                  aria-live="polite"
                >
                  <Crosshair aria-hidden="true" />
                  {locState === "locating" ? "Finding you…" : "Use my location"}
                </button>
              </div>
              <p id="dp-search-help" className="dp-toolbarHelp">
                Place search is not available yet — use your location or drag
                the pin.
              </p>
              {searchNote ? (
                <p id="dp-search-note" role="status" className="dp-toolbarHelp">
                  {searchNote}
                </p>
              ) : null}
            </form>
          </div>

          <div className="dp-mapFrame">
            <span aria-hidden="true" className="dp-tick dp-tickTL" />
            <span aria-hidden="true" className="dp-tick dp-tickTR" />
            <span aria-hidden="true" className="dp-tick dp-tickBL" />
            <span aria-hidden="true" className="dp-tick dp-tickBR" />
            <div className="dp-mapCanvas">
              <PreviewMap
                gps={gps}
                reportPin={pin}
                onReportPinChange={handlePinChange}
                recenterSignal={recenterSignal}
              />
            </div>
            <p className="dp-mapStartLabel">
              Starting view: India (country scale). Not your position.
            </p>
          </div>

          <div className="dp-mapFoot">
            <p className="dp-coords" aria-live="polite">
              <MapPin aria-hidden="true" />
              {pin ? (
                <span className="dp-coordsValue">{formatCoords(pin)}</span>
              ) : (
                <span>
                  No pin placed yet — tap the map or use your location.
                </span>
              )}
            </p>
            <p className="dp-attrib">
              Map © OpenStreetMap contributors · Shared reports are not
              available yet
            </p>
          </div>

          <ul className="dp-legend" aria-label="How map marks look">
            <li>
              <span aria-hidden="true" className="dp-swGps">
                <i />
              </span>
              <span>
                <strong>Your position</strong> — blue dot with accuracy ring
              </span>
            </li>
            <li>
              <span aria-hidden="true" className="dp-swPin">
                !
              </span>
              <span>
                <strong>Report pin</strong> — where you place this crossing
              </span>
            </li>
            <li>
              <span aria-hidden="true" className="dp-swWave">
                <Waves aria-hidden="true" />
              </span>
              <span>
                <strong>Reported flooding</strong> — wave mark with a deeper
                blue wash where reports overlap. None on the map yet.
              </span>
            </li>
          </ul>
        </section>

        <aside
          ref={panelRef}
          aria-label="Report steps"
          className={panelOpen ? "dp-panel dp-panelOpen" : "dp-panel"}
        >
          <button
            type="button"
            className="dp-panelToggle"
            aria-expanded={panelOpen}
            aria-controls="dp-panel-body"
            onClick={() => setPanelOpen((open) => !open)}
          >
            <span>
              Report steps · Step {step + 1} of 4 — {stepLabel}
            </span>
            <ChevronDown aria-hidden="true" />
          </button>

          <div id="dp-panel-body" className="dp-panelBody">
            <ol className="dp-steps" aria-label="Progress">
              {STEP_LABELS.map((label, i) => {
                const done = i < step;
                const current = i === step;
                return (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => {
                        setStep(i as StepId);
                        setPanelOpen(true);
                      }}
                      aria-current={current ? "step" : undefined}
                      className={[
                        "dp-stepTab",
                        current ? "dp-stepCurrent" : "",
                        done ? "dp-stepDone" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span aria-hidden="true" className="dp-stepNum">
                        {done ? "✓" : i + 1}
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div key={step} className="dp-stepPane">
              {step === 0 ? (
                <div>
                  <h2>Where is the water?</h2>
                  <p className="dp-stepHelp">
                    Use the “Use my location” button above the map once, or tap
                    the map to drop the pin and drag it to adjust. The pin
                    never moves your position dot.
                  </p>
                  {locState === "denied" ? (
                    <p role="alert" className="dp-errorText">
                      Location permission was denied. You can try again, or
                      place the pin by hand on the map.{" "}
                      <button
                        type="button"
                        onClick={requestLocation}
                        className="dp-inlineButton"
                      >
                        Try again
                      </button>
                    </p>
                  ) : null}
                  {locState === "timeout" ? (
                    <p role="alert" className="dp-errorText">
                      The location request timed out.{" "}
                      <button
                        type="button"
                        onClick={requestLocation}
                        className="dp-inlineButton"
                      >
                        Try again
                      </button>{" "}
                      or place the pin by hand.
                    </p>
                  ) : null}
                  {locState === "unavailable" ? (
                    <p role="alert" className="dp-errorText">
                      Location is unavailable on this device or browser. Place
                      the pin by hand on the map.
                    </p>
                  ) : null}
                  {locState === "ready" && gps ? (
                    <p role="status" className="dp-okText">
                      Position found — accurate to about {gps.accuracyMeters} m.
                    </p>
                  ) : null}
                  <p className="dp-coordsLine" aria-live="polite">
                    {pin ? (
                      <>
                        Report pin:{" "}
                        <span className="dp-coordsValue">
                          {formatCoords(pin)}
                        </span>
                      </>
                    ) : (
                      "No pin placed yet."
                    )}
                  </p>
                  <div className="dp-stepNav">
                    <button
                      type="button"
                      disabled={!pin}
                      onClick={() => setStep(1)}
                      className="dp-primaryButton"
                    >
                      Continue with this spot
                    </button>
                    {!pin ? (
                      <p className="dp-stepHint">
                        Place the pin first to continue.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div>
                  <h2>Add a photo of the water</h2>
                  <p className="dp-stepHelp">
                    JPEG, PNG, or WebP, up to 10 MB. The actual file you choose
                    is previewed below — nothing is uploaded in this preview.
                  </p>
                  {photoChecking ? (
                    <p role="status" className="dp-stepHelp">
                      Checking the photo…
                    </p>
                  ) : null}
                  {photoError ? (
                    <p role="alert" className="dp-errorText">
                      {photoError}
                    </p>
                  ) : null}
                  {photo ? (
                    <figure className="dp-photoFrame">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={`Preview of the selected photo ${photo.name}`}
                      />
                      <figcaption>
                        {photo.name} · {photo.sizeKb} KB · stays on this device
                      </figcaption>
                    </figure>
                  ) : (
                    !photoChecking && (
                      <div className="dp-photoEmpty">
                        <ImagePlus aria-hidden="true" />
                        <p>No photo chosen yet.</p>
                        <p className="dp-stepHint">
                          Choose a file below to see it here.
                        </p>
                      </div>
                    )
                  )}
                  <div className="dp-photoActions">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="dp-primaryButton"
                    >
                      <Camera aria-hidden="true" />
                      Take photo
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="dp-secondaryButton"
                    >
                      <ImagePlus aria-hidden="true" />
                      Choose from gallery
                    </button>
                  </div>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    hidden
                    aria-label="Take a photo with the camera"
                    onChange={(e) => handleFileInput(e.target.files)}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    aria-label="Choose a photo from the gallery"
                    onChange={(e) => handleFileInput(e.target.files)}
                  />
                  {photo ? (
                    <div className="dp-photoActions">
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="dp-secondaryButton"
                      >
                        <RotateCcw aria-hidden="true" />
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="dp-dangerButton"
                      >
                        <Trash2 aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <div className="dp-stepNav">
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="dp-secondaryButton"
                    >
                      Back to location
                    </button>
                    <button
                      type="button"
                      disabled={!photo}
                      onClick={() => setStep(2)}
                      className="dp-primaryButton"
                    >
                      Continue with this photo
                    </button>
                  </div>
                  {!photo ? (
                    <p className="dp-stepHint">
                      Add a photo to continue — or go back to adjust the pin.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === 2 ? (
                <div>
                  <h2>Your vehicle</h2>
                  <p className="dp-stepHelp">
                    Names only, so a future check can look up real
                    specifications. No specifications are looked up in this
                    preview.
                  </p>
                  <div className="dp-field">
                    <label htmlFor="dp-make">Make</label>
                    <input
                      id="dp-make"
                      type="text"
                      autoComplete="off"
                      placeholder="For example, Maruti Suzuki"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                      aria-invalid={makeError ? true : undefined}
                      aria-describedby={makeError ? "dp-make-error" : undefined}
                    />
                    {makeError ? (
                      <p id="dp-make-error" role="alert" className="dp-fieldError">
                        {makeError}
                      </p>
                    ) : null}
                  </div>
                  <div className="dp-field">
                    <label htmlFor="dp-model">Model</label>
                    <input
                      id="dp-model"
                      type="text"
                      autoComplete="off"
                      placeholder="For example, Swift"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      aria-invalid={modelError ? true : undefined}
                      aria-describedby={modelError ? "dp-model-error" : undefined}
                    />
                    {modelError ? (
                      <p id="dp-model-error" role="alert" className="dp-fieldError">
                        {modelError}
                      </p>
                    ) : null}
                  </div>
                  <div className="dp-fieldRow">
                    <div className="dp-field">
                      <label htmlFor="dp-year">Year</label>
                      <input
                        id="dp-year"
                        type="text"
                        inputMode="numeric"
                        placeholder="2021"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        aria-invalid={yearError ? true : undefined}
                        aria-describedby={yearError ? "dp-year-error" : undefined}
                      />
                      {yearError ? (
                        <p id="dp-year-error" role="alert" className="dp-fieldError">
                          {yearError}
                        </p>
                      ) : null}
                    </div>
                    <div className="dp-field">
                      <label htmlFor="dp-variant">Variant</label>
                      <input
                        id="dp-variant"
                        type="text"
                        autoComplete="off"
                        placeholder="Optional"
                        value={variant}
                        onChange={(e) => setVariant(e.target.value)}
                      />
                    </div>
                  </div>
                  <dl className="dp-specs">
                    <div>
                      <dt>Tyre size</dt>
                      <dd>Not available</dd>
                    </div>
                    <div>
                      <dt>Ground clearance</dt>
                      <dd>Not available</dd>
                    </div>
                    <div>
                      <dt>Exhaust position</dt>
                      <dd>Not available</dd>
                    </div>
                  </dl>
                  <div className="dp-stepNav">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="dp-secondaryButton"
                    >
                      Back to photo
                    </button>
                    <button
                      type="button"
                      onClick={goToSummary}
                      className="dp-primaryButton"
                    >
                      Review summary
                    </button>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div>
                  <h2>Before you decide</h2>
                  <dl className="dp-recap">
                    <div>
                      <dt>Spot</dt>
                      <dd>
                        {pin ? (
                          <span className="dp-coordsValue">
                            {formatCoords(pin)}
                          </span>
                        ) : (
                          "Not placed"
                        )}{" "}
                        <button
                          type="button"
                          onClick={() => setStep(0)}
                          className="dp-inlineButton"
                        >
                          Change
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>Photo</dt>
                      <dd>
                        {photo ? `${photo.name} · ${photo.sizeKb} KB` : "None"}{" "}
                        <button
                          type="button"
                          onClick={replacePhotoFromLaterStep}
                          className="dp-inlineButton"
                        >
                          {photo ? "Replace" : "Add"}
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>Vehicle</dt>
                      <dd>
                        {make.trim() || model.trim()
                          ? `${make.trim()} ${model.trim()}`.trim()
                          : "Not entered"}{" "}
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="dp-inlineButton"
                        >
                          Change
                        </button>
                      </dd>
                    </div>
                  </dl>
                  <div role="status" className="dp-verdict">
                    <p className="dp-verdictTitle">
                      <TriangleAlert aria-hidden="true" />
                      Unable to assess
                    </p>
                    <p>
                      This preview cannot measure depth or declare a crossing
                      safe. Avoid crossing — turn back or wait for the water to
                      recede.
                    </p>
                    <p className="dp-stepHint">
                      Sharing this report and rerouting around reported water
                      are not available yet.
                    </p>
                  </div>
                  <div className="dp-stepNav">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="dp-secondaryButton"
                    >
                      Back to vehicle
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </main>

      <footer className="dp-footer">
        <p>
          Preview only — map © OpenStreetMap contributors. Photos stay on this
          device.
        </p>
        <Link href="/" className="dp-noticeLink">
          <ArrowLeft aria-hidden="true" />
          Back to current page
        </Link>
      </footer>
    </div>
  );
}
