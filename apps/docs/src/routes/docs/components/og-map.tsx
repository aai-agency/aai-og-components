import { type Asset, Map } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import { CodeBlock } from "../../../components/code-block";
import { ComponentPreview } from "../../../components/component-preview";
import { OnThisPage } from "../../../components/on-this-page";
import { PropsTable } from "../../../components/props-table";

export const Route = createFileRoute("/docs/components/og-map")({
  component: MapPage,
});

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

const TOC_ITEMS = [
  { title: "Preview", id: "preview" },
  { title: "Installation", id: "installation" },
  { title: "Usage", id: "usage" },
  { title: "Props", id: "props" },
];

const OG_MAP_PROPS = [
  { name: "assets", type: "Asset[]", description: "Array of asset objects to display on the map." },
  { name: "mapboxAccessToken", type: "string", description: "Your Mapbox GL access token." },
  { name: "mapStyle", type: "string", default: '"mapbox://styles/mapbox/light-v11"', description: "Mapbox style URL." },
  { name: "colorBy", type: "ColorScheme", default: '"status"', description: "Color scheme for asset markers. One of: status, type, production, waterCut, wellType, operator, basin." },
  { name: "onColorByChange", type: "(scheme: ColorScheme) => void", description: "Callback when color scheme changes via legend." },
  { name: "height", type: "string | number", default: '"500px"', description: "Map container height." },
  { name: "cluster", type: "boolean", default: "false", description: "Enable marker clustering at low zoom levels." },
  { name: "enableOverlayUpload", type: "boolean", default: "false", description: "Enable drag-and-drop overlay upload (KMZ, KML, GeoJSON, Shapefile)." },
  { name: "showDetailCard", type: "boolean", default: "true", description: "Show asset detail card on click." },
  { name: "showControls", type: "boolean", default: "true", description: "Show the map controls toolbar." },
  { name: "controls", type: "MapControlId[]", description: "Which controls to show: pan, zoom, fullscreen, center, draw-polygon, draw-rectangle, draw-circle, layers, labels." },
  { name: "layers", type: "MapLayerId[]", description: "Toggleable layers: assets, clusters, overlays, labels." },
  { name: "onAssetClick", type: "(asset: Asset) => void", description: "Callback when an asset is clicked." },
  { name: "onAssetHover", type: "(asset: Asset | null) => void", description: "Callback when an asset is hovered." },
  { name: "onViewStateChange", type: "(viewState: MapViewState) => void", description: "Callback on pan or zoom." },
];

const USAGE_CODE = `import { Map } from "@aai-agency/og-components";
import "mapbox-gl/dist/mapbox-gl.css";

export function AssetMap({ assets }) {
  return (
    <Map
      assets={assets}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
      colorBy="status"
      height="700px"
      enableOverlayUpload
      showDetailCard
      controls={[
        "pan", "zoom", "fullscreen", "center",
        "draw-polygon", "draw-rectangle", "draw-circle",
        "layers", "labels",
      ]}
      layers={["assets", "overlays"]}
    />
  );
}`;

const PREVIEW_CODE = `<Map
  assets={djBasinWells}
  mapboxAccessToken={MAPBOX_TOKEN}
  colorBy="status"
  height="700px"
  enableOverlayUpload
  showDetailCard
  controls={["pan", "zoom", "fullscreen", "center", "draw-polygon", "draw-rectangle", "draw-circle", "layers", "labels"]}
  layers={["assets", "overlays"]}
/>`;

function TocPortal() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById("toc-container"));
  }, []);
  if (!container) return null;
  return createPortal(<OnThisPage items={TOC_ITEMS} />, container);
}

function MapPage() {
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    fetch("/data/dj-sample.json")
      .then((r) => r.json())
      .then((data: Asset[]) => setAssets(data));
  }, []);

  return (
    <>
      <TocPortal />
      <div className="space-y-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Asset Map</h1>
          <p className="mt-2 text-base text-neutral-500">
            Interactive map for Oil and Gas assets. Render wells, facilities, and custom asset types with clustering, color schemes, drawing tools, and overlay uploads.
          </p>
        </div>

        <section id="preview">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Preview</h2>
          <p className="text-sm text-neutral-500 mb-4">
            {assets.length > 0 ? `${assets.length.toLocaleString()} wells from the DJ Basin (Colorado).` : "Loading DJ Basin data..."}
          </p>
          <ComponentPreview code={PREVIEW_CODE}>
            <div className="rounded-b-lg overflow-hidden">
              <Map
                assets={assets}
                mapboxAccessToken={MAPBOX_TOKEN}
                colorBy="status"
                height="700px"
                cluster={false}
                enableOverlayUpload={true}
                showDetailCard={true}
                showControls={true}
                controls={["pan", "zoom", "fullscreen", "center", "draw-polygon", "draw-rectangle", "draw-circle", "layers", "labels"]}
                layers={["assets", "overlays"]}
              />
            </div>
          </ComponentPreview>
        </section>

        <section id="installation">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Installation</h2>
          <CodeBlock
            language="bash"
            code="pnpm add @aai-agency/og-components mapbox-gl"
          />
        </section>

        <section id="usage">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Usage</h2>
          <CodeBlock language="tsx" code={USAGE_CODE} />
        </section>

        <section id="props">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Props</h2>
          <PropsTable props={OG_MAP_PROPS} />
        </section>
      </div>
    </>
  );
}
