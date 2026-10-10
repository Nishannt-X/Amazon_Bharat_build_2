import { listMakes, suggestModels, lookupVehicleSpecs } from "../../../lib/vehicle-catalog";
import { lookupVehicleReference, modelYearFromAge } from "../../../lib/vehicle-report-context";
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
  return Response.json({ makes: listMakes(), models: suggestModels(make), modelYear: year || null, specs: lookupVehicleSpecs({ make, model, year, variant }), referenceStats: lookupVehicleReference(make, model), note: "Current manufacturer references are separate from exact model-year specifications. Unverified dimensions are never generated." });
}
