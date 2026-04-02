import { type Asset, AssetDetailCard } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "uplot/dist/uPlot.min.css";
import { CodeBlock } from "../../../components/code-block";
import { ComponentPreview } from "../../../components/component-preview";
import { OnThisPage } from "../../../components/on-this-page";
import { PropsTable } from "../../../components/props-table";

export const Route = createFileRoute("/docs/components/asset-detail-card")({
  component: AssetDetailCardPage,
});

const TOC_ITEMS = [
  { title: "Preview", id: "preview" },
  { title: "Installation", id: "installation" },
  { title: "Usage", id: "usage" },
  { title: "Props", id: "props" },
];

const PROPS = [
  { name: "asset", type: "Asset | null", description: "The asset to display. Pass null to hide the card." },
  { name: "onClose", type: "() => void", description: "Callback when the close button is clicked." },
  { name: "sections", type: "AssetDetailSection[]", description: "Custom sections to display. Auto-generated from asset data if omitted." },
  { name: "typeConfigs", type: "Map<string, AssetTypeConfig>", description: "Per-type display configuration for labels and colors." },
  { name: "renderHeader", type: "(asset: Asset) => ReactNode", description: "Custom header renderer." },
  { name: "renderBody", type: "(asset: Asset) => ReactNode", description: "Custom body renderer (replaces all default content)." },
  { name: "renderSection", type: "(section, asset) => ReactNode", description: "Custom renderer for individual sections." },
  { name: "onBack", type: "() => void", description: "Shows a back arrow when provided. Used for navigation from selection summary." },
  { name: "mobileBreakpoint", type: "number", default: "768", description: "Width threshold for mobile drawer vs desktop panel." },
];

const USAGE_CODE = `import { AssetDetailCard } from "@aai-agency/og-components";

// The card auto-generates sections from whatever
// properties exist on the asset. No configuration needed.
export function WellDetail({ asset, onClose }) {
  return (
    <AssetDetailCard
      asset={asset}
      onClose={onClose}
    />
  );
}`;

const CUSTOM_SECTIONS_CODE = `// Pass custom sections for explicit control:
<AssetDetailCard
  asset={asset}
  sections={[
    {
      id: "reservoir",
      title: "Reservoir Data",
      fields: [
        { key: "properties.porosity", label: "Porosity", format: "percentage" },
        { key: "properties.netPay", label: "Net Pay", format: "number", unit: "ft" },
      ],
    },
  ]}
  onClose={onClose}
/>`;

const PREVIEW_CODE = `<AssetDetailCard
  asset={djBasinWell}
  onClose={() => {}}
/>`;

function TocPortal() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById("toc-container"));
  }, []);
  if (!container) return null;
  return createPortal(<OnThisPage items={TOC_ITEMS} />, container);
}

function AssetDetailCardPage() {
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    fetch("/data/dj-sample.json")
      .then((r) => r.json())
      .then((data: Asset[]) => {
        // Pick an asset with timeSeries so the production chart renders
        const withSeries = data.find(
          (a) => a.properties?.timeSeries && (a.properties.timeSeries as unknown[]).length > 0,
        );
        if (withSeries) setAsset(withSeries);
      });
  }, []);

  return (
    <>
      <TocPortal />
      <div className="space-y-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Asset Detail Card</h1>
          <p className="mt-2 text-base text-neutral-500">
            Detail panel shown when clicking an asset on the map. Auto-generates sections from the asset's properties. Includes a production chart when time series data is available.
          </p>
        </div>

        <section id="preview">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Preview</h2>
          {asset && (
            <p className="text-sm text-neutral-500 mb-4">
              Showing <span className="font-medium text-neutral-700">{asset.name}</span> from the DJ Basin.
            </p>
          )}
          <ComponentPreview code={PREVIEW_CODE}>
            <div className="relative bg-neutral-50 rounded-b-lg overflow-hidden" style={{ height: 600 }}>
              {asset ? (
                <AssetDetailCard
                  asset={asset}
                  onClose={() => {}}
                  style={{ position: "absolute", top: 12, left: 12, bottom: 12, width: 340 }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-neutral-400">
                  Loading DJ Basin well data...
                </div>
              )}
            </div>
          </ComponentPreview>
        </section>

        <section id="installation">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Installation</h2>
          <CodeBlock
            language="bash"
            code="pnpm add @aai-agency/og-components"
          />
          <p className="text-sm text-neutral-500 mt-3">
            The detail card is built into the <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono">Map</code> component via the <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono">showDetailCard</code> prop. It can also be used standalone.
          </p>
        </section>

        <section id="usage">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Usage</h2>
          <CodeBlock language="tsx" code={USAGE_CODE} />
          <h3 className="text-base font-semibold text-neutral-900 mt-8 mb-4">Custom Sections</h3>
          <CodeBlock language="tsx" code={CUSTOM_SECTIONS_CODE} />
        </section>

        <section id="props">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Props</h2>
          <PropsTable props={PROPS} />
        </section>
      </div>
    </>
  );
}
