import type { Asset, ColorScheme } from "@aai-agency/og-components/types";
import { filterPlottable } from "@aai-agency/og-components/utils";

const STATUSES: Asset["status"][] = ["producing", "shut-in", "abandoned", "permitted", "drilled", "injection"];
const WELL_TYPES = ["oil", "gas", "injection", "disposal"];
const OPERATORS = [
  "Pioneer",
  "Devon",
  "EOG",
  "Diamondback",
  "ConocoPhillips",
  "Marathon",
  "Continental",
  "Hess",
  "Oxy",
  "Apache",
];

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

export const COLOR_SCHEMES: { value: ColorScheme; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "type", label: "Asset Type" },
  { value: "production", label: "Production" },
  { value: "waterCut", label: "Water Cut" },
  { value: "wellType", label: "Well Type" },
];

export const loadSampleData = async (): Promise<Asset[]> => {
  const [bakken, dj] = await Promise.all([
    fetch("/data/bakken-sample.json").then((r) => r.json()) as Promise<Asset[]>,
    fetch("/data/dj-sample.json").then((r) => r.json()) as Promise<Asset[]>,
  ]);
  return filterPlottable([...bakken, ...dj]);
};

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const generateSyntheticAssets = (count: number): Asset[] => {
  const random = createSeededRandom(count || 1);
  const basins = [
    { name: "Permian", center: { lat: 31.9, lng: -102.1 }, spread: 2.0, weight: 0.35 },
    { name: "Bakken", center: { lat: 47.8, lng: -103.5 }, spread: 1.5, weight: 0.15 },
    { name: "Eagle Ford", center: { lat: 28.8, lng: -98.5 }, spread: 1.5, weight: 0.15 },
    { name: "DJ Basin", center: { lat: 40.2, lng: -104.5 }, spread: 1.0, weight: 0.1 },
    { name: "Marcellus", center: { lat: 40.5, lng: -79.5 }, spread: 2.0, weight: 0.1 },
    { name: "SCOOP/STACK", center: { lat: 35.2, lng: -97.8 }, spread: 1.2, weight: 0.1 },
    { name: "Haynesville", center: { lat: 32.5, lng: -93.8 }, spread: 1.0, weight: 0.05 },
  ];

  const assets: Asset[] = [];
  let basinIdx = 0;
  let basinAlloc = 0;

  for (let i = 0; i < count; i++) {
    if (basinAlloc <= 0) {
      basinIdx = 0;
      let r = random();
      for (let b = 0; b < basins.length; b++) {
        r -= basins[b].weight;
        if (r <= 0) {
          basinIdx = b;
          break;
        }
      }
      basinAlloc = Math.floor(basins[basinIdx].weight * 200) + 1;
    }
    basinAlloc--;

    const basin = basins[basinIdx];
    const u1 = Math.max(random(), Number.EPSILON);
    const u2 = random();
    const g1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const g2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

    const lat = basin.center.lat + g1 * basin.spread * 0.4;
    const lng = basin.center.lng + g2 * basin.spread * 0.6;

    const status = STATUSES[Math.floor(random() * STATUSES.length)];
    const wellType = WELL_TYPES[Math.floor(random() * WELL_TYPES.length)];
    const operator = OPERATORS[Math.floor(random() * OPERATORS.length)];
    const cumBOE = Math.floor(random() * 1_000_000);

    assets.push({
      id: `syn-${i}`,
      name: `${basin.name}-${i + 1}`,
      type: "well",
      status,
      coordinates: { lat, lng },
      properties: {
        operator,
        wellType,
        basin: basin.name,
        cumBOE,
        cumOil: Math.floor(cumBOE * 0.6),
        cumGas: Math.floor(cumBOE * 0.3),
        cumWater: Math.floor(cumBOE * 0.4),
      },
    });
  }
  return assets;
};
