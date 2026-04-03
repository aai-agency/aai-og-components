import type { Asset, AssetQuery, AssetStore, MapOverlay, SavedMapView, StoreExport } from "../types";

/**
 * In-memory asset store — no persistence, zero dependencies.
 * Perfect for demos, prototypes, or when you manage data externally.
 */
export class InMemoryStore implements AssetStore {
  private assets = new Map<string, Asset>();
  private overlays = new Map<string, MapOverlay>();
  private mapViews = new Map<string, SavedMapView>();
  private prefs = new Map<string, unknown>();

  constructor(initialAssets?: Asset[]) {
    if (initialAssets) {
      for (const a of initialAssets) this.assets.set(a.id, a);
    }
  }

  // ── Assets ──

  async getAssets(query?: AssetQuery): Promise<Asset[]> {
    let results = Array.from(this.assets.values());

    if (query?.types?.length) {
      const types = new Set(query.types);
      results = results.filter((a) => types.has(a.type));
    }
    if (query?.statuses?.length) {
      const statuses = new Set(query.statuses);
      results = results.filter((a) => statuses.has(a.status));
    }
    if (query?.bounds) {
      const [w, s, e, n] = query.bounds;
      results = results.filter(
        (a) => a.coordinates.lng >= w && a.coordinates.lng <= e && a.coordinates.lat >= s && a.coordinates.lat <= n,
      );
    }
    if (query?.search) {
      const q = query.search.toLowerCase();
      results = results.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
    }
    if (query?.offset) {
      results = results.slice(query.offset);
    }
    if (query?.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getAsset(id: string): Promise<Asset | null> {
    return this.assets.get(id) ?? null;
  }

  async createAsset(asset: Asset): Promise<Asset> {
    this.assets.set(asset.id, asset);
    return asset;
  }

  async createAssets(assets: Asset[]): Promise<Asset[]> {
    for (const a of assets) this.assets.set(a.id, a);
    return assets;
  }

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset> {
    const existing = this.assets.get(id);
    if (!existing) throw new Error(`Asset not found: ${id}`);
    const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
    this.assets.set(id, updated);
    return updated;
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets.delete(id);
  }

  // ── Overlays ──

  async getOverlays(): Promise<MapOverlay[]> {
    return Array.from(this.overlays.values());
  }

  async saveOverlay(overlay: MapOverlay): Promise<MapOverlay> {
    this.overlays.set(overlay.id, overlay);
    return overlay;
  }

  async deleteOverlay(id: string): Promise<void> {
    this.overlays.delete(id);
  }

  // ── Map Views ──

  async getMapViews(): Promise<SavedMapView[]> {
    return Array.from(this.mapViews.values());
  }

  async saveMapView(view: SavedMapView): Promise<SavedMapView> {
    this.mapViews.set(view.id, view);
    return view;
  }

  async deleteMapView(id: string): Promise<void> {
    this.mapViews.delete(id);
  }

  // ── Preferences ──

  async getPreference<T = unknown>(key: string): Promise<T | null> {
    return (this.prefs.get(key) as T) ?? null;
  }

  async savePreference(key: string, value: unknown): Promise<void> {
    this.prefs.set(key, value);
  }

  // ── Migration ──

  async exportAll(): Promise<StoreExport> {
    const preferences: Record<string, unknown> = {};
    for (const [k, v] of this.prefs) preferences[k] = v;

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      assets: Array.from(this.assets.values()),
      overlays: Array.from(this.overlays.values()),
      mapViews: Array.from(this.mapViews.values()),
      preferences,
    };
  }

  async importAll(data: StoreExport): Promise<void> {
    this.assets.clear();
    this.overlays.clear();
    this.mapViews.clear();
    this.prefs.clear();

    for (const a of data.assets) this.assets.set(a.id, a);
    for (const o of data.overlays) this.overlays.set(o.id, o);
    for (const v of data.mapViews) this.mapViews.set(v.id, v);
    for (const [k, v] of Object.entries(data.preferences)) this.prefs.set(k, v);
  }
}
