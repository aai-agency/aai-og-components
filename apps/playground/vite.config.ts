import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  envDir: "../../",
  resolve: {
    alias: {
      // More specific aliases first — Vite picks the first match.
      "@aai-agency/og-components/sample-data": path.resolve(
        __dirname,
        "../../packages/og-components/src/sample-data/index.ts",
      ),
      "@aai-agency/og-components": path.resolve(__dirname, "../../packages/og-components/src/index.ts"),
    },
  },
});
