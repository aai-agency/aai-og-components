import { type Asset, ProductionChart } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "uplot/dist/uPlot.min.css";
import { CodeBlock } from "../../../components/code-block";
import { ComponentPreview } from "../../../components/component-preview";
import { OnThisPage } from "../../../components/on-this-page";
import { PropsTable } from "../../../components/props-table";

export const Route = createFileRoute("/docs/components/production-chart")({
  component: ProductionChartPage,
});

const TOC_ITEMS = [
  { title: "Preview", id: "preview" },
  { title: "Installation", id: "installation" },
  { title: "Usage", id: "usage" },
  { title: "Props", id: "props" },
];

const PROPS = [
  { name: "series", type: "TimeSeries[]", description: "Array of time series data. Each series has id, fluidType (oil/gas/water), curveType (actual/forecast), unit, frequency, and data points." },
  { name: "height", type: "number", default: "220", description: "Chart height in pixels." },
  { name: "width", type: "number", description: "Chart width in pixels. Fills container width if omitted." },
  { name: "showForecast", type: "boolean", default: "true", description: "Show forecast series with dashed lines." },
  { name: "colors", type: "Record<string, string>", description: "Custom color map by fluidType. Defaults: oil=#22c55e, gas=#ef4444, water=#3b82f6." },
  { name: "labels", type: "Record<string, string>", description: "Custom label map by fluidType." },
  { name: "rightAxisFluids", type: "string[]", default: '["gas"]', description: "Which fluid types use the right Y-axis." },
];

const USAGE_CODE = `import { ProductionChart } from "@aai-agency/og-components";
import "uplot/dist/uPlot.min.css";

// Pass the timeSeries array from any asset
export function WellProduction({ asset }) {
  return (
    <ProductionChart
      series={asset.properties.timeSeries}
      height={350}
    />
  );
}`;

const PREVIEW_CODE = `<ProductionChart
  series={asset.properties.timeSeries}
  height={350}
/>`;

function TocPortal() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById("toc-container"));
  }, []);
  if (!container) return null;
  return createPortal(<OnThisPage items={TOC_ITEMS} />, container);
}

function ProductionChartPage() {
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    fetch("/data/dj-sample.json")
      .then((r) => r.json())
      .then((data: Asset[]) => {
        // Find an asset with timeSeries data
        const withSeries = data.find(
          (a) => a.properties?.timeSeries && (a.properties.timeSeries as unknown[]).length > 0,
        );
        if (withSeries) setAsset(withSeries);
      });
  }, []);

  const series = (asset?.properties?.timeSeries ?? []) as import("@aai-agency/og-components").TimeSeries[];

  return (
    <>
      <TocPortal />
      <div className="space-y-10">
        <div>
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 mb-3">
            Early Preview — More Features Coming Soon
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Production Chart</h1>
          <p className="mt-2 text-base text-neutral-500">
            Time series chart for oil, gas, and water production data. Dual Y-axis, clickable legend, hover tooltips, and zoom brush. Powered by uPlot for 60fps rendering.
          </p>
        </div>

        <section id="preview">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Preview</h2>
          {asset && (
            <p className="text-sm text-neutral-500 mb-4">
              Showing production data for <span className="font-medium text-neutral-700">{asset.name}</span> ({series.length} series).
            </p>
          )}
          <ComponentPreview code={PREVIEW_CODE}>
            <div className="p-6 bg-white rounded-b-lg">
              {series.length > 0 ? (
                <ProductionChart series={series} height={350} />
              ) : (
                <div className="flex items-center justify-center h-[350px] text-sm text-neutral-400">
                  Loading DJ Basin production data...
                </div>
              )}
            </div>
          </ComponentPreview>
        </section>

        <section id="installation">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Installation</h2>
          <CodeBlock
            language="bash"
            code="pnpm add @aai-agency/og-components uplot"
          />
          <p className="text-sm text-neutral-500 mt-3">
            Import the uPlot CSS: <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono">import "uplot/dist/uPlot.min.css"</code>
          </p>
        </section>

        <section id="usage">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Usage</h2>
          <CodeBlock language="tsx" code={USAGE_CODE} />
        </section>

        <section id="props">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Props</h2>
          <PropsTable props={PROPS} />
        </section>
      </div>
    </>
  );
}
