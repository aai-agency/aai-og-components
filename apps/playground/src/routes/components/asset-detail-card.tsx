import { AssetDetailCard } from "@aai-agency/og-components";
import type { Asset } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const SAMPLE_ASSET: Asset = {
  id: "well-001",
  name: "Pioneer 14-2H",
  type: "well",
  status: "producing",
  coordinates: { lat: 31.95, lng: -102.08 },
  properties: {
    operator: "Pioneer Natural Resources",
    wellType: "oil",
    basin: "Permian",
    cumOil: 245000,
    cumGas: 890000,
    cumWater: 120000,
    cumBOE: 395000,
    spudDate: "2021-03-15",
    completionDate: "2021-06-22",
    lateralLength: 10500,
    trueVerticalDepth: 8200,
  },
};

const SHUT_IN_ASSET: Asset = {
  id: "well-002",
  name: "Devon 8-1H",
  type: "well",
  status: "shut-in",
  coordinates: { lat: 35.2, lng: -97.8 },
  properties: {
    operator: "Devon Energy",
    wellType: "gas",
    basin: "SCOOP/STACK",
    cumOil: 45000,
    cumGas: 2100000,
    cumWater: 30000,
    cumBOE: 395000,
  },
};

const AssetDetailCardPage = () => {
  return (
    <PageWrapper
      title="AssetDetailCard"
      description="Expandable detail card that auto-generates sections from asset properties."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DemoCard title="Producing Well">
          <div className="relative" style={{ height: 500 }}>
            <AssetDetailCard asset={SAMPLE_ASSET} />
          </div>
        </DemoCard>

        <DemoCard title="Shut-in Well">
          <div className="relative" style={{ height: 500 }}>
            <AssetDetailCard asset={SHUT_IN_ASSET} />
          </div>
        </DemoCard>
      </div>

      <PropTable
        props={[
          { name: "asset", type: "Asset", description: "The asset to display" },
          { name: "sections", type: "AssetDetailSection[]", description: "Custom sections (auto-generated if omitted)" },
          { name: "onClose", type: "() => void", description: "Close button callback" },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/asset-detail-card")({
  component: AssetDetailCardPage,
});
