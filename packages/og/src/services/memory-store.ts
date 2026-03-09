import type { Asset, AssetQuery, AssetStore, MapOverlay } from "../types";

/**
 * In-memory asset store — no persistence, zero dependencies.
 * Perfect for demos, prototypes, or when you manage data externally.
 */
export class InMemoryStore implements AssetStore {
  private assets = new Map<string, Asset>();
  private overlays = new Map<string, MapOverlay>();

  constructor(initialAssets?: Asset[]) {
    if (initialAssets) {
      for (const a of initialAssets) this.assets.set(a.id, a);
    }
  }

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
}
