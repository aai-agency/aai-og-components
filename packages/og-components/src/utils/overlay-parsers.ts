import JSZip from "jszip";
import type { MapOverlay, OverlayType } from "../types";

/** Shared factory — eliminates duplicate MapOverlay construction across parsers */
const buildOverlay = (file: File, type: OverlayType, geojson: GeoJSON.FeatureCollection, extRegex: RegExp): MapOverlay => {
  return {
    id: crypto.randomUUID(),
    name: file.name.replace(extRegex, ""),
    type,
    visible: true,
    geojson,
    fileName: file.name,
    version: 1,
    uploadedAt: new Date().toISOString(),
  };
};

/** Parse a KMZ file (zipped KML) into a MapOverlay */
export const parseKMZ = async (file: File): Promise<MapOverlay> => {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const kmlEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml") && !f.dir);
  if (!kmlEntry) throw new Error("No KML file found inside KMZ archive");

  const kmlText = await kmlEntry.async("text");
  return buildOverlay(file, "kmz", kmlToGeoJSON(kmlText), /\.kmz$/i);
};

/** Parse a KML file into a MapOverlay */
export const parseKML = async (file: File): Promise<MapOverlay> => {
  const text = await file.text();
  return buildOverlay(file, "kml", kmlToGeoJSON(text), /\.kml$/i);
};

/** Parse a GeoJSON file into a MapOverlay */
export const parseGeoJSONFile = async (file: File): Promise<MapOverlay> => {
  const text = await file.text();
  const geojson = JSON.parse(text) as GeoJSON.FeatureCollection;
  if (geojson.type !== "FeatureCollection") {
    throw new Error("Expected a GeoJSON FeatureCollection");
  }
  return buildOverlay(file, "geojson", geojson, /\.(geojson|json)$/i);
};

/** Parse a Shapefile (.zip containing .shp, .dbf, .shx, .prj) into a MapOverlay */
export const parseShapefile = async (file: File): Promise<MapOverlay> => {
  const { default: shp } = await import("shpjs");
  const buffer = await file.arrayBuffer();
  const result = await shp(buffer);

  const geojson: GeoJSON.FeatureCollection = Array.isArray(result)
    ? { type: "FeatureCollection", features: result.flatMap((fc) => fc.features) }
    : result;

  return buildOverlay(file, "shapefile", geojson, /\.zip$/i);
};

/** Shapefile component extensions that shpjs needs bundled together */
const SHP_EXTENSIONS = [".shp", ".dbf", ".prj", ".shx", ".cpg", ".sbn", ".sbx"];

/** Check if a set of files looks like loose shapefile components */
export const isShapefileBundle = (files: File[]): boolean => {
  return files.some((f) => f.name.toLowerCase().endsWith(".shp"));
};

/** Parse loose shapefile components (.shp, .dbf, .prj, .shx, etc.) by bundling them into a zip first */
export const parseShapefileBundle = async (files: File[]): Promise<MapOverlay> => {
  const shpFile = files.find((f) => f.name.toLowerCase().endsWith(".shp"));
  if (!shpFile) throw new Error("No .shp file found in the selected files");

  // Filter to only shapefile-related extensions
  const shpFiles = files.filter((f) => SHP_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)));

  // Bundle into a zip using JSZip (already a dependency)
  const zip = new JSZip();
  for (const f of shpFiles) {
    zip.file(f.name, await f.arrayBuffer());
  }
  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  // Parse with shpjs
  const { default: shp } = await import("shpjs");
  const result = await shp(zipBuffer);

  const geojson: GeoJSON.FeatureCollection = Array.isArray(result)
    ? { type: "FeatureCollection", features: result.flatMap((fc) => fc.features) }
    : result;

  // Use the .shp filename as the overlay name
  return {
    id: crypto.randomUUID(),
    name: shpFile.name.replace(/\.shp$/i, ""),
    type: "shapefile",
    visible: true,
    geojson,
    fileName: shpFile.name,
    version: 1,
    uploadedAt: new Date().toISOString(),
  };
};

// ── KML → GeoJSON converter ─────────────────────────────────────────────────

const kmlToGeoJSON = (kmlText: string): GeoJSON.FeatureCollection => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "application/xml");
  const features: GeoJSON.Feature[] = [];

  // Parse Placemarks
  const placemarks = doc.getElementsByTagName("Placemark");
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const feature = placemarkToFeature(pm);
    if (feature) features.push(feature);
  }

  return { type: "FeatureCollection", features };
};

const placemarkToFeature = (pm: Element): GeoJSON.Feature | null => {
  const name = getTextContent(pm, "name");
  const description = getTextContent(pm, "description");

  const properties: Record<string, unknown> = {};
  if (name) properties.name = name;
  if (description) properties.description = description;

  // Parse ExtendedData
  const extData = pm.getElementsByTagName("ExtendedData")[0];
  if (extData) {
    const simpleData = extData.getElementsByTagName("SimpleData");
    for (let i = 0; i < simpleData.length; i++) {
      const key = simpleData[i].getAttribute("name");
      const val = simpleData[i].textContent;
      if (key) properties[key] = val;
    }
    const data = extData.getElementsByTagName("Data");
    for (let i = 0; i < data.length; i++) {
      const key = data[i].getAttribute("name");
      const valEl = data[i].getElementsByTagName("value")[0];
      if (key && valEl) properties[key] = valEl.textContent;
    }
  }

  // Parse style
  const styleUrl = getTextContent(pm, "styleUrl");
  if (styleUrl) properties.styleUrl = styleUrl;

  // Try Point
  const point = pm.getElementsByTagName("Point")[0];
  if (point) {
    const coords = parseCoordinateString(getTextContent(point, "coordinates") ?? "");
    if (coords.length > 0) {
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: coords[0] },
        properties,
      };
    }
  }

  // Try LineString
  const lineString = pm.getElementsByTagName("LineString")[0];
  if (lineString) {
    const coords = parseCoordinateString(getTextContent(lineString, "coordinates") ?? "");
    if (coords.length >= 2) {
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties,
      };
    }
  }

  // Try Polygon
  const polygon = pm.getElementsByTagName("Polygon")[0];
  if (polygon) {
    const rings: number[][][] = [];
    const boundaries = [
      ...Array.from(polygon.getElementsByTagName("outerBoundaryIs")),
      ...Array.from(polygon.getElementsByTagName("innerBoundaryIs")),
    ];
    for (const boundary of boundaries) {
      const coordStr = getTextContent(boundary, "coordinates") ?? "";
      const coords = parseCoordinateString(coordStr);
      if (coords.length >= 3) rings.push(coords);
    }
    if (rings.length > 0) {
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: rings },
        properties,
      };
    }
  }

  // Try MultiGeometry
  const multiGeo = pm.getElementsByTagName("MultiGeometry")[0];
  if (multiGeo) {
    const geometries: GeoJSON.Geometry[] = [];
    const childPlacemarks = multiGeo.children;
    for (let i = 0; i < childPlacemarks.length; i++) {
      const child = childPlacemarks[i];
      if (child.tagName === "Point") {
        const coords = parseCoordinateString(getTextContent(child, "coordinates") ?? "");
        if (coords.length > 0) geometries.push({ type: "Point", coordinates: coords[0] });
      } else if (child.tagName === "LineString") {
        const coords = parseCoordinateString(getTextContent(child, "coordinates") ?? "");
        if (coords.length >= 2) geometries.push({ type: "LineString", coordinates: coords });
      }
    }
    if (geometries.length === 1) {
      return { type: "Feature", geometry: geometries[0], properties };
    }
    if (geometries.length > 1) {
      return {
        type: "Feature",
        geometry: { type: "GeometryCollection", geometries },
        properties,
      };
    }
  }

  return null;
};

/** Parse KML coordinate string: "lng,lat,alt lng,lat,alt ..." → [lng, lat][] */
const parseCoordinateString = (str: string): number[][] => {
  return str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const parts = tuple.split(",").map(Number);
      // KML is lng,lat,alt — return [lng, lat]
      return [parts[0], parts[1]];
    })
    .filter(([lng, lat]) => !Number.isNaN(lng) && !Number.isNaN(lat));
};

const getTextContent = (parent: Element, tagName: string): string | null => {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent ?? null;
};
