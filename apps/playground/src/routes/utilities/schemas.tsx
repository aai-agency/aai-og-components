import { createFileRoute } from "@tanstack/react-router";
import { DemoCard, PageWrapper } from "../../lib/page-wrapper";

const SchemasPage = () => {
  return (
    <PageWrapper title="Schemas" description="Zod schemas for runtime validation at data boundaries.">
      <DemoCard title="Available Schemas">
        <div className="p-4 space-y-4 text-sm">
          <div>
            <h4 className="font-medium">AssetSchema</h4>
            <p className="text-muted-foreground mt-1">
              Validates a single Asset object (id, name, type, status, coordinates, properties).
            </p>
          </div>
          <div>
            <h4 className="font-medium">AssetArraySchema</h4>
            <p className="text-muted-foreground mt-1">Validates an array of Assets.</p>
          </div>
          <div>
            <h4 className="font-medium">CoordinatesSchema</h4>
            <p className="text-muted-foreground mt-1">Validates lat/lng coordinate pairs.</p>
          </div>
          <div>
            <h4 className="font-medium">MapOverlaySchema</h4>
            <p className="text-muted-foreground mt-1">Validates overlay objects with GeoJSON data and style config.</p>
          </div>
          <div>
            <h4 className="font-medium">TimeSeriesSchema / DataPointSchema</h4>
            <p className="text-muted-foreground mt-1">Validates production time series data.</p>
          </div>
        </div>
      </DemoCard>

      <DemoCard title="Usage">
        <pre className="p-4 text-sm font-mono overflow-x-auto">
          {`import { parseAssets, safeParseAssets } from "@aai-agency/og-components/schemas";

// Throws on invalid data
const assets = parseAssets(rawData);

// Returns { success, data?, error? }
const result = safeParseAssets(rawData);`}
        </pre>
      </DemoCard>
    </PageWrapper>
  );
};

export const Route = createFileRoute("/utilities/schemas")({
  component: SchemasPage,
});
