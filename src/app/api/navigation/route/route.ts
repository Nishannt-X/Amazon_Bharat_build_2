import { validNavigationPoint } from '../../../../lib/navigation';
import { readReports } from '../../../../lib/report-store';
import { getNavigationRoutes, NavigationProviderError } from '../../../../lib/navigation-provider';
import type { VehicleDetails } from '../../../../lib/report';

export async function POST(request: Request) {
  try {
    // Bound JSON even when a client omits or falsifies Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return Response.json({error:'Missing route request.'}, {status:400});
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 80000) { await reader.cancel(); return Response.json({error:'Route request is too large.'}, {status:413}); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({error:'Invalid route request.'}, {status:400});
    if (!validNavigationPoint(body.start) || !validNavigationPoint(body.end)) return Response.json({error:'Choose valid start and destination coordinates.'}, {status:400});
    const vehicle = body.vehicle as VehicleDetails;
    if (!vehicle || !['make','model','year','variant'].every(k => typeof (vehicle as unknown as Record<string,unknown>)[k] === 'string' && String((vehicle as unknown as Record<string,unknown>)[k]).length <= 100)) return Response.json({error:'Provide valid vehicle details.'}, {status:400});
    const threshold = body.preference?.avoidanceDepthCm;
    if (threshold != null && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 300)) return Response.json({error:'Invalid avoidance preference.'}, {status:400});
    // Use authoritative shared evidence; a caller cannot remove warnings.
    const reports = await readReports();
    const result = await getNavigationRoutes(body.start, body.end, reports, vehicle, {orsKey:process.env.OPENROUTESERVICE_API_KEY,preference:{avoidanceDepthCm:threshold??null}});
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({error:'Invalid route request.'}, {status:400});
    return Response.json({error: error instanceof NavigationProviderError ? error.message : 'Road routing is unavailable. Please try again.'}, {status:502});
  }
}
