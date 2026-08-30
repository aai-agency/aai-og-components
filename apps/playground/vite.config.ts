import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackRouter({ autoCodeSplitting: true }), react(), tailwindcss()],
  envDir: "../../",
  resolve: {
    alias: {
      // More specific aliases first — Vite picks the first match.
      "@aai-agency/og-components/asset-card": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/asset-card/index.ts",
      ),
      "@aai-agency/og-components/asset-breakdown": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/asset-breakdown/index.ts",
      ),
      "@aai-agency/og-components/decline-curve": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/decline-curve/index.ts",
      ),
      "@aai-agency/og-components/event-timeline": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/event-timeline/index.ts",
      ),
      "@aai-agency/og-components/chart": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/line-chart/index.ts",
      ),
      "@aai-agency/og-components/line-chart": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/line-chart/index.ts",
      ),
      "@aai-agency/og-components/map": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/map/index.ts",
      ),
      "@aai-agency/og-components/sample-data": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/sample-data/index.ts",
      ),
      "@aai-agency/og-components/types": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/types/index.ts",
      ),
      "@aai-agency/og-components/ui": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/components/ui/index.ts",
      ),
      "@aai-agency/og-components/utils": path.resolve(
        import.meta.dirname,
        "../../packages/og-components/src/utils/index.ts",
      ),
      "@aai-agency/og-components": path.resolve(import.meta.dirname, "../../packages/og-components/src/index.ts"),
    },
  },
});
