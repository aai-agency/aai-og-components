import { AssetDetailCard } from "@aai-agency/og-components/asset-card";
import { sampleProducingAsset, sampleShutInAsset } from "@aai-agency/og-components/sample-data";
import { createFileRoute } from "@tanstack/react-router";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const AssetDetailCardPage = () => {
  return (
    <PageWrapper
      title="AssetDetailCard"
      description="Expandable asset details with an embedded Chart powered by properties.timeSeries."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DemoCard title="Producing Well">
          <div className="relative" style={{ height: 500 }}>
            <AssetDetailCard asset={sampleProducingAsset} />
          </div>
        </DemoCard>

        <DemoCard title="Shut-in Well">
          <div className="relative" style={{ height: 500 }}>
            <AssetDetailCard asset={sampleShutInAsset} />
          </div>
        </DemoCard>
      </div>

      <PropTable
        props={[
          {
            name: "asset",
            type: "Asset",
            description: "The asset to display; properties.timeSeries renders the unified Chart",
          },
          {
            name: "sections",
            type: "AssetDetailSection[]",
            description: "Custom sections (auto-generated if omitted)",
          },
          { name: "onClose", type: "() => void", description: "Close button callback" },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/asset-detail-card")({
  component: AssetDetailCardPage,
});
