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
      "@aai-agency/og-components": path.resolve(__dirname, "../../packages/og/src/index.ts"),
    },
  },
});
