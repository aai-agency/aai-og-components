import { AssetDetailCard } from "@aai-agency/og-components/asset-card";
import type { Asset, TimeSeries } from "@aai-agency/og-components/types";
import { createFileRoute } from "@tanstack/react-router";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const productionSeries = (
  id: string,
  associatedType: string,
  unit: TimeSeries["unit"],
  dates: string[],
  values: number[],
  options: Pick<TimeSeries, "seriesType" | "label" | "color" | "axis"> = {},
): TimeSeries => ({
  id,
  associatedType,
  unit,
  frequency: "monthly",
  data: dates.map((date, index) => ({ date, value: values[index] ?? 0 })),
  ...options,
});

const actualMonths = [
  "2025-01-01",
  "2025-02-01",
  "2025-03-01",
  "2025-04-01",
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
];

const forecastMonths = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"];

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
    timeSeries: [
      productionSeries(
        "pioneer-oil-actual",
        "oil",
        "BBL",
        actualMonths,
        [1280, 1215, 1160, 1098, 1042, 986, 941, 902, 864, 832, 804, 778],
        { label: "Oil", color: "#18181b" },
      ),
      productionSeries("pioneer-oil-forecast", "oil", "BBL", forecastMonths, [752, 728, 706, 684, 663, 643], {
        seriesType: "forecast",
        label: "Oil",
        color: "#18181b",
      }),
      productionSeries(
        "pioneer-gas-actual",
        "gas",
        "MSCF",
        actualMonths,
        [3420, 3310, 3195, 3060, 2940, 2825, 2730, 2645, 2570, 2495, 2425, 2360],
        { label: "Gas", color: "#71717a", axis: "right" },
      ),
    ],
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
    timeSeries: [
      productionSeries(
        "devon-gas-actual",
        "gas",
        "MSCF",
        actualMonths,
        [5260, 5080, 4820, 4510, 4180, 3760, 3220, 2680, 1940, 960, 280, 0],
        { label: "Gas", color: "#18181b", axis: "right" },
      ),
      productionSeries(
        "devon-water-actual",
        "water",
        "BBL",
        actualMonths,
        [310, 298, 286, 272, 255, 238, 214, 188, 154, 112, 58, 0],
        { label: "Water", color: "#a1a1aa" },
      ),
    ],
  },
};

const AssetDetailCardPage = () => {
  return (
    <PageWrapper
      title="AssetDetailCard"
      description="Expandable asset details with an embedded LineChart powered by properties.timeSeries."
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
          {
            name: "asset",
            type: "Asset",
            description: "The asset to display; properties.timeSeries renders the unified LineChart",
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
