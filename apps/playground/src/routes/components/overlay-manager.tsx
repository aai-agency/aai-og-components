import { createFileRoute } from "@tanstack/react-router";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const OverlayManagerPage = () => {
  return (
    <PageWrapper
      title="OverlayManager"
      description="Upload and manage KMZ, KML, GeoJSON, and Shapefile overlays on the map."
    >
      <DemoCard title="Usage">
        <div className="p-6 text-sm text-muted-foreground space-y-3">
          <p>
            The OverlayManager is used as part of the Map component when <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">enableOverlayUpload</code> is enabled.
            It provides drag-and-drop file upload, per-overlay style editing, and feature inspection.
          </p>
          <p>
            See the <a href="/components/map" className="text-foreground underline underline-offset-4">Map</a> demo for a live example with overlays enabled.
          </p>
        </div>
      </DemoCard>

      <DemoCard title="Supported Formats">
        <div className="p-4">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <strong>.kmz</strong> <span className="text-muted-foreground">— Google Earth compressed format</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <strong>.kml</strong> <span className="text-muted-foreground">— Google Earth markup</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <strong>.geojson / .json</strong> <span className="text-muted-foreground">— Standard GeoJSON</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <strong>.shp + .dbf + .shx</strong> <span className="text-muted-foreground">— ESRI Shapefile bundle</span>
            </li>
          </ul>
        </div>
      </DemoCard>

      <PropTable
        props={[
          { name: "overlays", type: "MapOverlay[]", description: "Array of loaded overlays" },
          { name: "onUpload", type: "(files: File[]) => void", description: "File upload handler" },
          { name: "onRemove", type: "(id: string) => void", description: "Remove overlay callback" },
          { name: "onStyleChange", type: "(id: string, style: OverlayStyle) => void", description: "Style change callback" },
          { name: "onToggleVisibility", type: "(id: string) => void", description: "Toggle overlay visibility" },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/overlay-manager")({
  component: OverlayManagerPage,
});
