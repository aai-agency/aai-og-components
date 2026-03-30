import { type Asset, type ColorScheme, OGMap } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

// Sample data files are now in Asset format directly

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const COLOR_SCHEMES: { value: ColorScheme; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "type", label: "Asset Type" },
  { value: "production", label: "Production" },
  { value: "waterCut", label: "Water Cut" },
  { value: "wellType", label: "Well Type" },
];

const STATUSES = ["producing", "shut-in", "drilled", "permitted", "abandoned", "injection"] as const;
const WELL_TYPES = ["oil", "gas", "injection", "disposal"] as const;
const TRAJECTORIES = ["horizontal", "vertical", "directional"] as const;
const OPERATORS = [
  "Pioneer Natural Resources",
  "Diamondback Energy",
  "ConocoPhillips",
  "EOG Resources",
  "Devon Energy",
  "Occidental",
  "Coterra Energy",
  "Mewbourne Oil",
  "Continental Resources",
  "Hess Corporation",
];
const FORMATIONS = [
  "Wolfcamp A",
  "Wolfcamp B",
  "Bone Spring",
  "Spraberry",
  "Three Forks",
  "Middle Bakken",
  "2nd Bone Spring",
];

function generateWells(count: number, basin: string, centerLat: number, centerLng: number, spread: number): Asset[] {
  const wells: Asset[] = [];
  for (let i = 0; i < count; i++) {
    const lat = centerLat + (Math.random() - 0.5) * spread;
    const lng = centerLng + (Math.random() - 0.5) * spread;
    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    const wellType = WELL_TYPES[Math.floor(Math.random() * WELL_TYPES.length)];
    const operator = OPERATORS[Math.floor(Math.random() * OPERATORS.length)];
    const formation = FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)];
    const cumOil = Math.floor(Math.random() * 800000);
    const cumGas = Math.floor(Math.random() * 3000000);
    const cumWater = Math.floor(Math.random() * 400000);
    wells.push({
      id: `gen-${basin}-${i}`,
      name: `${basin.toUpperCase()} ${i + 1}H`,
      type: "well",
      status,
      coordinates: { lat, lng },
      properties: {
        api: `${Math.floor(Math.random() * 90000) + 10000}-${Math.floor(Math.random() * 90000) + 10000}`,
        operator,
        wellType,
        trajectory: TRAJECTORIES[Math.floor(Math.random() * TRAJECTORIES.length)],
        basin,
        formation,
        state: basin === "Permian" ? "TX" : basin === "Bakken" ? "ND" : "CO",
        cumOil,
        cumGas,
        cumWater,
        cumBOE: cumOil + Math.floor(cumGas / 6),
        lateralLength: Math.floor(Math.random() * 5000) + 7000,
      },
    });
  }
  return wells;
}

const POINT_OPTIONS = [
  { label: "Demo (12)", value: "demo" },
  { label: "Bakken (500)", value: "bakken" },
  { label: "DJ Basin (500)", value: "dj" },
  { label: "Both (1,000)", value: "both" },
  { label: "5,000", value: "5k" },
  { label: "10,000", value: "10k" },
  { label: "20,000", value: "20k" },
  { label: "40,000", value: "40k" },
];

const DEMO_ASSETS: Asset[] = [
  {
    id: "1",
    name: "MESA VERDE 1H",
    type: "well",
    status: "producing",
    coordinates: { lat: 31.92, lng: -103.45 },
    properties: {
      api: "42-461-40001",
      operator: "Pioneer Natural Resources",
      wellType: "oil",
      trajectory: "horizontal",
      basin: "Permian",
      formation: "Wolfcamp A",
      state: "TX",
      cumBOE: 650000,
      cumOil: 420000,
      cumGas: 1380000,
      cumWater: 180000,
    },
  },
  {
    id: "2",
    name: "RED HAWK 2H",
    type: "well",
    status: "producing",
    coordinates: { lat: 31.88, lng: -103.52 },
    properties: {
      api: "42-461-40002",
      operator: "Diamondback Energy",
      wellType: "oil",
      trajectory: "horizontal",
      basin: "Permian",
      formation: "Wolfcamp B",
      state: "TX",
      cumBOE: 380000,
      cumOil: 245000,
      cumGas: 810000,
      cumWater: 95000,
    },
  },
  {
    id: "3",
    name: "RATTLESNAKE STATE 3H",
    type: "well",
    status: "producing",
    coordinates: { lat: 32.15, lng: -103.78 },
    properties: {
      api: "42-301-40003",
      operator: "ConocoPhillips",
      wellType: "oil",
      trajectory: "horizontal",
      basin: "Permian",
      formation: "Bone Spring",
      state: "NM",
      cumBOE: 890000,
      cumOil: 510000,
      cumGas: 2280000,
      cumWater: 320000,
    },
  },
  {
    id: "4",
    name: "GOLDEN EAGLE 4V",
    type: "well",
    status: "shut-in",
    coordinates: { lat: 31.95, lng: -103.38 },
    properties: {
      api: "42-461-40004",
      operator: "EOG Resources",
      wellType: "oil",
      trajectory: "vertical",
      basin: "Permian",
      formation: "Spraberry",
      state: "TX",
      cumBOE: 95000,
      cumOil: 72000,
      cumGas: 138000,
      cumWater: 45000,
    },
  },
  {
    id: "5",
    name: "THUNDERBIRD 5H",
    type: "well",
    status: "producing",
    coordinates: { lat: 32.05, lng: -103.62 },
    properties: {
      api: "42-329-40005",
      operator: "Devon Energy",
      wellType: "oil",
      trajectory: "horizontal",
      basin: "Permian",
      formation: "Wolfcamp A",
      state: "TX",
      cumBOE: 220000,
      cumOil: 155000,
      cumGas: 390000,
      cumWater: 60000,
    },
  },
  {
    id: "6",
    name: "FIREBIRD 6H",
    type: "well",
    status: "producing",
    coordinates: { lat: 32.08, lng: -103.55 },
    properties: {
      api: "42-329-40006",
      operator: "Occidental",
      wellType: "gas",
      trajectory: "horizontal",
      basin: "Permian",
      formation: "Wolfcamp B",
      state: "TX",
      cumBOE: 310000,
      cumOil: 120000,
      cumGas: 1140000,
      cumWater: 140000,
    },
  },
  {
    id: "7",
    name: "SUNRISE STATE 7D",
    type: "well",
    status: "drilled",
    coordinates: { lat: 31.82, lng: -103.42 },
    properties: {
      api: "42-461-40007",
      operator: "Pioneer Natural Resources",
      wellType: "oil",
      trajectory: "directional",
      basin: "Permian",
      formation: "Wolfcamp A",
      state: "TX",
    },
  },
  {
    id: "8",
    name: "APACHE DRAW 8H",
    type: "well",
    status: "producing",
    coordinates: { lat: 32.22, lng: -103.88 },
    properties: {
      api: "30-025-40008",
      operator: "Coterra Energy",
      wellType: "oil",
      trajectory: "horizontal",
      basin: "Permian",
      formation: "2nd Bone Spring",
      state: "NM",
      cumBOE: 540000,
      cumOil: 380000,
      cumGas: 960000,
      cumWater: 210000,
    },
  },
  {
    id: "9",
    name: "SALT CREEK SWD 9",
    type: "well",
    status: "injection",
    coordinates: { lat: 31.9, lng: -103.48 },
    properties: {
      api: "42-461-40009",
      operator: "Pioneer Natural Resources",
      wellType: "disposal",
      trajectory: "vertical",
      basin: "Permian",
      formation: "Ellenburger",
      state: "TX",
    },
  },
  {
    id: "10",
    name: "WILDCAT 10H",
    type: "well",
    status: "permitted",
    coordinates: { lat: 32.3, lng: -103.7 },
    properties: {
      api: "42-389-40010",
      operator: "Mewbourne Oil",
      wellType: "oil",
      trajectory: "horizontal",
      basin: "Permian",
      formation: "Wolfcamp A",
      state: "NM",
    },
  },
  {
    id: "m1",
    name: "ECTOR CUSTODY METER",
    type: "meter",
    status: "active",
    coordinates: { lat: 31.94, lng: -103.4 },
    properties: { meterType: "custody", fluid: "oil", operator: "Plains Pipeline" },
  },
  {
    id: "f1",
    name: "MIDLAND BASIN CPF",
    type: "facility",
    status: "active",
    coordinates: { lat: 31.98, lng: -103.5 },
    properties: {
      facilityType: "Central Processing Facility",
      operator: "Pioneer Natural Resources",
      capacity: "50,000 BOPD",
    },
  },
];

function HomePage() {
  const [colorBy, setColorBy] = useState<ColorScheme>("status");
  const [assets, setAssets] = useState<Asset[]>(DEMO_ASSETS);
  const [activeDataset, setActiveDataset] = useState("demo");
  const [loading, setLoading] = useState(false);

  const loadDataset = useCallback(async (option: string) => {
    setLoading(true);
    setActiveDataset(option);
    try {
      switch (option) {
        case "demo":
          setAssets(DEMO_ASSETS);
          break;
        case "bakken": {
          const res = await fetch("/data/bakken-sample.json");
          setAssets(await res.json() as Asset[]);
          break;
        }
        case "dj": {
          const res = await fetch("/data/dj-sample.json");
          setAssets(await res.json() as Asset[]);
          break;
        }
        case "both": {
          const [b, d] = await Promise.all([
            fetch("/data/bakken-sample.json").then((r) => r.json()) as Promise<Asset[]>,
            fetch("/data/dj-sample.json").then((r) => r.json()) as Promise<Asset[]>,
          ]);
          setAssets([...b, ...d]);
          break;
        }
        case "5k":
          setAssets([
            ...generateWells(2000, "Permian", 31.95, -103.5, 1.5),
            ...generateWells(1500, "Bakken", 48.1, -103.5, 2.0),
            ...generateWells(1500, "DJ Basin", 40.2, -104.8, 1.5),
          ]);
          break;
        case "10k":
          setAssets([
            ...generateWells(4000, "Permian", 31.95, -103.5, 2.0),
            ...generateWells(3000, "Bakken", 48.1, -103.5, 2.5),
            ...generateWells(3000, "DJ Basin", 40.2, -104.8, 2.0),
          ]);
          break;
        case "20k":
          setAssets([
            ...generateWells(8000, "Permian", 31.95, -103.5, 2.5),
            ...generateWells(6000, "Bakken", 48.1, -103.5, 3.0),
            ...generateWells(6000, "DJ Basin", 40.2, -104.8, 2.5),
          ]);
          break;
        case "40k":
          setAssets([
            ...generateWells(16000, "Permian", 31.95, -103.5, 3.0),
            ...generateWells(12000, "Bakken", 48.1, -103.5, 3.5),
            ...generateWells(12000, "DJ Basin", 40.2, -104.8, 3.0),
          ]);
          break;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #e2e8f0",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1, #06b6d4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            OG
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>@aai-agency/og-components</span>
          <span
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "#64748b",
              background: "#f1f5f9",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            v0.2.0
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#64748b" }}>
          <span style={{ fontWeight: 600, color: "#0f172a" }}>{assets.length.toLocaleString()} assets</span>
          {loading && <span style={{ color: "#6366f1" }}>Loading...</span>}
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
        {/* Controls */}
        <div style={{ padding: "20px 0 12px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>DATA:</span>
          {POINT_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => loadDataset(opt.value)}
              disabled={loading}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid",
                cursor: loading ? "wait" : "pointer",
                borderColor: activeDataset === opt.value ? "#6366f1" : "#e2e8f0",
                background: activeDataset === opt.value ? "#6366f1" : "#fff",
                color: activeDataset === opt.value ? "#fff" : "#374151",
              }}
            >
              {opt.label}
            </button>
          ))}

          <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 8px" }} />

          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>COLOR:</span>
          {COLOR_SCHEMES.map((scheme) => (
            <button
              type="button"
              key={scheme.value}
              onClick={() => setColorBy(scheme.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid",
                cursor: "pointer",
                borderColor: colorBy === scheme.value ? "#6366f1" : "#e2e8f0",
                background: colorBy === scheme.value ? "#6366f1" : "#fff",
                color: colorBy === scheme.value ? "#fff" : "#374151",
              }}
            >
              {scheme.label}
            </button>
          ))}
        </div>

        {/* Map */}
        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <OGMap
            assets={assets}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle="mapbox://styles/mapbox/light-v11"
            colorBy={colorBy}
            height="700px"
            cluster={false}
            enableOverlayUpload={true}
            showDetailCard={true}
            showControls={true}
          />
        </div>

        {/* Footer */}
        <footer
          style={{
            borderTop: "1px solid #e2e8f0",
            padding: "24px 0",
            textAlign: "center",
            fontSize: 13,
            color: "#94a3b8",
            marginTop: 32,
          }}
        >
          Built by <span style={{ color: "#0f172a", fontWeight: 500 }}>AAI Agency</span> - Open Source - MIT License
        </footer>
      </main>
    </div>
  );
}
