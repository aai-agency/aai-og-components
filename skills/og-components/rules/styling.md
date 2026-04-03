# Styling Rules

## Tailwind CSS

This library uses Tailwind CSS v4 with shadcn-style tokens. The consumer's project provides Tailwind.

### Setup

Consumer imports the theme CSS:

```css
@import "@aai-agency/og-components/styles.css";
```

This provides the shadcn color tokens (background, foreground, muted, border, primary, etc.).

## Semantic Colors

Use semantic token names, not raw colors.

### Incorrect

```tsx
<div className="bg-white text-gray-900 border-gray-200">
<div style={{ background: "#ffffff", color: "#0f172a" }}>
```

### Correct

```tsx
<div className="bg-background text-foreground border-border">
<div className="bg-muted text-muted-foreground">
<div className="bg-popover text-popover-foreground">
```

## Available Tokens

| Token | Purpose |
|-------|---------|
| `background` / `foreground` | Page background and text |
| `muted` / `muted-foreground` | Subtle backgrounds and secondary text |
| `card` / `card-foreground` | Card surfaces |
| `popover` / `popover-foreground` | Popovers, dropdowns, tooltips |
| `border` | Borders and dividers |
| `primary` / `primary-foreground` | Primary actions |
| `secondary` / `secondary-foreground` | Secondary actions |
| `accent` / `accent-foreground` | Hover states |
| `destructive` / `destructive-foreground` | Danger actions |
| `ring` | Focus rings |

## cn() Utility

Use `cn()` from `@/lib/utils` to merge Tailwind classes conditionally.

### Incorrect

```tsx
<div className={`px-4 py-2 ${isActive ? "bg-primary" : "bg-muted"}`}>
```

### Correct

```tsx
import { cn } from "@/lib/utils";

<div className={cn("px-4 py-2", isActive ? "bg-primary" : "bg-muted")}>
```

## Z-Index

Map internals use these z-index ranges:

| Range | Purpose |
|-------|---------|
| 10-15 | Map panels (detail card, selection panel, overlay manager) |
| 20-30 | Map controls toolbar |
| 50 | Tooltips |
| 100000 | Tooltip portals (Radix) |

Don't use z-index values in these ranges for consumer UI placed near the map.

## Component Internal Styles

Map component internals still use inline styles (migrating to Tailwind incrementally). When modifying map sub-components:
- Use the theme constants from `theme.ts` for colors
- Prefer Tailwind classes for new code
- Don't mix CSS frameworks (no styled-components, emotion, etc.)

## Panels

All map panels (legend, selection, detail card, controls) use solid white backgrounds.

### Incorrect

```ts
background: "rgba(255, 255, 255, 0.8)"  // No transparent panels
```

### Correct

```ts
background: "#ffffff"  // Solid white
```

## Selected Markers

When a marker is selected, keep the original fill color and add a dark border. Never turn markers white.

### Incorrect

```ts
// White fill on selection
fillColor: "#ffffff"
```

### Correct

```ts
// Keep original color, add dark border
strokeColor: "#1e293b"
strokeWidth: 2
```
