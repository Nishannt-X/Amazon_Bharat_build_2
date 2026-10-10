"use client";

import { useEffect, useState } from "react";
import { CarFront, CircleHelp, ShieldAlert } from "lucide-react";
import { VEHICLE_NAMES } from "../lib/vehicle-catalog";
import { isCarEntry, type ResearchClearance } from "../lib/vehicle-research";
import type { VehicleDetails } from "../lib/report";
import { modelYearFromAge, type VehicleReferenceStats } from "../lib/vehicle-report-context";

const CAR_MODELS = VEHICLE_NAMES.filter(isCarEntry);
const CAR_MAKES = Array.from(new Set(CAR_MODELS.map((entry) => entry.make)));
type ResearchView = ResearchClearance & { display: { value: string; caption: string } };
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

interface Props {
  onVehicleChange?: (vehicle: VehicleDetails) => void;
  observedDepthCm?: number | null;
}

export default function VehicleContextPanel({ onVehicleChange, observedDepthCm = null }: Props) {
  const [modelId, setModelId] = useState("");
  const [age, setAge] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; reference: VehicleReferenceStats | null; research: ResearchView | null } | null>(null);
  const [error, setError] = useState("");
  const [currentYear] = useState(() => new Date().getFullYear());
  const model = CAR_MODELS.find((entry) => entry.id === modelId);
  const year = modelYearFromAge(age, currentYear);
  const queryKey = model && year ? `${model.id}/${year}` : "";
  const loading = Boolean(queryKey && result?.key !== queryKey && !error);
  const reference = result?.key === queryKey ? result.reference : null;
  const research = result?.key === queryKey ? result.research : null;

  function changeVehicle(nextId: string, nextAge: string) {
    setModelId(nextId);
    setAge(nextAge);
    setError("");
    setResult(null);
    const entry = CAR_MODELS.find((item) => item.id === nextId);
    onVehicleChange?.({ make: entry?.make ?? "", model: entry?.model ?? "", year: modelYearFromAge(nextAge, currentYear) ?? "", variant: "" });
  }

  useEffect(() => {
    if (!model || !year) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setError("Vehicle details took too long to load. Please retry.");
      controller.abort();
    }, 10000);
    const query = new URLSearchParams({ make: model.make, model: model.model, age, year });
    fetch(`/api/vehicles?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Vehicle details could not load.");
        const data = await response.json() as { referenceStats: VehicleReferenceStats | null; researchClearance: ResearchView | null };
        if (!controller.signal.aborted) setResult({ key: queryKey, reference: data.referenceStats ?? null, research: data.researchClearance ?? null });
      })
      .catch(() => { if (!controller.signal.aborted) setError("Vehicle details could not load. Please retry."); })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [model, age, year, queryKey, retry]);

  return (
    <section className="ff-vehicle-panel" aria-labelledby="vehicle-context-heading">
      <div className="ff-vehicle-heading">
        <span className="ff-vehicle-eyebrow">Your vehicle</span>
        <h2 id="vehicle-context-heading">A little context. A better next step.</h2>
        <p>Choose your car to see the information available for it.</p>
      </div>
      <div className="ff-vehicle-columns">
        <div className="ff-vehicle-form">
          <CarFront size={27} aria-hidden="true" />
          <h3>What do you drive?</h3>
          <label htmlFor="report-car-model">Car model</label>
          <select id="report-car-model" value={modelId} onChange={(event) => changeVehicle(event.target.value, age)}>
            <option value="">Select your car</option>
            {CAR_MAKES.map((make) => <optgroup key={make} label={make}>{CAR_MODELS.filter((entry) => entry.make === make).map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</optgroup>)}
          </select>
          <label htmlFor="report-car-age">Car age in years</label>
          <input id="report-car-age" type="number" inputMode="numeric" min="0" max="46" step="1" placeholder="e.g. 3" value={age} onChange={(event) => changeVehicle(modelId, event.target.value)} aria-describedby="report-car-year" />
          <p id="report-car-year" className="ff-vehicle-small">{year ? `Model year: ${year} (${currentYear} − ${Number(age)} years).` : age ? "Enter a whole number from 0 to 46." : "We use today's year minus your car's age to remember its model year."}</p>
          <p className="ff-vehicle-small">Age alone does not identify a trim, vehicle condition, or resale value.</p>
        </div>
        <div className="ff-vehicle-stats" aria-live="polite" aria-busy={loading}>
          <span className="ff-vehicle-eyebrow">Vehicle details</span>
          <h3>{model ? `${model.displayName}${year ? ` · ${year}` : ""}` : "Your car, at a glance"}</h3>
          {!queryKey ? <div className="ff-vehicle-empty"><CircleHelp aria-hidden="true" /><p>Select a model and age to load available manufacturer references.</p></div> : loading ? <p className="ff-vehicle-empty">Loading vehicle details…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry details</button></div> : <>
            <p className="ff-vehicle-referenceLabel">{reference?.label ?? "Manufacturer reference not yet available"}</p>
            <dl className="ff-vehicle-metrics">
              <div><dt>New-car price benchmark</dt><dd>{reference ? `From ${money.format(reference.startingPriceInr)}` : "Unavailable"}</dd><small>Starting ex-showroom price. Not your car&apos;s resale value.</small></div>
              <div data-testid="research-clearance"><dt>Ground clearance (research)</dt><dd>{research ? research.display.value : reference?.groundClearanceMm != null ? `${reference.groundClearanceMm} mm` : "Unavailable"}</dd><small>{research?.status === "no-reliable-value" || !research ? (reference?.clearanceBasis ?? "No sourced India reference in this catalog.") : research.display.caption}</small>{research && research.records.length > 0 && <small className="ff-vehicle-researchSources">Sources: {research.records.slice(0, 3).map((record, index) => <a key={record.sourceUrl} href={record.sourceUrl} target="_blank" rel="noreferrer">{index + 1}{record.sourceKind.startsWith("oem") ? " (maker)" : " (secondary)"}</a>)}</small>}</div>
              <div><dt>Your exact year / trim</dt><dd>Not verified</dd><small>Current references may differ from your car.</small></div>
              <div><dt>Air intake / exhaust / wading</dt><dd>Not verified</dd><small>Ground clearance is not a water-crossing limit.</small></div>
            </dl>
            {reference && <div className="ff-vehicle-sources"><p>Manufacturer references checked {reference.checkedAt}. Prices can change.</p>{reference.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div>}
          </>}
        </div>
      </div>
      {queryKey && <div className="ff-vehicle-guidance" aria-labelledby="report-risk-heading">
        <ShieldAlert size={25} aria-hidden="true" />
        <div><span className="ff-vehicle-eyebrow">Your next step</span><h3 id="report-risk-heading">Risk cannot be scored yet.</h3><p className="ff-vehicle-confidence">Confidence: unavailable · Photo analysis bypassed</p>
          <p>{observedDepthCm == null ? "Water depth has not been measured from this photo." : `The reported ${observedDepthCm} cm depth is an unverified observation.`} We also need verified specifications for your exact vehicle before making a vehicle-specific assessment.</p>
          <p>Potential risks include water entering the engine intake, electrical damage, losing traction, and becoming stranded. Moving water, hidden damage to the road, and vehicle load can change the outcome. A higher ground clearance or a newer car does not establish a safe crossing.</p>
          <p className="ff-vehicle-recommendation">Choose another route while depth and conditions remain uncertain. Your report can still help document what is happening.</p>
        </div>
      </div>}
    </section>
  );
}
