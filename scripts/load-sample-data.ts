/**
 * Load sample well data + production history from production-data CSVs.
 * Outputs JSON samples to data/ for development.
 * This script and output are gitignored - NEVER commit real well data.
 *
 * Usage: pnpm tsx scripts/load-sample-data.ts
 */

import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");

const SAMPLE_DATA = resolve(process.env.HOME ?? "~", "Documents/production-data");

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

interface WellData {
  id: string;
  name: string;
  api: string;
  coordinates: { lat: number; lng: number };
  operator: string;
  status: string;
  wellType: string;
  trajectory: string;
  basin?: string;
  play?: string;
  formation?: string;
  county?: string;
  state?: string;
  firstProdDate?: string;
  lateralLength?: number;
  cumBOE?: number;
  cumOil?: number;
  cumGas?: number;
  cumWater?: number;
  timeSeries?: {
    id: string;
    fluidType: string;
    curveType: string;
    unit: string;
    frequency: string;
    data: { date: string; value: number }[];
  }[];
}

function csvRowToWell(row: Record<string, string>): WellData {
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
    cumOil: row.CumOil_BBL ? Number.parseFloat(row.CumOil_BBL) : undefined,
    cumGas: row.CumGas_MCF ? Number.parseFloat(row.CumGas_MCF) : undefined,
    cumWater: row.CumWater_BBL ? Number.parseFloat(row.CumWater_BBL) : undefined,
  };
}

/**
 * Stream the production CSV line-by-line, only keeping rows for wells in our sample set.
 * This avoids loading the full 400MB file into memory.
 */
async function streamProductionData(
  filePath: string,
  wellIds: Set<string>,
): Promise<Map<string, { date: string; oil: number; gas: number; water: number }[]>> {
  const byWell = new Map<string, { date: string; oil: number; gas: number; water: number }[]>();

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let headers: string[] | null = null;
  let lineCount = 0;

  for await (const line of rl) {
    if (!headers) {
      headers = line.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      continue;
    }

    lineCount++;
    const values = line.split(",");

    // Find API column index
    const apiIdx = headers.indexOf("API_UWI");
    const api = apiIdx >= 0 ? values[apiIdx]?.trim().replace(/^"|"$/g, "") : "";
    if (!api || !wellIds.has(api)) continue;

    // Parse only the columns we need
    const getValue = (col: string): string => {
      const idx = headers?.indexOf(col);
      return idx >= 0 ? (values[idx]?.trim().replace(/^"|"$/g, "") ?? "") : "";
    };

    const date = getValue("ProducingMonth").slice(0, 10);
    if (!date) continue;

    const oil = Math.round(Number.parseFloat(getValue("LiquidsProd_BBL")) || 0);
    const gas = Math.round(Number.parseFloat(getValue("GasProd_MCF")) || 0);
    const water = Math.round(Number.parseFloat(getValue("WaterProd_BBL")) || 0);

    let arr = byWell.get(api);
    if (!arr) {
      arr = [];
      byWell.set(api, arr);
    }
    arr.push({ date, oil, gas, water });
  }

  console.log(`    streamed ${lineCount.toLocaleString()} rows, matched ${byWell.size} wells`);
  return byWell;
}

/** Convert monthly production rows into TimeSeries arrays */
function buildTimeSeries(wellId: string, records: { date: string; oil: number; gas: number; water: number }[]) {
  const sorted = records.sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const series: WellData["timeSeries"] = [];

  const oilData = sorted.filter((r) => r.oil > 0).map((r) => ({ date: r.date, value: r.oil }));
  const gasData = sorted.filter((r) => r.gas > 0).map((r) => ({ date: r.date, value: r.gas }));
  const waterData = sorted.filter((r) => r.water > 0).map((r) => ({ date: r.date, value: r.water }));

  if (oilData.length > 1) {
    series.push({
      id: `${wellId}-oil`,
      fluidType: "oil",
      curveType: "actual",
      unit: "BBL",
      frequency: "monthly",
      data: oilData,
    });
  }
  if (gasData.length > 1) {
    series.push({
      id: `${wellId}-gas`,
      fluidType: "gas",
      curveType: "actual",
      unit: "MSCF",
      frequency: "monthly",
      data: gasData,
    });
  }
  if (waterData.length > 1) {
    series.push({
      id: `${wellId}-water`,
      fluidType: "water",
      curveType: "actual",
      unit: "BBL",
      frequency: "monthly",
      data: waterData,
    });
  }

  return series;
}

const BASINS = [
  { name: "bakken", wellsFile: "bakken_wells.csv", prodFile: "bakken_prod.csv", sample: 500 },
  { name: "dj", wellsFile: "dj_wells.csv", prodFile: "dj_prod.csv", sample: 500 },
];

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  for (const basin of BASINS) {
    const wellsPath = resolve(SAMPLE_DATA, "basin", basin.name, basin.wellsFile);
    const prodPath = resolve(SAMPLE_DATA, "basin", basin.name, basin.prodFile);

    try {
      // Load wells
      const wellsContent = readFileSync(wellsPath, "utf-8");
      const wellRows = parseCSV(wellsContent);
      const wells = wellRows
        .map(csvRowToWell)
        .filter((w) => w.coordinates.lat !== 0 && w.coordinates.lng !== 0)
        .slice(0, basin.sample);

      console.log(`  ${basin.name}: ${wells.length} wells loaded`);

      // Stream production data (memory-safe)
      const wellIds = new Set(wells.map((w) => w.id));
      console.log(`  ${basin.name}: streaming production history...`);
      const prodByWell = await streamProductionData(prodPath, wellIds);

      // Attach time series
      let withProd = 0;
      for (const well of wells) {
        const records = prodByWell.get(well.id);
        if (records && records.length > 0) {
          well.timeSeries = buildTimeSeries(well.id, records);
          if (well.timeSeries.length > 0) withProd++;
        }
      }

      const outPath = resolve(DATA_DIR, `${basin.name}-sample.json`);
      writeFileSync(outPath, JSON.stringify(wells, null, 2));
      console.log(`✓ ${basin.name}: ${wells.length} wells (${withProd} with production history) → ${outPath}`);
    } catch (e) {
      console.warn(`⚠ Skipping ${basin.name}: ${(e as Error).message}`);
    }
  }

  console.log("\nDone. Sample data written to data/ (gitignored).");
}

main();
