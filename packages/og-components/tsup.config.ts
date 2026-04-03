import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "schemas/index": "src/schemas/index.ts",
    "utils/index": "src/utils/index.ts",
    "services/index": "src/services/index.ts",
    "machines/index": "src/machines/index.ts",
    "sample-data/index": "src/sample-data/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  treeshake: true,
  clean: true,
  external: ["react", "react-dom", "sql.js"],
  sourcemap: true,
  minify: false,
});
