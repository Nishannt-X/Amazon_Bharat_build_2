/** Basemap sources. Default: Esri "Canvas / World Dark Gray" base plus its
 * separate Reference (labels) layer. Esri's reference labels are drawn in
 * English/Latin script worldwide (checked on Korea, Japan, China, Iran, India
 * tiles). Detail is worldwide to level 10 and to level 16 only in the regions
 * Esri lists (incl. India); beyond that Leaflet upscales the last real tiles.
 * No key is sent. Esri requires attribution and its terms apply; for a
 * production launch confirm usage terms or move to a keyed provider.
 *
 * Override with ONE already-dark, English-label raster template:
 *   NEXT_PUBLIC_MAP_TILE_URL="https://.../{z}/{x}/{y}.png?key=..."
 *   NEXT_PUBLIC_MAP_TILE_ATTRIBUTION="provider credit (HTML allowed)"
 * Language and dark styling of an override are the provider's responsibility. */

export interface TileSource {
  url: string;
  attribution: string;
  maxNativeZoom: number;
  /** Transparent label overlay drawn above the base. */
  labelsUrl?: string;
}

const ESRI_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS user community';

const ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas";

export function getTileSource(): TileSource {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  if (url) {
    return {
      url,
      attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxNativeZoom: 19,
    };
  }
  return {
    url: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
    maxNativeZoom: 16,
  };
}
