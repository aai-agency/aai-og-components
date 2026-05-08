import { TooltipProvider } from "@aai-agency/og-components";
import { Link, Outlet, createRootRoute } from "@tanstack/react-router";

const NAV_ITEMS = [
  { label: "Getting Started", to: "/" },
  {
    group: "Components",
    items: [
      { label: "Map", to: "/components/map" },
      { label: "LineChart", to: "/components/line-chart" },
      { label: "DeclineCurve", to: "/components/decline-curve" },
      { label: "AssetDetailCard", to: "/components/asset-detail-card" },
      { label: "SelectionPanel", to: "/components/selection-panel" },
      { label: "OverlayManager", to: "/components/overlay-manager" },
    ],
  },
  {
    group: "Utilities",
    items: [
      { label: "Schemas", to: "/utilities/schemas" },
      { label: "Helpers", to: "/utilities/helpers" },
    ],
  },
];

const Sidebar = () => {
  return (
    <aside className="fixed top-0 left-0 z-30 h-screen w-64 border-r border-border bg-background overflow-y-auto">
      <div className="px-6 py-5 border-b border-border">
        <Link to="/" className="text-sm font-semibold text-foreground tracking-tight">
          @aai/og-components
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5">O&amp;G React Components</p>
      </div>
      <nav className="px-3 py-4 space-y-4">
        {NAV_ITEMS.map((item) => {
          if ("to" in item) {
            return (
              <Link
                key={item.to}
                to={item.to}
                className="block px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                activeProps={{
                  className: "block px-3 py-1.5 rounded-md text-sm font-medium text-foreground bg-accent",
                }}
              >
                {item.label}
              </Link>
            );
          }
          return (
            <div key={item.group}>
              <p className="px-3 mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {item.group}
              </p>
              <div className="space-y-0.5">
                {item.items.map((child) => (
                  <Link
                    key={child.to}
                    to={child.to}
                    className="block px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    activeProps={{
                      className: "block px-3 py-1.5 rounded-md text-sm font-medium text-foreground bg-accent",
                    }}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

const RootLayout = () => {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground font-sans">
        <Sidebar />
        <main className="ml-64 min-h-screen">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
});
