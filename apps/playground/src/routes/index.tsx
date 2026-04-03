import { createFileRoute } from "@tanstack/react-router";

const GettingStarted = () => {
  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Getting Started</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Production-grade O&amp;G React components for AI coding agents. Maps, charts, detail cards, and more.
      </p>

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="text-xl font-semibold">Installation</h2>
          <pre className="mt-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm font-mono overflow-x-auto">
            <code>pnpm add @aai-agency/og-components</code>
          </pre>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Setup</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This library expects Tailwind CSS v4+ in your project. Import the theme tokens in your CSS:
          </p>
          <pre className="mt-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm font-mono overflow-x-auto">
            <code>@import "@aai-agency/og-components/styles.css";</code>
          </pre>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Quick Example</h2>
          <pre className="mt-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm font-mono overflow-x-auto">
{`import { Map } from "@aai-agency/og-components";

<Map
  assets={wells}
  mapboxAccessToken="pk.xxx"
  colorBy="status"
  height="600px"
/>`}
          </pre>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Components</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse the sidebar to see live demos of each component.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            <li><strong>Map</strong> — Interactive asset map with clustering, overlays, and drawing tools</li>
            <li><strong>LineChart</strong> — High-performance time series chart (uPlot)</li>
            <li><strong>AssetDetailCard</strong> — Expandable detail card for any asset</li>
            <li><strong>SelectionPanel</strong> — Multi-select panel with filters</li>
            <li><strong>OverlayManager</strong> — KMZ/KML/GeoJSON/Shapefile overlay management</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: GettingStarted,
});
