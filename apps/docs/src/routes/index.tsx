import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IntroductionPage,
});

function IntroductionPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <div className="px-8 py-16 border-b border-neutral-200">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900">
            @aai-agency/og-components
          </h1>
          <p className="mt-4 text-xl text-neutral-600 leading-relaxed">
            Open-source Oil and Gas map components for React. Production-ready UI for wells, pipelines, facilities, and field data.
          </p>
          <p className="mt-4 text-base text-neutral-500 leading-relaxed">
            Built on Mapbox GL, deck.gl, and uPlot. Designed for operators, engineers, and analysts who need to visualize field assets on interactive maps with real-time production data, overlay uploads, drawing tools, and selection panels.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              to="/docs/installation"
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/aai-agency/aai-og-components"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>

    </div>
  );
}
