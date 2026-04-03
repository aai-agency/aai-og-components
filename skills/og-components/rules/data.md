# Data Rules

## Asset Schema

Every entity on the map is an Asset. All 6 fields are required.

### Incorrect

```ts
// Missing required fields
const well = {
  id: "w1",
  name: "My Well",
  lat: 48.12,
  lng: -103.45,
};

// Domain fields at top level instead of properties
const well = {
  id: "w1",
  name: "My Well",
  type: "well",
  status: "producing",
  coordinates: { lat: 48.12, lng: -103.45 },
  operator: "Coastal Energy",  // WRONG — this goes in properties
  cumOil: 245000,              // WRONG — this goes in properties
};
```

### Correct

```ts
const well: Asset = {
  id: "w1",
  name: "My Well",
  type: "well",
  status: "producing",
  coordinates: { lat: 48.12, lng: -103.45 },
  properties: {
    operator: "Coastal Energy",
    cumOil: 245000,
    wellType: "oil",
    basin: "Bakken",
  },
};
```

## Properties Field

The `properties` object is flexible — any key/value pairs work. They auto-display in the detail card.

Well-specific properties that the library understands:

```ts
properties: {
  api: string,           // API/UWI number
  operator: string,
  wellType: "oil" | "gas" | "injection" | "disposal" | "observation",
  trajectory: "horizontal" | "vertical" | "directional",
  basin: string,
  formation: string,
  county: string,
  state: string,
  cumOil: number,        // BBL
  cumGas: number,        // MSCF
  cumWater: number,      // BBL
  cumBOE: number,
  lateralLength: number, // ft
  firstProdDate: string, // ISO date
  timeSeries: TimeSeries[], // for production charts
}
```

## Validation

Use Zod schemas at data boundaries (API responses, CSV imports, user input).

### Incorrect

```ts
// No validation on external data
const assets = await fetch("/api/wells").then(r => r.json());
```

### Correct

```ts
import { parseAssets, safeParseAssets } from "@aai-agency/og-components/schemas";

// Throws on invalid
const assets = parseAssets(await fetch("/api/wells").then(r => r.json()));

// Safe parse (no throw)
const result = safeParseAssets(rawData);
if (result.success) {
  useAssets(result.data);
}
```

## Storage

Three backends, all implement the `AssetStore` interface:

| Store | When to use | Persistence |
|-------|------------|-------------|
| `InMemoryStore` | Testing, temporary data | None |
| `LocalStorageStore` | Small datasets (<10K assets) | Browser localStorage |
| `SqliteStore` | Large datasets (10K+ assets) | Browser IndexedDB via WASM |

### Incorrect

```ts
// Calling SqliteStore constructor directly
const store = new SqliteStore("my-app"); // WRONG — needs async init
```

### Correct

```ts
import { createSqliteStore } from "@aai-agency/og-components/services";

// Async factory — initializes WASM module
const store = await createSqliteStore("my-app");
```

## CSV Import

For Enverus/IHS-style data:

```ts
import { csvRowToAsset, filterPlottable } from "@aai-agency/og-components";

const assets = csvRows.map(csvRowToAsset);
const valid = filterPlottable(assets); // removes bad coordinates
```

## Coordinates

Always validate coordinates before plotting:

```ts
import { isValidCoordinates, filterPlottable } from "@aai-agency/og-components";

// Single check
isValidCoordinates({ lat: 48.12, lng: -103.45 }); // true
isValidCoordinates({ lat: 999, lng: 0 });          // false

// Bulk filter
const plottable = filterPlottable(assets);
```
