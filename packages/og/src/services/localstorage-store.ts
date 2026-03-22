import type { Asset, AssetQuery, AssetStore, MapOverlay, SavedMapView, StoreExport } from "../types";

const DEFAULT_PREFIX = "og-map";

/**
 * Browser localStorage-backed asset store.
 * Persists assets and overlays across page refreshes with zero backend.
 * Falls back gracefully when localStorage is full or unavailable.
 */
export class LocalStorageStore implements AssetStore {
  private prefix: string;

  constructor(prefix = DEFAULT_PREFIX) {
    this.prefix = prefix;
  }

  // ── Keys ──

  private key(name: string) {
    return `${this.prefix}:${name}`;
  }

  // ── Helpers ──

  private readJSON<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private writeJSON(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[LocalStorageStore] Failed to write "${key}":`, e);
    }
  }

  // ── Asset methods ──

  private loadAssets(): Asset[] {
    return this.readJSON<Asset[]>(this.key("assets"), []);
  }

  private saveAssets(assets: Asset[]): void {
    this.writeJSON(this.key("assets"), assets);
  }

  async getAssets(query?: AssetQuery): Promise<Asset[]> {
    let results = this.loadAssets();

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
        (a) =>
          a.coordinates.lng >= w &&
          a.coordinates.lng <= e &&
          a.coordinates.lat >= s &&
          a.coordinates.lat <= n
      );
    }
    if (query?.search) {
      const q = query.search.toLowerCase();
      results = results.filter(
        (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
      );
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
    const assets = this.loadAssets();
    return assets.find((a) => a.id === id) ?? null;
  }

  async createAsset(asset: Asset): Promise<Asset> {
    const assets = this.loadAssets();
    assets.push(asset);
    this.saveAssets(assets);
    return asset;
  }

  async createAssets(newAssets: Asset[]): Promise<Asset[]> {
    const assets = this.loadAssets();
    assets.push(...newAssets);
    this.saveAssets(assets);
    return newAssets;
  }

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset> {
    const assets = this.loadAssets();
    const idx = assets.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error(`Asset not found: ${id}`);
    const updated = { ...assets[idx], ...data, id, updatedAt: new Date().toISOString() };
    assets[idx] = updated;
    this.saveAssets(assets);
    return updated;
  }

  async deleteAsset(id: string): Promise<void> {
    const assets = this.loadAssets().filter((a) => a.id !== id);
    this.saveAssets(assets);
  }

  // ── Overlay methods ──

  private loadOverlays(): MapOverlay[] {
    return this.readJSON<MapOverlay[]>(this.key("overlays"), []);
  }

  private saveOverlays(overlays: MapOverlay[]): void {
    this.writeJSON(this.key("overlays"), overlays);
  }

  async getOverlays(): Promise<MapOverlay[]> {
    return this.loadOverlays();
  }

  async saveOverlay(overlay: MapOverlay): Promise<MapOverlay> {
    const overlays = this.loadOverlays();
    const idx = overlays.findIndex((o) => o.id === overlay.id);
    if (idx >= 0) {
      overlays[idx] = overlay;
    } else {
      overlays.push(overlay);
    }
    this.saveOverlays(overlays);
    return overlay;
  }

  async deleteOverlay(id: string): Promise<void> {
    const overlays = this.loadOverlays().filter((o) => o.id !== id);
    this.saveOverlays(overlays);
  }

  // ── Map Views ──

  private loadMapViews(): SavedMapView[] {
    return this.readJSON<SavedMapView[]>(this.key("map-views"), []);
  }

  private saveMapViews(views: SavedMapView[]): void {
    this.writeJSON(this.key("map-views"), views);
  }

  async getMapViews(): Promise<SavedMapView[]> {
    return this.loadMapViews();
  }

  async saveMapView(view: SavedMapView): Promise<SavedMapView> {
    const views = this.loadMapViews();
    const idx = views.findIndex((v) => v.id === view.id);
    if (idx >= 0) {
      views[idx] = view;
    } else {
      views.push(view);
    }
    this.saveMapViews(views);
    return view;
  }

  async deleteMapView(id: string): Promise<void> {
    const views = this.loadMapViews().filter((v) => v.id !== id);
    this.saveMapViews(views);
  }

  // ── Preferences ──

  async getPreference<T = unknown>(key: string): Promise<T | null> {
    return this.readJSON<T | null>(this.key(`pref:${key}`), null);
  }

  async savePreference(key: string, value: unknown): Promise<void> {
    this.writeJSON(this.key(`pref:${key}`), value);
  }

  // ── Migration ──

  async exportAll(): Promise<StoreExport> {
    // Collect all preferences by scanning localStorage keys
    const preferences: Record<string, unknown> = {};
    const prefPrefix = this.key("pref:");
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i);
      if (lsKey?.startsWith(prefPrefix)) {
        const prefKey = lsKey.slice(prefPrefix.length);
        preferences[prefKey] = this.readJSON(lsKey, null);
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      assets: this.loadAssets(),
      overlays: this.loadOverlays(),
      mapViews: this.loadMapViews(),
      preferences,
    };
  }

  async importAll(data: StoreExport): Promise<void> {
    this.clear();
    this.saveAssets(data.assets);
    this.saveOverlays(data.overlays);
    this.saveMapViews(data.mapViews);
    for (const [key, value] of Object.entries(data.preferences)) {
      await this.savePreference(key, value);
    }
  }

  // ── Utility ──

  /** Clear all data for this store prefix */
  clear(): void {
    try {
      // Remove all keys with our prefix
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix + ":")) keysToRemove.push(key);
      }
      for (const key of keysToRemove) localStorage.removeItem(key);
    } catch {
      // noop
    }
  }
}
