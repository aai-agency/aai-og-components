import { createFileRoute } from "@tanstack/react-router";
import { DemoCard, PageWrapper } from "../../lib/page-wrapper";

const HELPERS = [
  { name: "filterPlottable(items)", description: "Filters items with valid lat/lng coordinates." },
  { name: "computeBounds(items)", description: "Computes the bounding box for an array of coordinated items." },
  { name: "fitBounds(items)", description: "Returns a MapViewState that fits all items in view." },
  {
    name: "getAssetColor(asset, scheme, typeConfigs?)",
    description: "Returns the hex color for an asset given a color scheme.",
  },
  { name: "formatNumber(value, decimals?)", description: "Formats a number with locale-aware separators." },
  { name: "groupBy(items, keyFn)", description: "Groups an array into a Map by a key function." },
  { name: "csvRowToAsset(row)", description: "Converts a CSV row object into an Asset." },
  { name: "isValidCoordinates(coords)", description: "Checks if coordinates are valid (non-null, within bounds)." },
];

const HelpersPage = () => {
  return (
    <PageWrapper title="Helpers" description="Utility functions for working with assets, coordinates, and data.">
      <DemoCard title="Available Helpers">
        <div className="divide-y divide-border">
          {HELPERS.map((h) => (
            <div key={h.name} className="px-4 py-3">
              <code className="text-sm font-mono font-medium">{h.name}</code>
              <p className="text-sm text-muted-foreground mt-0.5">{h.description}</p>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard title="Import">
        <pre className="p-4 text-sm font-mono overflow-x-auto">
          {`import { filterPlottable, fitBounds, getAssetColor } from "@aai-agency/og-components";
// or from the utils subpath:
import { formatNumber, groupBy } from "@aai-agency/og-components/utils";`}
        </pre>
      </DemoCard>
    </PageWrapper>
  );
};

export const Route = createFileRoute("/utilities/helpers")({
  component: HelpersPage,
});
