import { listMakes, suggestModels, lookupVehicleSpecs } from "../../../lib/vehicle-catalog";
import { describeResearchClearance, lookupResearchClearance } from "../../../lib/vehicle-research";
import { modelYearFromAge } from "../../../lib/vehicle-report-context";
import { physicalEvidenceForSelection } from "../../../lib/vehicle-physical-evidence";
import { readVehicleReference, readVehicleCatalog } from "../../../lib/vehicle-store";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const make = (query.get("make") ?? "").slice(0, 100);
  const model = (query.get("model") ?? "").slice(0, 100);
  let year = (query.get("year") ?? "").slice(0, 10);
  if (query.has("age")) {
    const derivedYear = modelYearFromAge(query.get("age") ?? "", new Date().getFullYear());
    if (!derivedYear) return Response.json({ error: "Car age must be a whole number from 0 to 46." }, { status: 400 });
    if (year && year !== derivedYear) return Response.json({ error: "Vehicle year does not match the supplied age." }, { status: 400 });
    year = derivedYear;
  }
  const variant = (query.get("variant") ?? "").slice(0, 100);
  const stored = readVehicleReference(make, model);
  const research = stored.research ?? lookupResearchClearance(make, model);
  return Response.json({ catalog: readVehicleCatalog(), makes: listMakes(), models: suggestModels(make), modelYear: year || null, specs: lookupVehicleSpecs({ make, model, year, variant }), referenceStats: stored.reference, physicalEvidence: stored.physical ? physicalEvidenceForSelection(stored.physical, year, variant) : null, researchClearance: { ...research, display: describeResearchClearance(research) }, note: "Database catalog includes research candidates and a limited OEM benchmark subset. References keep their original date, year/trim scope and units; unsupported intake/exhaust/wading remain unknown. Clearance is never a crossing limit." },{headers:{"Cache-Control":"no-store"}});
}
