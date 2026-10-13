"use client";

import { useEffect, useState } from "react";
import { CarFront, ShieldAlert } from "lucide-react";
import { VEHICLE_NAMES } from "../lib/vehicle-catalog";
import VehicleCombobox from "./VehicleCombobox";
import { type ResearchClearance } from "../lib/vehicle-research";
import { waterlogGuidance, type PublicAnalysis } from "../lib/photo-analysis";
import type { GarageCar } from "../lib/account-store";
import type { physicalEvidenceForSelection } from "../lib/vehicle-physical-evidence";
type PhysicalView = ReturnType<typeof physicalEvidenceForSelection>;
import type { Recommendation } from "../lib/vehicle-recommendations";
import type { VehicleDetails } from "../lib/report";
import {
  modelYearFromAge,
  type VehicleReferenceStats,
} from "../lib/vehicle-report-context";

const PERSONAL_MODELS = VEHICLE_NAMES.filter((entry) => entry.make !== "DTC");
type ResearchView = ResearchClearance & {
  display: { value: string; caption: string };
};
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

interface Props {
  readOnly?: boolean;
  onVehicleChange?: (vehicle: VehicleDetails) => void;
  observedDepthCm?: number | null;
  analysis?: PublicAnalysis | null;
  onAddContext?: () => void;
  accountCars?: GarageCar[];
  canSaveCar?: boolean;
  onCarsChange?: (cars: GarageCar[]) => void;
}

export default function VehicleContextPanel({
  readOnly = false,
  onVehicleChange,
  accountCars = [],
  canSaveCar = false,
  onCarsChange,
  analysis = null,
  onAddContext,
}: Props) {
  const [modelId, setModelId] = useState("");
  const [age, setAge] = useState("");
  const [variant, setVariant] = useState("");
  const [garageId, setGarageId] = useState("");
  const [savingCar, setSavingCar] = useState(false);
  const [garageMessage, setGarageMessage] = useState("");
  const [recommendationResult, setRecommendation] = useState<(Recommendation & {inputKey:string}) | null>(null);
  const [recommendationError, setRecommendationError] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    reference: VehicleReferenceStats | null;
    research: ResearchView | null;
    physical: PhysicalView | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [currentYear] = useState(() => new Date().getFullYear());
  const model = PERSONAL_MODELS.find((entry) => entry.id === modelId);
  const year = modelYearFromAge(age, currentYear);
  const queryKey = model && year ? `${model.id}/${year}/${variant}` : "";
  const recommendationKey = `${queryKey}/${JSON.stringify(analysis)}`;
  const recommendation = recommendationResult?.inputKey === recommendationKey ? recommendationResult : null;
  const loading = Boolean(queryKey && result?.key !== queryKey && !error);
  const reference = result?.key === queryKey ? result.reference : null;
  const guidance = recommendation ? {level:recommendation.level,label:recommendation.level==="high"?"High risk · Turn back":recommendation.level==="lower"?"Lower depth-related risk":"Caution · Check conditions",heading:recommendation.heading} : waterlogGuidance(analysis);
  const displayedConfidence = analysis?.contextConfidence ?? analysis?.confidence;
  const research = result?.key === queryKey ? result.research : null;
  const physical = result?.key === queryKey ? result.physical : null;

  function changeVehicle(nextId: string, nextAge: string, nextVariant = "") {
    setVariant(nextVariant);
    setRecommendation(null);setRecommendationError("");setGarageMessage("");
    setModelId(nextId);
    setAge(nextAge);
    setError("");
    setResult(null);
    const entry = PERSONAL_MODELS.find((item) => item.id === nextId);
    onVehicleChange?.({
      make: entry?.make ?? "",
      model: entry?.model ?? "",
      year: modelYearFromAge(nextAge, currentYear) ?? "",
      variant: nextVariant,
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
      variant,
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
          physicalEvidence: PhysicalView | null;
        };
        if (!controller.signal.aborted)
          setResult({
            key: queryKey,
            reference: data.referenceStats ?? null,
            research: data.researchClearance ?? null,
            physical: data.physicalEvidence ?? null,
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
  }, [model, year, age, variant, queryKey, retry]);

  useEffect(() => {
    if (readOnly || !model || !year || !analysis) return;
    const controller = new AbortController();
    fetch("/api/recommendations", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({analysisId:analysis.id,vehicle:{make:model.make,model:model.model,year,variant}}),signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted){setRecommendation({...data.recommendation,inputKey:recommendationKey});setRecommendationError("");}}).catch(error=>{if(!controller.signal.aborted)setRecommendationError(error.message || "Recommendation could not load. Select vehicle (Car, Scooter, or Motorcycle) again to retry.");});
    return ()=>controller.abort();
  }, [model, year, variant, analysis, recommendationKey, readOnly]);

  async function saveCar() {
    if(!model || !year)return;setSavingCar(true);setGarageMessage("");
    try {const response=await fetch("/api/garage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vehicleId:model.id,year,variant})});const data=await response.json();if(!response.ok)throw new Error(data.error);onCarsChange?.(data.cars);setGarageId(data.cars.at(-1)?.id ?? "");setGarageMessage("Car added to your garage.");}
    catch(error){setGarageMessage(error instanceof Error?error.message:"Car could not save.");}finally{setSavingCar(false);}
  }

  return (
    <section
      className="ff-vehicle-panel"
      aria-labelledby="vehicle-context-heading"
    >
      <div className="ff-vehicle-heading">
        <span className="ff-vehicle-eyebrow">Photo & vehicle context</span>
        <h2 id="vehicle-context-heading">{canSaveCar && !onVehicleChange ? "Your garage." : "Your evidence. Your vehicle."}</h2>
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
              {analysis ? `${displayedConfidence}%` : "Unavailable"}
            </strong>
            <span>Confidence</span>
            {analysis && (
              <progress
                max={100}
                value={displayedConfidence}
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
          {canSaveCar && <div className="ff-garage"><label htmlFor="saved-car">Your saved cars</label><select id="saved-car" value={garageId} onChange={event=>{setGarageId(event.target.value);const car=accountCars.find(item=>item.id===event.target.value);if(car)changeVehicle(car.vehicleId,String(currentYear-Number(car.year)),car.variant);else changeVehicle("","");}}><option value="">Add another car / select a saved car</option>{accountCars.map(car=><option value={car.id} key={car.id}>{car.make} {car.model} · {car.year}{car.variant ? ` · ${car.variant}` : ""}</option>)}</select></div>}

          <div className="ff-vehicle-inputGrid">
            <div>
              <label htmlFor="report-car-model">Vehicle model (Car, Scooter, Bike)</label>
              <VehicleCombobox
                id="report-car-model"
                value={modelId}
                options={PERSONAL_MODELS}
                onChange={(id) => {setGarageId("");changeVehicle(id, age, variant);}}
              />
            </div>
            <div>
              <label htmlFor="report-car-age">Vehicle age in years</label>
              <input
                id="report-car-age"
                type="number"
                inputMode="numeric"
                min="0"
                max="46"
                step="1"
                placeholder="e.g. 3"
                value={age}
                onChange={(event) => {setGarageId("");changeVehicle(modelId, event.target.value, variant);}}
                aria-describedby="report-car-year"
              />
            </div>
          </div>
          <label htmlFor="report-car-trim">Trim / variant (optional)</label><input id="report-car-trim" maxLength={100} value={variant} placeholder="e.g. LXi" onChange={event=>{setGarageId("");changeVehicle(modelId,age,event.target.value);}}/>
          {canSaveCar && <div className="ff-garage"><button type="button" disabled={!queryKey || savingCar || Boolean(garageId)} onClick={()=>void saveCar()}>{savingCar ? "Saving car…" : "Add car"}</button>{garageMessage && <p role="status">{garageMessage}</p>}</div>}
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
                        {reference?.startingPriceInr != null
                          ? `From ${money.format(reference.startingPriceInr)}`
                          : "Unavailable"}
                      </dd>
                      <small>
                        Starting ex-showroom price; not your car’s resale value.
                      </small>
                    </div>
                    <div data-testid="research-clearance">
                      <dt>Ground clearance (reference)</dt>
                      <dd>
                        {reference?.groundClearanceMm != null
                            ? `${reference.groundClearanceMm} mm`
                            : research?.display.value ?? "Unavailable"}
                      </dd>
                      <small>
                        {reference?.groundClearanceMm != null || research?.status === "no-reliable-value" || !research
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
                      <dt>Your year / trim references</dt>
                      <dd>{physical?.yearLabel ?? "Production-period reference needed"}</dd>
                      <small>{physical?.trimLabel ?? "Exact trim still needs a documented reference."}</small>
                      {physical?.transitionYear && <small>Build month is needed to choose between editions.</small>}
                      {physical?.matchingManuals.map(manual => (
                        <small key={manual.url}><a href={manual.url} target="_blank" rel="noreferrer">{manual.label} ↗</a></small>
                      ))}
                    </div>
                    <div>
                      <dt>Air intake height</dt>
                      <dd>{physical?.intake.valueMm != null ? `${physical.intake.valueMm} mm` : physical?.intake.status === "not-applicable" ? "Not applicable · electric" : "Measurement not sourced"}</dd>
                      <small>{physical?.intake.note ?? "A documented height or physical measurement is needed."}</small>
                    </div>
                    <div>
                      <dt>Exhaust outlet height</dt>
                      <dd>{physical?.exhaust.valueMm != null ? `${physical.exhaust.valueMm} mm` : physical?.exhaust.status === "not-applicable" ? "Not applicable · electric" : "Measurement not sourced"}</dd>
                      <small>{physical?.exhaust.note ?? "A documented outlet height or physical measurement is needed."}</small>
                    </div>
                    <div>
                      <dt>OEM wading reference</dt>
                      <dd>{physical?.wading ? `${physical.wading.valueMm} mm` : reference?.wadingMm != null ? `${reference.wadingMm} mm` : "Numeric reference not sourced"}</dd>
                      <small>{physical?.wading?.scope ?? "Ground clearance is not a wading depth. A numerical OEM limit has not been sourced for this model."}</small>
                      {physical?.wading && <><small>{physical.wading.conditions}</small><small><a href={physical.wading.url} target="_blank" rel="noreferrer">{physical.wading.label} ↗</a></small></>}
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
                ? `Confidence: ${displayedConfidence}%`
                : "Confidence unavailable"}
            </p>
            {recommendation ? <><ul>{recommendation.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul><ol>{recommendation.actions.map((action,index)=><li key={index}>{action}</li>)}</ol><p className="ff-vehicle-small">Provider: {recommendation.provider}. {recommendation.providerNote}</p></> : <p role="status">{recommendationError || (analysis ? "Preparing your vehicle-specific recommendation…" : "Upload and analyze a photo for a vehicle-specific recommendation.")}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
