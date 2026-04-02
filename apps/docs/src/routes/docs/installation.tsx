import { createFileRoute } from "@tanstack/react-router";
import { CodeBlock } from "../../components/code-block";
import { OnThisPage } from "../../components/on-this-page";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/docs/installation")({
  component: InstallationPage,
});

const TOC_ITEMS = [
  { title: "Installation", id: "installation" },
  { title: "Environment Setup", id: "environment-setup" },
  { title: "Quick Start", id: "quick-start" },
];

function TocPortal() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById("toc-container"));
  }, []);
  if (!container) return null;
  return createPortal(<OnThisPage items={TOC_ITEMS} />, container);
}

function InstallationPage() {
  return (
    <>
      <TocPortal />
      <div className="space-y-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Installation</h1>
          <p className="mt-2 text-base text-neutral-500">
            Get started with @aai-agency/og-components in your React project.
          </p>
        </div>

        <section id="installation">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Installation</h2>
          <p className="text-sm text-neutral-600 mb-4">
            Install the package and its peer dependencies.
          </p>
          <CodeBlock
            language="bash"
            code={`pnpm add @aai-agency/og-components mapbox-gl`}
          />
          <p className="text-sm text-neutral-500 mt-3">
            The package requires <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono">react &gt;= 18</code> and a Mapbox access token for the map components.
          </p>
        </section>

        <section id="environment-setup">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Environment Setup</h2>
          <p className="text-sm text-neutral-600 mb-4">
            Create a <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono">.env</code> file in your project root with your Mapbox token.
          </p>
          <CodeBlock
            language="env"
            code={`VITE_MAPBOX_TOKEN=pk.your_mapbox_token_here`}
          />
          <p className="text-sm text-neutral-500 mt-3">
            You can get a free Mapbox token at{" "}
            <a
              href="https://account.mapbox.com/access-tokens/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-900 underline underline-offset-4"
            >
              mapbox.com
            </a>.
          </p>
        </section>

        <section id="quick-start">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Quick Start</h2>
          <p className="text-sm text-neutral-600 mb-4">
            Import the map component and the required Mapbox CSS, then render it with your asset data.
          </p>
          <CodeBlock
            language="tsx"
            code={`import { Map } from "@aai-agency/og-components";
import "mapbox-gl/dist/mapbox-gl.css";

const assets = [
  {
    id: "1",
    name: "MESA VERDE 1H",
    type: "well",
    status: "producing",
    coordinates: { lat: 31.92, lng: -103.45 },
    properties: {
      operator: "Pioneer Natural Resources",
      wellType: "oil",
      basin: "Permian",
    },
  },
];

export function App() {
  return (
    <Map
      assets={assets}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/light-v11"
      colorBy="status"
      height="600px"
      showDetailCard
      showControls
    />
  );
}`}
          />
        </section>
      </div>
    </>
  );
}
