/**
 * Load sample well data from petry production-data CSVs.
 * Outputs a small JSON sample to data/ for development.
 * This script and output are gitignored - NEVER commit real well data.
 *
 * Usage: pnpm tsx scripts/load-sample-data.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");

// Adjust this to your local petry production-data path
const PETRY_DATA = resolve(process.env.HOME ?? "~", "Documents/petry/production-data");

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }
    return row;
  });
}

function csvRowToWell(row: Record<string, string>) {
  return {
    id: row.API_UWI || row.WellID || "",
    name: row.WellName || "",
    api: row.API_UWI || "",
    coordinates: {
      lat: Number.parseFloat(row.Latitude) || 0,
      lng: Number.parseFloat(row.Longitude) || 0,
    },
    operator: row.ENVOperator || "",
    status: (row.ENVWellStatus || "producing").toLowerCase().replace(/ /g, "-"),
    wellType: row.ENVProdWellType?.includes("GAS") ? "gas" : "oil",
    trajectory: (row.Trajectory || "horizontal").toLowerCase(),
    basin: row.ENVBasin || undefined,
    play: row.ENVPlay || undefined,
    formation: row.Formation || undefined,
    county: row.County || undefined,
    state: row.StateProvince || undefined,
    firstProdDate: row.FirstProdDate || undefined,
    lateralLength: row.LateralLength_FT ? Number.parseFloat(row.LateralLength_FT) : undefined,
    cumBOE: row.CumProd_BOE ? Number.parseFloat(row.CumProd_BOE) : undefined,
    cumOil: row["CumOil_BBL"] ? Number.parseFloat(row["CumOil_BBL"]) : undefined,
    cumGas: row["CumGas_MCF"] ? Number.parseFloat(row["CumGas_MCF"]) : undefined,
    cumWater: row.CumWater_BBL ? Number.parseFloat(row.CumWater_BBL) : undefined,
  };
}

const BASINS = [
  { name: "bakken", file: "bakken_wells.csv", sample: 500 },
  { name: "dj", file: "dj_wells.csv", sample: 500 },
];

mkdirSync(DATA_DIR, { recursive: true });

for (const basin of BASINS) {
  const filePath = resolve(PETRY_DATA, "basin", basin.name, basin.file);
  try {
    const content = readFileSync(filePath, "utf-8");
    const rows = parseCSV(content);
    const wells = rows
      .map(csvRowToWell)
      .filter((w) => w.coordinates.lat !== 0 && w.coordinates.lng !== 0)
      .slice(0, basin.sample);

    const outPath = resolve(DATA_DIR, `${basin.name}-sample.json`);
    writeFileSync(outPath, JSON.stringify(wells, null, 2));
    console.log(`✓ ${basin.name}: ${wells.length} wells → ${outPath}`);
  } catch (e) {
    console.warn(`⚠ Skipping ${basin.name}: ${(e as Error).message}`);
  }
}

console.log("\nDone. Sample data written to data/ (gitignored).");
