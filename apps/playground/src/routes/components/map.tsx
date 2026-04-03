import { type Asset, type ColorScheme, Map as OGMap } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";
import { COLOR_SCHEMES, MAPBOX_TOKEN, generateSyntheticAssets, loadSampleData } from "../../lib/sample-data";

const POINT_COUNTS = [
  { value: 0, label: "Real Data" },
  { value: 10_000, label: "10K" },
  { value: 50_000, label: "50K" },
  { value: 100_000, label: "100K" },
];

const MapPage = () => {
  const [colorBy, setColorBy] = useState<ColorScheme>("status");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [syntheticCount, setSyntheticCount] = useState(0);

  useEffect(() => {
    loadSampleData().then((data) => {
      setAssets(data);
      setLoading(false);
    });
  }, []);

  const displayAssets = useMemo(() => {
    if (syntheticCount === 0) return assets;
    return generateSyntheticAssets(syntheticCount);
  }, [syntheticCount, assets]);

  const handleCountChange = useCallback((count: number) => {
    setSyntheticCount(count);
  }, []);

  return (
    <PageWrapper
      title="Map"
      description="Interactive asset map with clustering, deck.gl rendering, overlays, drawing tools, and lasso selection."
    >
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase">Points:</span>
          {POINT_COUNTS.map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => handleCountChange(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                syntheticCount === p.value
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase">Color:</span>
          {COLOR_SCHEMES.map((s) => (
            <button
              type="button"
              key={s.value}
              onClick={() => setColorBy(s.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                colorBy === s.value
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <DemoCard title={loading ? "Loading..." : `${displayAssets.length.toLocaleString()} wells`} fullWidth>
        <OGMap
          assets={displayAssets}
          mapboxAccessToken={MAPBOX_TOKEN}
          colorBy={colorBy}
          height="calc(100vh - 300px)"
          cluster={false}
          enableOverlayUpload={true}
          controls={[
            "pan",
            "zoom",
            "fullscreen",
            "center",
            "draw-polygon",
            "draw-rectangle",
            "draw-circle",
            "layers",
            "labels",
          ]}
          layers={["assets", "overlays"]}
          showDetailCard={true}
        />
      </DemoCard>

      <PropTable
        props={[
          { name: "assets", type: "Asset[]", description: "Array of assets to plot on the map" },
          { name: "mapboxAccessToken", type: "string", description: "Mapbox GL access token" },
          { name: "colorBy", type: "ColorScheme", default: '"status"', description: "Color scheme for markers" },
          { name: "height", type: "string", default: '"500px"', description: "Map container height" },
          { name: "cluster", type: "boolean", default: "false", description: "Enable supercluster point clustering" },
          { name: "controls", type: "MapControlId[]", description: "Which controls to show" },
          { name: "layers", type: "MapLayerId[]", description: "Which layers to enable" },
          { name: "showDetailCard", type: "boolean", default: "false", description: "Show asset detail card on click" },
          {
            name: "enableOverlayUpload",
            type: "boolean",
            default: "false",
            description: "Allow KMZ/KML/GeoJSON/Shapefile uploads",
          },
          {
            name: "onSelectionChange",
            type: "(ids: string[]) => void",
            description: "Callback when selection changes",
          },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/map")({
  component: MapPage,
});
