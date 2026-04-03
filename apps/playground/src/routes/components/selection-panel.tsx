import { SelectionPanel } from "@aai-agency/og-components";
import type { Asset } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const SAMPLE_ASSETS: Asset[] = [
  { id: "w1", name: "Pioneer 14-2H", type: "well", status: "producing", coordinates: { lat: 31.9, lng: -102.1 }, properties: { operator: "Pioneer", wellType: "oil", cumBOE: 395000 } },
  { id: "w2", name: "Devon 8-1H", type: "well", status: "shut-in", coordinates: { lat: 35.2, lng: -97.8 }, properties: { operator: "Devon", wellType: "gas", cumBOE: 180000 } },
  { id: "w3", name: "EOG 22-4H", type: "well", status: "producing", coordinates: { lat: 28.8, lng: -98.5 }, properties: { operator: "EOG", wellType: "oil", cumBOE: 520000 } },
  { id: "w4", name: "Hess 3-7H", type: "well", status: "abandoned", coordinates: { lat: 47.8, lng: -103.5 }, properties: { operator: "Hess", wellType: "oil", cumBOE: 85000 } },
  { id: "w5", name: "Oxy 11-9H", type: "well", status: "permitted", coordinates: { lat: 40.2, lng: -104.5 }, properties: { operator: "Oxy", wellType: "gas", cumBOE: 0 } },
];

const SelectionPanelPage = () => {
  return (
    <PageWrapper
      title="SelectionPanel"
      description="Multi-select panel with filter chips, summary stats, and scrollable mini-cards."
    >
      <DemoCard title="5 Selected Wells">
        <div className="relative" style={{ height: 500 }}>
          <SelectionPanel
            assets={SAMPLE_ASSETS}
            overlayFeatures={[]}
            onClose={() => {}}
          />
        </div>
      </DemoCard>

      <PropTable
        props={[
          { name: "assets", type: "Asset[]", description: "Selected assets to display" },
          { name: "overlayFeatures", type: "SelectedOverlayFeature[]", description: "Selected overlay features" },
          { name: "onClose", type: "() => void", description: "Close panel callback" },
          { name: "onSelectAsset", type: "(asset: Asset) => void", description: "Asset click callback" },
          { name: "onSelectOverlayFeature", type: "(feature) => void", description: "Overlay feature click callback" },
          { name: "typeConfigs", type: "Map<string, AssetTypeConfig>", description: "Type display configs" },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/selection-panel")({
  component: SelectionPanelPage,
});
