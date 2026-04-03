import { assign, fromPromise, setup } from "xstate";
import type { Asset, AssetStore, AssetTypeConfig, ColorScheme, MapOverlay, MapViewState, OverlayStyle } from "../types";
import { fitBounds } from "../utils";

// ── Context ──────────────────────────────────────────────────────────────────

/** Overlay feature selected via lasso */
export interface LassoOverlayFeature {
  overlayId: string;
  overlayName: string;
  featureIndex: number;
  properties: Record<string, unknown>;
  geometryType: string;
}

export interface MapContext {
  /** All assets currently loaded */
  assets: Asset[];
  /** Visible (filtered) asset indices */
  visibleIndices: number[];
  /** Per-type display configuration */
  typeConfigs: Map<string, AssetTypeConfig>;
  /** Currently selected asset(s) */
  selectedIds: Set<string>;
  /** Whether the selection summary panel should be shown */
  showSelectionSummary: boolean;
  /** Overlay features selected via lasso */
  lassoOverlayFeatures: LassoOverlayFeature[];
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
  | { type: "LASSO_SELECT"; ids: string[]; overlayFeatures: LassoOverlayFeature[]; additive?: boolean }
  | { type: "LASSO_CLEAR" }
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
  | { type: "RENAME_OVERLAY"; id: string; name: string }
  | { type: "UPDATE_OVERLAY_STYLE"; id: string; style: Partial<MapOverlay["style"]> }
  | {
      type: "UPDATE_FEATURE_OVERRIDE";
      id: string;
      featureIndex: number;
      visible?: boolean;
      style?: Partial<OverlayStyle>;
    }
  | { type: "REUPLOAD_OVERLAY"; id: string; file: File }
  | { type: "UPLOAD_FILE"; file: File; files?: File[] }
  | { type: "FILE_PARSED"; overlay: MapOverlay }
  | { type: "ERROR"; message: string }
  | { type: "CLICK_CLUSTER"; longitude: number; latitude: number; expansionZoom: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

const computeVisibleIndices = (ctx: MapContext): number[] => {
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
};

const US_CENTER_VIEW: MapViewState = { longitude: -98.5, latitude: 39.8, zoom: 4 };

const fitBoundsFromAssets = (assets: Asset[]): MapViewState => {
  if (assets.length === 0) return US_CENTER_VIEW;
  return fitBounds(assets);
};

// ── Side-effect helpers ──────────────────────────────────────────────────────

/** Swallow promise rejection with a console warning */
const logStoreError = (err: unknown) => {
  console.warn("[og-map] store operation failed:", err);
};

/** Fire-and-forget delete overlay from store */
const removeOverlayFromStore = (store: AssetStore | null, id: string) => {
  if (!store) return;
  store.deleteOverlay(id).catch(logStoreError);
};

// ── Actors (async services) ──────────────────────────────────────────────────

const loadFromStore = fromPromise<{ assets: Asset[]; overlays: MapOverlay[] }, { store: AssetStore }>(
  async ({ input }) => {
    const [assets, overlays] = await Promise.all([input.store.getAssets(), input.store.getOverlays()]);
    return { assets, overlays };
  },
);

const parseOverlayFile = fromPromise<MapOverlay, { file: File; files?: File[]; existingId?: string }>(
  async ({ input }) => {
    const { parseKMZ, parseKML, parseGeoJSONFile, parseShapefile, parseShapefileBundle, isShapefileBundle } =
      await import("../utils/overlay-parsers");
    const name = input.file.name.toLowerCase();

    // Check if multiple files were selected (loose shapefile components)
    if (input.files && input.files.length > 1 && isShapefileBundle(input.files)) {
      const overlay = await parseShapefileBundle(input.files);
      if (input.existingId) overlay.id = input.existingId;
      return overlay;
    }

    let overlay: MapOverlay;
    if (name.endsWith(".kmz")) {
      overlay = await parseKMZ(input.file);
    } else if (name.endsWith(".kml")) {
      overlay = await parseKML(input.file);
    } else if (name.endsWith(".geojson") || name.endsWith(".json")) {
      overlay = await parseGeoJSONFile(input.file);
    } else if (name.endsWith(".zip") || name.endsWith(".shp")) {
      overlay = await parseShapefile(input.file);
    } else {
      throw new Error(`Unsupported file type: ${name}`);
    }

    // If re-uploading, preserve the existing ID for versioning
    if (input.existingId) {
      overlay.id = input.existingId;
    }

    return overlay;
  },
);

// persistOverlay, loadOverlaysFromStore, deleteOverlayFromStore are now handled
// inline in assign actions via fire-and-forget calls to context.store.

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
  },
}).createMachine({
  id: "ogMap",
  initial: "idle",
  context: ({ input }) => ({
    assets: input.assets ?? [],
    visibleIndices: [] as number[],
    typeConfigs: input.typeConfigs ?? new Map<string, AssetTypeConfig>(),
    selectedIds: new Set<string>(),
    showSelectionSummary: false,
    lassoOverlayFeatures: [] as LassoOverlayFeature[],
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
          actions: assign(({ context, event }) => {
            const assets = event.assets;
            // Preserve explicit initialViewState; only auto-fit if using default
            const isDefaultView = context.viewState.longitude === -98.5 && context.viewState.latitude === 39.8;
            const ctx: Partial<MapContext> = {
              assets,
              viewState: isDefaultView ? fitBoundsFromAssets(assets) : context.viewState,
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
        input: ({ context }) => {
          if (!context.store) throw new Error("store is required for loading");
          return { store: context.store };
        },
        onDone: {
          target: "ready",
          actions: assign(({ event }) => {
            const { assets, overlays } = event.output;
            return {
              assets,
              overlays,
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
            return { selectedIds, showSelectionSummary: false };
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
          actions: assign({
            selectedIds: () => new Set<string>(),
            showSelectionSummary: false,
            lassoOverlayFeatures: [],
          }),
        },
        LASSO_SELECT: {
          actions: assign(({ context, event }) => {
            const newIds = event.additive ? new Set([...context.selectedIds, ...event.ids]) : new Set(event.ids);
            const overlayFeatures = event.additive
              ? [...context.lassoOverlayFeatures, ...event.overlayFeatures]
              : event.overlayFeatures;
            return {
              selectedIds: newIds,
              lassoOverlayFeatures: overlayFeatures,
              showSelectionSummary: newIds.size > 0 || overlayFeatures.length > 0,
            };
          }),
        },
        LASSO_CLEAR: {
          actions: assign({
            selectedIds: () => new Set<string>(),
            showSelectionSummary: false,
            lassoOverlayFeatures: [],
          }),
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

        // ── Overlays (auto-persist to store) ──
        ADD_OVERLAY: {
          actions: assign(({ context, event }) => {
            const overlays = [...context.overlays, event.overlay];
            if (context.store) context.store.saveOverlay(event.overlay).catch(logStoreError);
            return { overlays };
          }),
        },
        REMOVE_OVERLAY: {
          actions: assign(({ context, event }) => {
            removeOverlayFromStore(context.store, event.id);
            return { overlays: context.overlays.filter((o) => o.id !== event.id) };
          }),
        },
        TOGGLE_OVERLAY: {
          actions: assign(({ context, event }) => {
            const overlays = context.overlays.map((o) => (o.id === event.id ? { ...o, visible: !o.visible } : o));
            const updated = overlays.find((o) => o.id === event.id);
            if (updated && context.store) context.store.saveOverlay(updated).catch(logStoreError);
            return { overlays };
          }),
        },
        RENAME_OVERLAY: {
          actions: assign(({ context, event }) => {
            const overlays = context.overlays.map((o) => (o.id === event.id ? { ...o, name: event.name } : o));
            const updated = overlays.find((o) => o.id === event.id);
            if (updated && context.store) context.store.saveOverlay(updated).catch(logStoreError);
            return { overlays };
          }),
        },
        UPDATE_OVERLAY_STYLE: {
          actions: assign(({ context, event }) => {
            const overlays = context.overlays.map((o) =>
              o.id === event.id ? { ...o, style: { ...o.style, ...event.style } } : o,
            );
            const updated = overlays.find((o) => o.id === event.id);
            if (updated && context.store) context.store.saveOverlay(updated).catch(logStoreError);
            return { overlays };
          }),
        },
        UPDATE_FEATURE_OVERRIDE: {
          actions: assign(({ context, event }) => {
            const overlays = context.overlays.map((o) => {
              if (o.id !== event.id) return o;
              const overrides = [...(o.featureOverrides ?? [])];
              const idx = overrides.findIndex((f) => f.featureIndex === event.featureIndex);
              const update = {
                featureIndex: event.featureIndex,
                ...(event.visible !== undefined ? { visible: event.visible } : {}),
                ...(event.style ? { style: { ...(idx >= 0 ? overrides[idx].style : {}), ...event.style } } : {}),
              };
              if (idx >= 0) {
                overrides[idx] = { ...overrides[idx], ...update };
              } else {
                overrides.push(update);
              }
              return { ...o, featureOverrides: overrides };
            });
            const updated = overlays.find((o) => o.id === event.id);
            if (updated && context.store) context.store.saveOverlay(updated).catch(logStoreError);
            return { overlays };
          }),
        },
        REUPLOAD_OVERLAY: {
          target: ".reuploading",
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
              return { file: e.file, files: e.files };
            },
            onDone: {
              target: "browsing",
              actions: assign(({ context, event }) => {
                // Check if an overlay with the same fileName already exists (versioning)
                const existing = context.overlays.find((o) => o.fileName === event.output.fileName);
                let overlays: MapOverlay[];
                if (existing) {
                  overlays = context.overlays.map((o) =>
                    o.id === existing.id
                      ? {
                          ...event.output,
                          id: existing.id,
                          name: existing.name,
                          style: existing.style,
                          featureOverrides: existing.featureOverrides,
                          version: (existing.version ?? 1) + 1,
                          uploadedAt: new Date().toISOString(),
                        }
                      : o,
                  );
                } else {
                  overlays = [...context.overlays, event.output];
                }
                // Auto-persist new/updated overlay
                const savedOverlay = existing
                  ? (overlays.find((o) => o.id === existing.id) ?? event.output)
                  : event.output;
                if (context.store) context.store.saveOverlay(savedOverlay).catch(logStoreError);
                return { overlays };
              }),
            },
            onError: {
              target: "browsing",
              actions: assign({
                error: ({ event }) => `Failed to parse file: ${event.error}`,
              }),
            },
          },
        },
        reuploading: {
          invoke: {
            src: "parseOverlayFile",
            input: ({ event }) => {
              const e = event as Extract<MapEvent, { type: "REUPLOAD_OVERLAY" }>;
              return { file: e.file, existingId: e.id };
            },
            onDone: {
              target: "browsing",
              actions: assign(({ context, event }) => {
                const newOverlay = event.output;
                const existing = context.overlays.find((o) => o.id === newOverlay.id);
                const overlays = context.overlays.map((o) =>
                  o.id === newOverlay.id
                    ? {
                        ...newOverlay,
                        name: existing?.name ?? newOverlay.name,
                        style: existing?.style,
                        version: (existing?.version ?? 1) + 1,
                        uploadedAt: new Date().toISOString(),
                      }
                    : o,
                );
                const savedOverlay = overlays.find((o) => o.id === newOverlay.id);
                if (savedOverlay && context.store) context.store.saveOverlay(savedOverlay).catch(logStoreError);
                return { overlays };
              }),
            },
            onError: {
              target: "browsing",
              actions: assign({
                error: ({ event }) => `Failed to re-upload: ${event.error}`,
              }),
            },
          },
        },
      },
    },
  },
});

export type MapMachine = typeof mapMachine;
