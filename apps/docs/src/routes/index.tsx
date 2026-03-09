import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OGMap, type Asset, type ColorScheme } from "@aai-og/components";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// Demo data — synthetic assets: wells, meters, pipeline, facility
const DEMO_ASSETS: Asset[] = [
  // Wells
  { id: "1", name: "MESA VERDE 1H", type: "well", status: "producing", coordinates: { lat: 31.92, lng: -103.45 }, properties: { api: "42-461-40001", operator: "Pioneer Natural Resources", wellType: "oil", trajectory: "horizontal", basin: "Permian", play: "Midland Basin", formation: "Wolfcamp A", state: "TX", county: "Ector", firstProdDate: "2021-03-01", lateralLength: 10200, cumBOE: 650000, cumOil: 420000, cumGas: 1380000, cumWater: 180000 } },
  { id: "2", name: "RED HAWK 2H", type: "well", status: "producing", coordinates: { lat: 31.88, lng: -103.52 }, properties: { api: "42-461-40002", operator: "Diamondback Energy", wellType: "oil", trajectory: "horizontal", basin: "Permian", play: "Midland Basin", formation: "Wolfcamp B", state: "TX", county: "Ector", firstProdDate: "2022-06-01", lateralLength: 9800, cumBOE: 380000, cumOil: 245000, cumGas: 810000, cumWater: 95000 } },
  { id: "3", name: "RATTLESNAKE STATE 3H", type: "well", status: "producing", coordinates: { lat: 32.15, lng: -103.78 }, properties: { api: "42-301-40003", operator: "ConocoPhillips", wellType: "oil", trajectory: "horizontal", basin: "Permian", play: "Delaware Basin", formation: "Bone Spring", state: "NM", county: "Lea", firstProdDate: "2020-11-01", lateralLength: 10500, cumBOE: 890000, cumOil: 510000, cumGas: 2280000, cumWater: 320000 } },
  { id: "4", name: "GOLDEN EAGLE 4V", type: "well", status: "shut-in", coordinates: { lat: 31.95, lng: -103.38 }, properties: { api: "42-461-40004", operator: "EOG Resources", wellType: "oil", trajectory: "vertical", basin: "Permian", play: "Midland Basin", formation: "Spraberry", state: "TX", county: "Ector", firstProdDate: "2015-02-01", lateralLength: 0, cumBOE: 95000, cumOil: 72000, cumGas: 138000, cumWater: 45000 } },
  { id: "5", name: "THUNDERBIRD 5H", type: "well", status: "producing", coordinates: { lat: 32.05, lng: -103.62 }, properties: { api: "42-329-40005", operator: "Devon Energy", wellType: "oil", trajectory: "horizontal", basin: "Permian", play: "Delaware Basin", formation: "Wolfcamp A", state: "TX", county: "Loving", firstProdDate: "2023-01-01", lateralLength: 11200, cumBOE: 220000, cumOil: 155000, cumGas: 390000, cumWater: 60000 } },
  { id: "6", name: "FIREBIRD 6H", type: "well", status: "producing", coordinates: { lat: 32.08, lng: -103.55 }, properties: { api: "42-329-40006", operator: "Occidental", wellType: "gas", trajectory: "horizontal", basin: "Permian", play: "Delaware Basin", formation: "Wolfcamp B", state: "TX", county: "Loving", firstProdDate: "2022-09-01", lateralLength: 10800, cumBOE: 310000, cumOil: 120000, cumGas: 1140000, cumWater: 140000 } },
  { id: "7", name: "SUNRISE STATE 7D", type: "well", status: "drilled", coordinates: { lat: 31.82, lng: -103.42 }, properties: { api: "42-461-40007", operator: "Pioneer Natural Resources", wellType: "oil", trajectory: "directional", basin: "Permian", play: "Midland Basin", formation: "Wolfcamp A", state: "TX", county: "Ector" } },
  { id: "8", name: "APACHE DRAW 8H", type: "well", status: "producing", coordinates: { lat: 32.22, lng: -103.88 }, properties: { api: "30-025-40008", operator: "Coterra Energy", wellType: "oil", trajectory: "horizontal", basin: "Permian", play: "Delaware Basin", formation: "2nd Bone Spring", state: "NM", county: "Eddy", firstProdDate: "2021-07-01", lateralLength: 9500, cumBOE: 540000, cumOil: 380000, cumGas: 960000, cumWater: 210000 } },
  { id: "9", name: "SALT CREEK SWD 9", type: "well", status: "injection", coordinates: { lat: 31.90, lng: -103.48 }, properties: { api: "42-461-40009", operator: "Pioneer Natural Resources", wellType: "disposal", trajectory: "vertical", basin: "Permian", play: "Midland Basin", formation: "Ellenburger", state: "TX", county: "Ector" } },
  { id: "10", name: "WILDCAT 10H", type: "well", status: "permitted", coordinates: { lat: 32.30, lng: -103.70 }, properties: { api: "42-389-40010", operator: "Mewbourne Oil", wellType: "oil", trajectory: "horizontal", basin: "Permian", play: "Delaware Basin", formation: "Wolfcamp A", state: "NM", county: "Lea" } },

  // Meter
  { id: "m1", name: "ECTOR CUSTODY METER", type: "meter", status: "active", coordinates: { lat: 31.94, lng: -103.40 }, properties: { meterType: "custody", fluid: "oil", operator: "Plains Pipeline", readingFrequency: "hourly" } },

  // Facility
  { id: "f1", name: "MIDLAND BASIN CPF", type: "facility", status: "active", coordinates: { lat: 31.98, lng: -103.50 }, properties: { facilityType: "Central Processing Facility", operator: "Pioneer Natural Resources", capacity: "50,000 BOPD" } },

  // Pipeline
  { id: "p1", name: "PERMIAN TRUNK LINE", type: "pipeline", status: "active", coordinates: { lat: 31.92, lng: -103.45 }, lines: [
    [
      { lat: 31.92, lng: -103.45 },
      { lat: 31.94, lng: -103.40 },
      { lat: 31.98, lng: -103.50 },
      { lat: 32.05, lng: -103.62 },
      { lat: 32.15, lng: -103.78 },
    ],
  ], properties: { pipelineType: "gathering", diameter: 12, fluid: "crude oil", operator: "Plains Pipeline" } },
];

const COLOR_SCHEMES: { value: ColorScheme; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "type", label: "Asset Type" },
  { value: "production", label: "Production" },
  { value: "waterCut", label: "Water Cut" },
];

function HomePage() {
  const [colorBy, setColorBy] = useState<ColorScheme>("status");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  return (
    <div className="min-h-screen bg-og-slate-950">
      {/* Hero */}
      <header className="border-b border-og-slate-800 bg-og-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-og-indigo to-og-cyan flex items-center justify-center text-white text-sm font-bold">
              OG
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              @aai-og/components
            </span>
            <span className="text-xs font-mono text-og-slate-400 bg-og-slate-800 px-2 py-0.5 rounded">
              v0.2.0
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-og-slate-400">
            <a href="#components" className="hover:text-white transition-colors">Components</a>
            <a href="#api" className="hover:text-white transition-colors">API</a>
            <a className="text-og-slate-400 hover:text-white transition-colors" href="https://github.com/aai-agency/aai-components" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6">
        {/* Hero section */}
        <section className="py-20 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-white mb-4">
            Oil & Gas UI Components
          </h1>
          <p className="text-xl text-og-slate-400 max-w-2xl mx-auto mb-8">
            Production-grade, AI-ready React components for upstream O&G apps.
            Map any asset — wells, meters, pipelines, facilities.
            XState-driven, Zod-validated, zero backend required.
          </p>
          <div className="flex items-center justify-center gap-4">
            <code className="bg-og-slate-800 border border-og-slate-700 text-og-green font-mono text-sm px-4 py-2 rounded-lg">
              pnpm add @aai-og/components
            </code>
          </div>
        </section>

        {/* OGMap Demo */}
        <section id="components" className="pb-20">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Map</h2>
              <p className="text-sm text-og-slate-400 mt-1">
                Interactive asset map with clustering, pipelines, tooltips, overlays, and color-coding.
                Drag KMZ/KML/GeoJSON files onto the map to add overlays.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {COLOR_SCHEMES.map((scheme) => (
                <button
                  key={scheme.value}
                  onClick={() => setColorBy(scheme.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    colorBy === scheme.value
                      ? "bg-og-indigo text-white"
                      : "bg-og-slate-800 text-og-slate-400 hover:text-white"
                  }`}
                >
                  {scheme.label}
                </button>
              ))}
            </div>
          </div>

          <OGMap
            assets={DEMO_ASSETS}
            mapboxAccessToken={MAPBOX_TOKEN}
            colorBy={colorBy}
            onAssetClick={setSelectedAsset}
            height="600px"
            cluster={true}
            clusterMaxZoom={12}
            enableOverlayUpload={true}
          />

          {/* Selected asset detail */}
          {selectedAsset && (
            <div className="mt-4 bg-og-slate-900 border border-og-slate-800 rounded-xl p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-og-indigo bg-og-indigo/10 px-2 py-0.5 rounded capitalize">
                      {selectedAsset.type}
                    </span>
                    <h3 className="text-lg font-bold text-white">{selectedAsset.name}</h3>
                  </div>
                  <p className="text-sm text-og-slate-400 mt-1">
                    {selectedAsset.status} · {String(selectedAsset.properties.operator ?? selectedAsset.type)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="text-og-slate-400 hover:text-white transition-colors text-sm"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <Stat label="Status" value={selectedAsset.status} />
                <Stat label="Type" value={selectedAsset.type} />
                {Object.entries(selectedAsset.properties).slice(0, 6).map(([key, value]) => (
                  value != null && <Stat key={key} label={key} value={typeof value === "number" ? value.toLocaleString() : String(value)} />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Code Example */}
        <section id="api" className="pb-20">
          <h2 className="text-2xl font-bold text-white mb-4">Quick Start</h2>
          <div className="bg-og-slate-900 border border-og-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-og-slate-800 text-xs text-og-slate-400 font-mono">
              app.tsx
            </div>
            <pre className="p-6 text-sm font-mono text-og-slate-200 overflow-x-auto leading-relaxed">
{`import { OGMap, type Asset } from "@aai-og/components";
import "mapbox-gl/dist/mapbox-gl.css";

const assets: Asset[] = [
  {
    id: "well-1",
    name: "MESA VERDE 1H",
    type: "well",
    status: "producing",
    coordinates: { lat: 31.92, lng: -103.45 },
    properties: { api: "42-461-40001", operator: "Pioneer" },
  },
  {
    id: "pipe-1",
    name: "TRUNK LINE",
    type: "pipeline",
    status: "active",
    coordinates: { lat: 31.92, lng: -103.45 },
    lines: [[
      { lat: 31.92, lng: -103.45 },
      { lat: 32.05, lng: -103.62 },
    ]],
    properties: { diameter: 12, fluid: "crude" },
  },
];

export function App() {
  return (
    <OGMap
      assets={assets}
      mapboxAccessToken={process.env.MAPBOX_TOKEN}
      colorBy="type"
      onAssetClick={(asset) => console.log(asset)}
      enableOverlayUpload
      height="600px"
    />
  );
}`}
            </pre>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-og-slate-800 py-8 text-center text-sm text-og-slate-400">
          Built by <span className="text-white">AAI Agency</span> · Open Source · MIT License
        </footer>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-og-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-white capitalize mt-0.5">{value}</div>
    </div>
  );
}
