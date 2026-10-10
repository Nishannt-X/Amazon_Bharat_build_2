/** Basemap sources. Default: Esri "World Topo Map" (no key) in both themes: parks,
 * forests, water, contours/terrain, landmark and POI icons with labels, in one
 * raster layer. Labels are English/Latin worldwide, and bilingual (local script
 * plus English) where Esri maps local names, e.g. Japan. Esri documents detail
 * to ~1:4k for India (tile level 17 verified at India Gate); elsewhere the last
 * real tile is upscaled by Leaflet, and some regions only reach lower levels.
 * Dark mode has no native Esri topo equivalent, so the same tiles are recoloured
 * with a CSS filter on the tile images (see map-theme.module.css), which keeps
 * landmark and nature detail but is an approximation of a true dark style.
 * KNOWN GAPS of this keyless default: Esri says World_Topo_Map is a deprecated,
 * no-longer-updated tile layer (community.esri.com thread 1406137, Apr 2024), its
 * terms live at goto.arcgisonline.com/maps/World_Topo_Map (not a documented API
 * for third-party production use), and labels are bilingual in some regions (Japan).
 * For guaranteed English labels set NEXT_PUBLIC_ESRI_BASEMAP_KEY (see below).
 * (Carto Voyager/Dark Matter were checked and now return "API key required";
 * tile.openstreetmap.org blocks apps that break its tile usage policy.)
 *
 * Override with English-label raster templates, one per mode:
 *   NEXT_PUBLIC_MAP_TILE_URL="https://.../{z}/{x}/{y}.png?key=..."        (dark mode)
 *   NEXT_PUBLIC_MAP_TILE_URL_LIGHT="https://.../{z}/{x}/{y}.png?key=..."  (light mode)
 *   NEXT_PUBLIC_MAP_TILE_ATTRIBUTION="provider credit (HTML allowed)"
 * Without a light override, light mode uses the Esri topo default. A dark
 * override is used as-is, unfiltered. Language and styling of an override are
 * the provider's responsibility. */

export interface TileSource {
  url: string;
  attribution: string;
  maxNativeZoom: number;
  /** Tiles are light-styled; recoloured by CSS only while the map is in dark mode. */
  filterDark?: boolean;
}

const ESRI_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS user community';

const ESRI_TOPO = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";

export type MapTheme = "light" | "dark";

/* Optional English-guaranteed layer: Esri Basemap Styles "static tile" raster API.
 * Needs an ArcGIS Location Platform API key with privilege
 * "Location services > Basemaps > Static basemap tiles" (restrict it by HTTP referrer;
 * NEXT_PUBLIC_ means it is visible in the browser). `language=en` is the documented
 * label-language preference (default "global" = usually English; "local" = native).
 * Docs: https://developers.arcgis.com/rest/basemap-styles/arcgis-topographic-base-style-get/
 *       https://developers.arcgis.com/openlayers/maps/raster-tile-basemaps/change-language-labels/
 * NOTE: URL shape follows those pages; not exercised live (no key available). */
const ESRI_STYLES = "https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis";
const ESRI_STYLES_ATTRIBUTION =
  'Powered by <a href="https://www.esri.com">Esri</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Overture Maps Foundation, and others';

export function getTileSource(theme: MapTheme = "light"): TileSource {
  const esriKey = process.env.NEXT_PUBLIC_ESRI_BASEMAP_KEY;
  if (esriKey && !(theme === "dark" ? process.env.NEXT_PUBLIC_MAP_TILE_URL : process.env.NEXT_PUBLIC_MAP_TILE_URL_LIGHT)) {
    const style = theme === "dark" ? "streets-night" : "outdoor";
    return {
      url: `${ESRI_STYLES}/${style}/static/tile/{z}/{y}/{x}?language=en&token=${encodeURIComponent(esriKey)}`,
      attribution: ESRI_STYLES_ATTRIBUTION,
      maxNativeZoom: 19,
    };
  }
  const url = theme === "dark" ? process.env.NEXT_PUBLIC_MAP_TILE_URL : process.env.NEXT_PUBLIC_MAP_TILE_URL_LIGHT;
  if (url) {
    return {
      url,
      attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxNativeZoom: 19,
    };
  }
  return { url: ESRI_TOPO, attribution: ESRI_ATTRIBUTION, maxNativeZoom: 17, filterDark: true };
}
