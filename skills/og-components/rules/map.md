# Map Component Rules

## Required Props

The Map component requires `assets` and `mapboxAccessToken`. Everything else has defaults.

### Incorrect

```tsx
// Missing mapboxAccessToken
<Map assets={assets} />

// Token hardcoded in source
<Map assets={assets} mapboxAccessToken="pk.eyJ1..." />
```

### Correct

```tsx
<Map
  assets={assets}
  mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
/>
```

## TooltipProvider

Map uses Radix tooltips internally. If you render Map outside a TooltipProvider, it crashes.

### Incorrect

```tsx
const App = () => (
  <Map assets={assets} mapboxAccessToken={token} />
);
```

### Correct

```tsx
import { TooltipProvider } from "@aai-agency/og-components";

const App = () => (
  <TooltipProvider>
    <Map assets={assets} mapboxAccessToken={token} />
  </TooltipProvider>
);
```

## Controls

Available control IDs: `"pan"`, `"zoom"`, `"fullscreen"`, `"center"`, `"draw-polygon"`, `"draw-rectangle"`, `"draw-circle"`, `"layers"`, `"labels"`.

### Incorrect

```tsx
// Passing unknown control names
<Map controls={["draw", "select"]} />
```

### Correct

```tsx
<Map controls={["pan", "zoom", "fullscreen", "center", "draw-polygon", "layers", "labels"]} />
```

## Layers

Available layer IDs: `"assets"`, `"clusters"`, `"lines"`, `"overlays"`, `"labels"`.

## Color Schemes

Set `colorBy` to change marker colors:

| Value | Meaning |
|-------|---------|
| `"status"` | Green=producing, Yellow=shut-in, Gray=abandoned |
| `"type"` | Unique color per asset type |
| `"production"` | Green shades by cumBOE/cumOil |
| `"waterCut"` | Green/yellow/red by water percentage |
| `"wellType"` | Green=oil, Red=gas, Cyan=injection |
| `"operator"` | Unique color per operator |
| `"basin"` | Unique color per basin |

## Height

The map needs explicit height. Without it, it collapses to 0.

### Incorrect

```tsx
<Map assets={assets} mapboxAccessToken={token} />
// Relies on default "500px" which may not be what you want
```

### Correct

```tsx
<Map assets={assets} mapboxAccessToken={token} height="calc(100vh - 64px)" />
```

## Overlay Upload

Enable with `enableOverlayUpload`. Supports KMZ, KML, GeoJSON, Shapefile (zip).

```tsx
<Map enableOverlayUpload assets={assets} mapboxAccessToken={token} />
```

## Event Handlers

| Prop | Fires when |
|------|-----------|
| `onAssetClick` | User clicks an asset |
| `onAssetHover` | User hovers over an asset |
| `onLassoSelect` | User selects assets with a drawn shape |
| `onViewStateChange` | User pans or zooms |
| `onDrawCreate` | User finishes drawing a shape |
| `onDetailClose` | User closes the detail card |

## Custom Detail Card

```tsx
<Map
  showDetailCard
  detailSections={[
    {
      id: "reservoir",
      title: "Reservoir Data",
      fields: [
        { key: "properties.porosity", label: "Porosity", format: "percentage" },
        { key: "properties.netPay", label: "Net Pay", format: "number", unit: "ft" },
      ],
    },
  ]}
/>
```

## Every Control Needs a Tooltip

When adding new buttons or controls to the map, always wrap them in the `<Tooltip>` component. No exceptions.
