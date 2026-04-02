import { Link, Outlet, createRootRoute, useRouterState } from "@tanstack/react-router";
import { SidebarNav } from "../components/sidebar-nav";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Playground route gets full-screen layout without sidebar
  const isPlayground = currentPath === "/playground";

  if (isPlayground) {
    return <Outlet />;
  }

  // Home page gets layout without right sidebar
  const isHome = currentPath === "/";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-screen-2xl mx-auto flex h-14 items-center px-6">
          <Link to="/" className="flex items-center gap-2.5 mr-8">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-[10px] font-bold text-white">
              OG
            </div>
            <span className="text-sm font-semibold text-neutral-900">
              og-components
            </span>
          </Link>

          <nav className="flex items-center gap-6 text-sm">
            <Link
              to="/"
              className={`transition-colors ${
                currentPath === "/" ? "text-neutral-900 font-medium" : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              Docs
            </Link>
            <Link
              to="/docs/components/og-map"
              className={`transition-colors ${
                currentPath.startsWith("/docs/components") ? "text-neutral-900 font-medium" : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              Components
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <a
              href="https://github.com/aai-agency/aai-og-components"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto flex">
        {/* Left Sidebar */}
        <aside className="hidden lg:block w-[240px] shrink-0 border-r border-neutral-200">
          <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-6 px-4">
            <SidebarNav />
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 min-w-0 ${isHome ? "" : "px-8 py-8"}`}>
          <div className={isHome ? "" : "max-w-3xl"}>
            <Outlet />
          </div>
        </main>

        {/* Right Sidebar (On This Page) - only on docs pages */}
        {!isHome && (
          <aside className="hidden xl:block w-[200px] shrink-0">
            <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-8 px-4" id="toc-container" />
          </aside>
        )}
      </div>
    </div>
  );
}
