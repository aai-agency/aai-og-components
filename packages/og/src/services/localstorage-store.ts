import type { Asset, AssetQuery, AssetStore, MapOverlay } from "../types";

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

  private get assetsKey() {
    return `${this.prefix}:assets`;
  }

  private get overlaysKey() {
    return `${this.prefix}:overlays`;
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
      // localStorage might be full — warn but don't crash
      console.warn(`[LocalStorageStore] Failed to write "${key}":`, e);
    }
  }

  // ── Asset methods ──

  private loadAssets(): Asset[] {
    return this.readJSON<Asset[]>(this.assetsKey, []);
  }

  private saveAssets(assets: Asset[]): void {
    this.writeJSON(this.assetsKey, assets);
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
    return this.readJSON<MapOverlay[]>(this.overlaysKey, []);
  }

  private saveOverlays(overlays: MapOverlay[]): void {
    this.writeJSON(this.overlaysKey, overlays);
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

  // ── Utility ──

  /** Clear all data for this store prefix */
  clear(): void {
    try {
      localStorage.removeItem(this.assetsKey);
      localStorage.removeItem(this.overlaysKey);
    } catch {
      // noop
    }
  }
}
