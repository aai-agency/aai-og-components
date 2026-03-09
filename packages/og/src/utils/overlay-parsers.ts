import JSZip from "jszip";
import type { MapOverlay } from "../types";

/** Parse a KMZ file (zipped KML) into a MapOverlay */
export async function parseKMZ(file: File): Promise<MapOverlay> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // Find the .kml file inside the zip
  const kmlEntry = Object.values(zip.files).find(
    (f) => f.name.toLowerCase().endsWith(".kml") && !f.dir
  );
  if (!kmlEntry) throw new Error("No KML file found inside KMZ archive");

  const kmlText = await kmlEntry.async("text");
  const geojson = kmlToGeoJSON(kmlText);

  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.kmz$/i, ""),
    type: "kmz",
    visible: true,
    geojson,
    fileName: file.name,
  };
}

/** Parse a KML file into a MapOverlay */
export async function parseKML(file: File): Promise<MapOverlay> {
  const text = await file.text();
  const geojson = kmlToGeoJSON(text);

  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.kml$/i, ""),
    type: "kml",
    visible: true,
    geojson,
    fileName: file.name,
  };
}

/** Parse a GeoJSON file into a MapOverlay */
export async function parseGeoJSONFile(file: File): Promise<MapOverlay> {
  const text = await file.text();
  const geojson = JSON.parse(text) as GeoJSON.FeatureCollection;

  if (geojson.type !== "FeatureCollection") {
    throw new Error("Expected a GeoJSON FeatureCollection");
  }

  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.(geojson|json)$/i, ""),
    type: "geojson",
    visible: true,
    geojson,
    fileName: file.name,
  };
}

// ── KML → GeoJSON converter ─────────────────────────────────────────────────

function kmlToGeoJSON(kmlText: string): GeoJSON.FeatureCollection {
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
}

function placemarkToFeature(pm: Element): GeoJSON.Feature | null {
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
}

/** Parse KML coordinate string: "lng,lat,alt lng,lat,alt ..." → [lng, lat][] */
function parseCoordinateString(str: string): number[][] {
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
}

function getTextContent(parent: Element, tagName: string): string | null {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent ?? null;
}
