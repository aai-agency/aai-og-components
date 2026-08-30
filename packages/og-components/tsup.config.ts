import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "components/asset-breakdown/index": "src/components/asset-breakdown/index.ts",
    "components/asset-card/index": "src/components/asset-card/index.ts",
    "components/decline-curve/index": "src/components/decline-curve/index.ts",
    "components/event-timeline/index": "src/components/event-timeline/index.ts",
    "components/line-chart/index": "src/components/line-chart/index.ts",
    "components/map/index": "src/components/map/index.ts",
    "components/ui/index": "src/components/ui/index.ts",
    "schemas/index": "src/schemas/index.ts",
    "utils/index": "src/utils/index.ts",
    "services/index": "src/services/index.ts",
    "machines/index": "src/machines/index.ts",
    "sample-data/index": "src/sample-data/index.ts",
    "types/index": "src/types/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  treeshake: true,
  clean: true,
  external: ["react", "react-dom", "sql.js", "mapbox-gl"],
  sourcemap: true,
  minify: false,
});
