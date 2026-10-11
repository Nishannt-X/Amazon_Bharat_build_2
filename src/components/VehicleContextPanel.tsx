"use client";

import { useEffect, useState } from "react";
import { CarFront, ShieldAlert } from "lucide-react";
import { VEHICLE_NAMES } from "../lib/vehicle-catalog";
import { isCarEntry, type ResearchClearance } from "../lib/vehicle-research";
import { waterlogGuidance, type PublicAnalysis } from "../lib/photo-analysis";
import type { VehicleDetails } from "../lib/report";
import {
  modelYearFromAge,
  type VehicleReferenceStats,
} from "../lib/vehicle-report-context";

const CAR_MODELS = VEHICLE_NAMES.filter(isCarEntry);
const CAR_MAKES = Array.from(new Set(CAR_MODELS.map((entry) => entry.make)));
type ResearchView = ResearchClearance & {
  display: { value: string; caption: string };
};
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

interface Props {
  onVehicleChange?: (vehicle: VehicleDetails) => void;
  observedDepthCm?: number | null;
  analysis?: PublicAnalysis | null;
  onAddContext?: () => void;
}

export default function VehicleContextPanel({
  onVehicleChange,
  observedDepthCm = null,
  analysis = null,
  onAddContext,
}: Props) {
  const [modelId, setModelId] = useState("");
  const [age, setAge] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    reference: VehicleReferenceStats | null;
    research: ResearchView | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [currentYear] = useState(() => new Date().getFullYear());
  const model = CAR_MODELS.find((entry) => entry.id === modelId);
  const year = modelYearFromAge(age, currentYear);
  const queryKey = model && year ? `${model.id}/${year}` : "";
  const loading = Boolean(queryKey && result?.key !== queryKey && !error);
  const reference = result?.key === queryKey ? result.reference : null;
  const guidance = waterlogGuidance(analysis);
  const research = result?.key === queryKey ? result.research : null;

  function changeVehicle(nextId: string, nextAge: string) {
    setModelId(nextId);
    setAge(nextAge);
    setError("");
    setResult(null);
    const entry = CAR_MODELS.find((item) => item.id === nextId);
    onVehicleChange?.({
      make: entry?.make ?? "",
      model: entry?.model ?? "",
      year: modelYearFromAge(nextAge, currentYear) ?? "",
      variant: "",
    });
  }

  useEffect(() => {
    if (!model || !year) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setError("Vehicle details took too long to load. Please retry.");
      controller.abort();
    }, 10000);
    const query = new URLSearchParams({
      make: model.make,
      model: model.model,
      age,
      year,
    });
    fetch(`/api/vehicles?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Vehicle details could not load.");
        const data = (await response.json()) as {
          referenceStats: VehicleReferenceStats | null;
          researchClearance: ResearchView | null;
        };
        if (!controller.signal.aborted)
          setResult({
            key: queryKey,
            reference: data.referenceStats ?? null,
            research: data.researchClearance ?? null,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Vehicle details could not load. Please retry.");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [model, year, age, queryKey, retry]);

  return (
    <section
      className="ff-vehicle-panel"
      aria-labelledby="vehicle-context-heading"
    >
      <div className="ff-vehicle-heading">
        <span className="ff-vehicle-eyebrow">Photo & vehicle context</span>
        <h2 id="vehicle-context-heading">Your evidence. Your vehicle.</h2>
      </div>
      <div className="ff-vehicle-columns ff-vehicle-evidenceColumns">
        <aside
          className="ff-vehicle-photoMetrics"
          aria-label="Photo analysis metrics"
        >
          <span className="ff-vehicle-eyebrow">
            {analysis?.answers.length
              ? "Photo & added context"
              : "From your photo"}
          </span>
          <h3>Evidence at a glance</h3>
          <div className="ff-vehicle-photoConfidence">
            <strong>
              {analysis ? `${analysis.confidence}%` : "Unavailable"}
            </strong>
            <span>Evidence confidence · experimental</span>
            {analysis && (
              <progress
                max={100}
                value={analysis.confidence}
                aria-label="Evidence confidence"
              />
            )}
          </div>
          <dl>
            <div>
              <dt>Estimated water depth</dt>
              <dd>
                {analysis?.depthMm == null
                  ? "Unknown"
                  : `${analysis.depthMm} mm`}
              </dd>
            </div>
            {analysis?.depthRangeMm && (
              <div>
                <dt>Depth range</dt>
                <dd>
                  {analysis.depthRangeMm[0]}–{analysis.depthRangeMm[1]} mm
                </dd>
              </div>
            )}
            <div>
              <dt>Environmental risk score</dt>
              <dd>
                {analysis?.riskScore == null
                  ? "Unknown"
                  : `${analysis.riskScore} / 100`}
              </dd>
            </div>
            <div>
              <dt>Risk type</dt>
              <dd>{analysis?.riskType ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Road type</dt>
              <dd>{analysis?.scene.roadType ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Visible traffic</dt>
              <dd>{analysis?.scene.traffic.join(", ") || "Unknown"}</dd>
            </div>
          </dl>
          {analysis?.depthSource === "demo-assumed-reference" && (
            <p className="ff-vehicle-small">
              Demo estimate uses the prototype’s 250 mm reference assumption.
            </p>
          )}
          {analysis?.depthSource === "citizen-body-reference" && (
            <p className="ff-vehicle-small">
              Depth includes your body-relative observation; it is not a
              photo-only measurement.
            </p>
          )}
          <p className="ff-vehicle-small">
            {analysis?.publication === "eligible"
              ? "Evidence meets the publication threshold."
              : "Pending more evidence before global publication."}
          </p>
          {analysis && onAddContext && (
            <button className="ff-vehicle-contextButton" onClick={onAddContext}>
              Help in adding context
            </button>
          )}
        </aside>
        <div className="ff-vehicle-form ff-vehicle-rightPanel">
          <CarFront size={27} aria-hidden="true" />
          <h3>What do you drive?</h3>
          <div className="ff-vehicle-inputGrid">
            <div>
              <label htmlFor="report-car-model">Car model</label>
              <select
                id="report-car-model"
                value={modelId}
                onChange={(event) => changeVehicle(event.target.value, age)}
              >
                <option value="">Select your car</option>
                {CAR_MAKES.map((make) => (
                  <optgroup key={make} label={make}>
                    {CAR_MODELS.filter((entry) => entry.make === make).map(
                      (entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.displayName}
                        </option>
                      ),
                    )}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="report-car-age">Car age in years</label>
              <input
                id="report-car-age"
                type="number"
                inputMode="numeric"
                min="0"
                max="46"
                step="1"
                placeholder="e.g. 3"
                value={age}
                onChange={(event) => changeVehicle(modelId, event.target.value)}
                aria-describedby="report-car-year"
              />
            </div>
          </div>
          <p id="report-car-year" className="ff-vehicle-small">
            {year
              ? `Model year: ${year} (${currentYear} − ${Number(age)} years).`
              : age
                ? "Enter a whole number from 0 to 46."
                : "Choose a model and its age to load vehicle details here."}
          </p>
          {queryKey && (
            <div
              className="ff-vehicle-inlineDetails"
              aria-live="polite"
              aria-busy={loading}
            >
              <span className="ff-vehicle-eyebrow">Vehicle details</span>
              <h3>
                {model?.displayName} · {year}
              </h3>
              {loading ? (
                <p>Loading vehicle details…</p>
              ) : error ? (
                <div role="alert">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setRetry((value) => value + 1);
                    }}
                  >
                    Retry details
                  </button>
                </div>
              ) : (
                <>
                  <p className="ff-vehicle-referenceLabel">
                    {reference?.label ??
                      "Manufacturer reference not yet available"}
                  </p>
                  <dl className="ff-vehicle-metrics">
                    <div>
                      <dt>New-car price benchmark</dt>
                      <dd>
                        {reference
                          ? `From ${money.format(reference.startingPriceInr)}`
                          : "Unavailable"}
                      </dd>
                      <small>
                        Starting ex-showroom price; not your car’s resale value.
                      </small>
                    </div>
                    <div data-testid="research-clearance">
                      <dt>Ground clearance (research)</dt>
                      <dd>
                        {research
                          ? research.display.value
                          : reference?.groundClearanceMm != null
                            ? `${reference.groundClearanceMm} mm`
                            : "Unavailable"}
                      </dd>
                      <small>
                        {research?.status === "no-reliable-value" || !research
                          ? (reference?.clearanceBasis ??
                            "No sourced India reference in this catalog.")
                          : research.display.caption}
                      </small>
                      {research && research.records.length > 0 && (
                        <small className="ff-vehicle-researchSources">
                          Sources:{" "}
                          {research.records.slice(0, 3).map((record, index) => (
                            <a
                              key={record.sourceUrl}
                              href={record.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {index + 1}
                              {record.sourceKind.startsWith("oem")
                                ? " (maker)"
                                : " (secondary)"}
                            </a>
                          ))}
                        </small>
                      )}
                    </div>
                    <div>
                      <dt>Your exact year / trim</dt>
                      <dd>Not verified</dd>
                      <small>
                        Current references may differ from your car.
                      </small>
                    </div>
                    <div>
                      <dt>Air intake / exhaust / wading</dt>
                      <dd>Not verified</dd>
                      <small>
                        Ground clearance is not a water-crossing limit.
                      </small>
                    </div>
                  </dl>
                  {reference && (
                    <div className="ff-vehicle-sources">
                      <p>
                        Manufacturer references checked {reference.checkedAt}.
                      </p>
                      {reference.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {source.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {queryKey && (
        <div
          className={`ff-vehicle-guidance ff-vehicle-guidance--${guidance.level}`}
          aria-labelledby="report-risk-heading"
        >
          <ShieldAlert size={25} aria-hidden="true" />
          <div>
            <span className="ff-vehicle-eyebrow">Your next step</span>
            <span className="ff-vehicle-riskBadge">{guidance.label}</span>
            <h3 id="report-risk-heading">{guidance.heading}</h3>
            <p className="ff-vehicle-confidence">
              {analysis
                ? `Evidence confidence: ${analysis.confidence}% · experimental`
                : "Confidence unavailable"}
            </p>
            <p>
              {observedDepthCm == null
                ? "Water depth has not been established from this photo."
                : `The estimated ${Math.round(observedDepthCm * 10)} mm depth remains unverified.`}{" "}
              Your exact vehicle specifications are also needed for personalized
              risk.
            </p>
            <p>
              Potential risks include water entering the engine intake,
              electrical damage, losing traction, and becoming stranded. Moving
              water and hidden road damage can change the outcome.
            </p>
            <p className="ff-vehicle-recommendation">
              Choose another route while depth and conditions remain uncertain.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
