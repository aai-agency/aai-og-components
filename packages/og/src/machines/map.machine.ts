import { setup, assign, fromPromise } from "xstate";
import type { Asset, AssetTypeConfig, MapViewState, MapOverlay, ColorScheme, AssetStore } from "../types";

// ── Context ──────────────────────────────────────────────────────────────────

export interface MapContext {
  /** All assets currently loaded */
  assets: Asset[];
  /** Visible (filtered) asset indices */
  visibleIndices: number[];
  /** Per-type display configuration */
  typeConfigs: Map<string, AssetTypeConfig>;
  /** Currently selected asset(s) */
  selectedIds: Set<string>;
  /** Hovered asset + screen position */
  hovered: { asset: Asset; x: number; y: number } | null;
  /** Current map view */
  viewState: MapViewState;
  /** Current map bounds [west, south, east, north] */
  bounds: [number, number, number, number] | null;
  /** Active color scheme */
  colorScheme: ColorScheme;
  /** Loaded overlays (KMZ, KML, GeoJSON) */
  overlays: MapOverlay[];
  /** Active type filters — null = show all */
  typeFilter: Set<string> | null;
  /** Active status filters — null = show all */
  statusFilter: Set<string> | null;
  /** Search query */
  searchQuery: string;
  /** Optional store for persistence */
  store: AssetStore | null;
  /** Error from last operation */
  error: string | null;
}

// ── Events ───────────────────────────────────────────────────────────────────

export type MapEvent =
  | { type: "LOAD_ASSETS"; assets: Asset[] }
  | { type: "LOAD_FROM_STORE" }
  | { type: "ASSETS_LOADED"; assets: Asset[] }
  | { type: "SET_ASSETS"; assets: Asset[] }
  | { type: "ADD_ASSETS"; assets: Asset[] }
  | { type: "REMOVE_ASSETS"; ids: string[] }
  | { type: "SELECT"; id: string; multi?: boolean }
  | { type: "SELECT_MANY"; ids: string[] }
  | { type: "DESELECT"; id: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "HOVER"; asset: Asset; x: number; y: number }
  | { type: "UNHOVER" }
  | { type: "PAN_ZOOM"; viewState: MapViewState }
  | { type: "SET_BOUNDS"; bounds: [number, number, number, number] }
  | { type: "FIT_TO_ASSETS" }
  | { type: "SET_COLOR_SCHEME"; scheme: ColorScheme }
  | { type: "SET_TYPE_FILTER"; types: string[] | null }
  | { type: "SET_STATUS_FILTER"; statuses: string[] | null }
  | { type: "SEARCH"; query: string }
  | { type: "REGISTER_TYPE_CONFIG"; config: AssetTypeConfig }
  | { type: "ADD_OVERLAY"; overlay: MapOverlay }
  | { type: "REMOVE_OVERLAY"; id: string }
  | { type: "TOGGLE_OVERLAY"; id: string }
  | { type: "UPLOAD_FILE"; file: File }
  | { type: "FILE_PARSED"; overlay: MapOverlay }
  | { type: "ERROR"; message: string }
  | { type: "CLICK_CLUSTER"; longitude: number; latitude: number; expansionZoom: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeVisibleIndices(ctx: MapContext): number[] {
  const indices: number[] = [];
  for (let i = 0; i < ctx.assets.length; i++) {
    const asset = ctx.assets[i];

    // Type filter
    if (ctx.typeFilter && !ctx.typeFilter.has(asset.type)) continue;

    // Status filter
    if (ctx.statusFilter && !ctx.statusFilter.has(asset.status)) continue;

    // Search filter
    if (ctx.searchQuery) {
      const q = ctx.searchQuery.toLowerCase();
      const nameMatch = asset.name.toLowerCase().includes(q);
      const idMatch = asset.id.toLowerCase().includes(q);
      if (!nameMatch && !idMatch) continue;
    }

    indices.push(i);
  }
  return indices;
}

function fitBoundsFromAssets(assets: Asset[]): MapViewState {
  if (assets.length === 0) {
    return { longitude: -98.5, latitude: 39.8, zoom: 4 };
  }
  const lats = assets.map((a) => a.coordinates.lat);
  const lngs = assets.map((a) => a.coordinates.lng);
  const minLat = Math.min(...lats) - 0.1;
  const maxLat = Math.max(...lats) + 0.1;
  const minLng = Math.min(...lngs) - 0.1;
  const maxLng = Math.max(...lngs) + 0.1;
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const maxDiff = Math.max(maxLat - minLat, maxLng - minLng);
  const zoom = Math.max(1, Math.min(15, Math.floor(8 - Math.log2(maxDiff))));
  return { longitude: centerLng, latitude: centerLat, zoom };
}

// ── Actors (async services) ──────────────────────────────────────────────────

const loadFromStore = fromPromise<Asset[], { store: AssetStore }>(
  async ({ input }) => {
    return input.store.getAssets();
  }
);

const parseOverlayFile = fromPromise<MapOverlay, { file: File }>(
  async ({ input }) => {
    const { parseKMZ, parseKML, parseGeoJSONFile } = await import("../utils/overlay-parsers");
    const name = input.file.name.toLowerCase();

    if (name.endsWith(".kmz")) {
      return parseKMZ(input.file);
    }
    if (name.endsWith(".kml")) {
      return parseKML(input.file);
    }
    if (name.endsWith(".geojson") || name.endsWith(".json")) {
      return parseGeoJSONFile(input.file);
    }
    throw new Error(`Unsupported file type: ${name}`);
  }
);

const persistOverlay = fromPromise<MapOverlay, { store: AssetStore; overlay: MapOverlay }>(
  async ({ input }) => {
    return input.store.saveOverlay(input.overlay);
  }
);

// ── Machine ──────────────────────────────────────────────────────────────────

export interface MapInput {
  assets?: Asset[];
  viewState?: MapViewState;
  colorScheme?: ColorScheme;
  typeConfigs?: Map<string, AssetTypeConfig>;
  store?: AssetStore | null;
}

export const mapMachine = setup({
  types: {
    context: {} as MapContext,
    events: {} as MapEvent,
    input: {} as MapInput,
  },
  actors: {
    loadFromStore,
    parseOverlayFile,
    persistOverlay,
  },
}).createMachine({
  id: "ogMap",
  initial: "idle",
  context: ({ input }) => ({
    assets: input.assets ?? [],
    visibleIndices: [] as number[],
    typeConfigs: input.typeConfigs ?? new Map<string, AssetTypeConfig>(),
    selectedIds: new Set<string>(),
    hovered: null,
    viewState: input.viewState ?? { longitude: -98.5, latitude: 39.8, zoom: 4 },
    bounds: null as [number, number, number, number] | null,
    colorScheme: (input.colorScheme ?? "status") as ColorScheme,
    overlays: [] as MapOverlay[],
    typeFilter: null as Set<string> | null,
    statusFilter: null as Set<string> | null,
    searchQuery: "",
    store: input.store ?? null,
    error: null as string | null,
  }),

  on: {
    // ── View state (always available) ──
    PAN_ZOOM: {
      actions: assign({
        viewState: ({ event }) => event.viewState,
      }),
    },
    SET_BOUNDS: {
      actions: assign({
        bounds: ({ event }) => event.bounds,
      }),
    },

    // ── Hover (always available) ──
    HOVER: {
      actions: assign({
        hovered: ({ event }) => ({ asset: event.asset, x: event.x, y: event.y }),
      }),
    },
    UNHOVER: {
      actions: assign({
        hovered: () => null,
      }),
    },

    // ── Error handling ──
    ERROR: {
      actions: assign({
        error: ({ event }) => event.message,
      }),
    },
  },

  states: {
    idle: {
      on: {
        LOAD_ASSETS: {
          target: "ready",
          actions: assign(({ event }) => {
            const assets = event.assets;
            const ctx: Partial<MapContext> = {
              assets,
              viewState: fitBoundsFromAssets(assets),
              error: null,
            };
            return ctx as MapContext;
          }),
        },
        LOAD_FROM_STORE: {
          target: "loading",
        },
      },
    },

    loading: {
      invoke: {
        src: "loadFromStore",
        input: ({ context }) => ({ store: context.store! }),
        onDone: {
          target: "ready",
          actions: assign(({ event }) => {
            const assets = event.output;
            return {
              assets,
              visibleIndices: Array.from({ length: assets.length }, (_, i) => i),
              viewState: fitBoundsFromAssets(assets),
              error: null,
            } as unknown as MapContext;
          }),
        },
        onError: {
          target: "idle",
          actions: assign({
            error: ({ event }) => String(event.error),
          }),
        },
      },
    },

    ready: {
      entry: assign(({ context }) => ({
        visibleIndices: computeVisibleIndices(context),
      })),

      on: {
        // ── Asset data management ──
        SET_ASSETS: {
          actions: assign(({ context, event }) => {
            const assets = event.assets;
            return {
              assets,
              visibleIndices: computeVisibleIndices({ ...context, assets }),
            };
          }),
        },
        ADD_ASSETS: {
          actions: assign(({ context, event }) => {
            const assets = [...context.assets, ...event.assets];
            return {
              assets,
              visibleIndices: computeVisibleIndices({ ...context, assets }),
            };
          }),
        },
        REMOVE_ASSETS: {
          actions: assign(({ context, event }) => {
            const removeSet = new Set(event.ids);
            const assets = context.assets.filter((a) => !removeSet.has(a.id));
            const selectedIds = new Set(context.selectedIds);
            for (const id of event.ids) selectedIds.delete(id);
            return {
              assets,
              selectedIds,
              visibleIndices: computeVisibleIndices({ ...context, assets }),
            };
          }),
        },

        // ── Selection ──
        SELECT: {
          actions: assign(({ context, event }) => {
            const selectedIds = event.multi ? new Set(context.selectedIds) : new Set<string>();
            selectedIds.add(event.id);
            return { selectedIds };
          }),
        },
        SELECT_MANY: {
          actions: assign(({ event }) => ({
            selectedIds: new Set(event.ids),
          })),
        },
        DESELECT: {
          actions: assign(({ context, event }) => {
            const selectedIds = new Set(context.selectedIds);
            selectedIds.delete(event.id);
            return { selectedIds };
          }),
        },
        CLEAR_SELECTION: {
          actions: assign({ selectedIds: () => new Set<string>() }),
        },

        // ── Filtering ──
        SET_COLOR_SCHEME: {
          actions: assign({
            colorScheme: ({ event }) => event.scheme,
          }),
        },
        SET_TYPE_FILTER: {
          actions: assign(({ context, event }) => {
            const typeFilter = event.types ? new Set(event.types) : null;
            return {
              typeFilter,
              visibleIndices: computeVisibleIndices({ ...context, typeFilter }),
            };
          }),
        },
        SET_STATUS_FILTER: {
          actions: assign(({ context, event }) => {
            const statusFilter = event.statuses ? new Set(event.statuses) : null;
            return {
              statusFilter,
              visibleIndices: computeVisibleIndices({ ...context, statusFilter }),
            };
          }),
        },
        SEARCH: {
          actions: assign(({ context, event }) => {
            const searchQuery = event.query;
            return {
              searchQuery,
              visibleIndices: computeVisibleIndices({ ...context, searchQuery }),
            };
          }),
        },

        // ── Camera ──
        FIT_TO_ASSETS: {
          actions: assign(({ context }) => {
            const visible = context.visibleIndices.map((i) => context.assets[i]);
            return { viewState: fitBoundsFromAssets(visible) };
          }),
        },
        CLICK_CLUSTER: {
          actions: assign(({ context, event }) => ({
            viewState: {
              ...context.viewState,
              longitude: event.longitude,
              latitude: event.latitude,
              zoom: Math.min(event.expansionZoom, 18),
            },
          })),
        },

        // ── Type configs ──
        REGISTER_TYPE_CONFIG: {
          actions: assign(({ context, event }) => {
            const typeConfigs = new Map(context.typeConfigs);
            typeConfigs.set(event.config.type, event.config);
            return { typeConfigs };
          }),
        },

        // ── Overlays ──
        ADD_OVERLAY: {
          actions: assign(({ context, event }) => ({
            overlays: [...context.overlays, event.overlay],
          })),
        },
        REMOVE_OVERLAY: {
          actions: assign(({ context, event }) => ({
            overlays: context.overlays.filter((o) => o.id !== event.id),
          })),
        },
        TOGGLE_OVERLAY: {
          actions: assign(({ context, event }) => ({
            overlays: context.overlays.map((o) =>
              o.id === event.id ? { ...o, visible: !o.visible } : o
            ),
          })),
        },

        // ── File upload ──
        UPLOAD_FILE: {
          target: ".parsing",
        },

        // ── Re-load from external
        LOAD_ASSETS: {
          actions: assign(({ context, event }) => {
            const assets = event.assets;
            return {
              assets,
              visibleIndices: computeVisibleIndices({ ...context, assets }),
              viewState: fitBoundsFromAssets(assets),
            };
          }),
        },
      },

      initial: "browsing",
      states: {
        browsing: {},
        parsing: {
          invoke: {
            src: "parseOverlayFile",
            input: ({ event }) => {
              const e = event as Extract<MapEvent, { type: "UPLOAD_FILE" }>;
              return { file: e.file };
            },
            onDone: {
              target: "browsing",
              actions: assign(({ context, event }) => ({
                overlays: [...context.overlays, event.output],
              })),
            },
            onError: {
              target: "browsing",
              actions: assign({
                error: ({ event }) => `Failed to parse file: ${event.error}`,
              }),
            },
          },
        },
      },
    },
  },
});

export type MapMachine = typeof mapMachine;
