import { listMakes, suggestModels, lookupVehicleSpecs } from "../../../lib/vehicle-catalog";
import { lookupVehicleReference } from "../../../lib/vehicle-report-context";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const make = (query.get("make") ?? "").slice(0, 100);
  const model = (query.get("model") ?? "").slice(0, 100);
  const year = (query.get("year") ?? "").slice(0, 10);
  const variant = (query.get("variant") ?? "").slice(0, 100);
  return Response.json({ makes: listMakes(), models: suggestModels(make), specs: lookupVehicleSpecs({ make, model, year, variant }), referenceStats: lookupVehicleReference(make, model), note: "Current manufacturer references are separate from exact model-year specifications. Unverified dimensions are never generated." });
}
