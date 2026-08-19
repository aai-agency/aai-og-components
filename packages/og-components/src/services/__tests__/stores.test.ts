import initSqlJs from "sql.js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Asset, AssetStore, MapOverlay, SavedMapView } from "../../types";
import { LocalStorageStore } from "../localstorage-store";
import { InMemoryStore } from "../memory-store";
import { migrateStore } from "../migrate-store";
import { SqliteStore } from "../sqlite-store";

const asset = (id: string, overrides: Partial<Asset> = {}): Asset => ({
  id,
  name: `Asset ${id}`,
  type: "well",
  status: "producing",
  coordinates: { lat: 48, lng: -103 },
  properties: { operator: "AAI" },
  ...overrides,
});

const overlay: MapOverlay = {
  id: "overlay-1",
  name: "Lease",
  type: "geojson",
  visible: true,
  geojson: { type: "FeatureCollection", features: [] },
};

const view: SavedMapView = {
  id: "view-1",
  name: "Bakken",
  viewState: { longitude: -103, latitude: 48, zoom: 8, pitch: 0, bearing: 0 },
  createdAt: "2026-08-18T00:00:00.000Z",
};

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const verifySharedContract = (name: string, createStore: () => Promise<AssetStore>) => {
  describe(name, () => {
    it("supports asset CRUD and combined queries", async () => {
      const store = await createStore();
      await store.createAssets([
        asset("north", { name: "North Well", coordinates: { lat: 48, lng: -103 } }),
        asset("south", { name: "South Meter", type: "meter", status: "inactive", coordinates: { lat: 30, lng: -95 } }),
      ]);

      expect(await store.getAssets({ types: ["well"], statuses: ["producing"], search: "north" })).toHaveLength(1);
      expect(await store.getAssets({ bounds: [-104, 47, -102, 49] })).toHaveLength(1);
      expect((await store.updateAsset("north", { name: "Renamed" })).name).toBe("Renamed");
      await store.deleteAsset("north");
      expect(await store.getAsset("north")).toBeNull();
      await expect(store.updateAsset("missing", { name: "Nope" })).rejects.toThrow("Asset not found");
    });

    it("persists overlays, views, preferences, and portable snapshots", async () => {
      const store = await createStore();
      await store.createAsset(asset("one"));
      await store.saveOverlay(overlay);
      await store.saveMapView(view);
      await store.savePreference("theme", { mode: "dark" });

      const snapshot = await store.exportAll();
      expect(snapshot.assets).toHaveLength(1);
      expect(snapshot.overlays).toEqual([expect.objectContaining({ id: overlay.id })]);
      expect(snapshot.mapViews).toEqual([expect.objectContaining({ id: view.id })]);
      expect(snapshot.preferences).toEqual({ theme: { mode: "dark" } });

      await store.deleteOverlay(overlay.id);
      await store.deleteMapView(view.id);
      expect(await store.getOverlays()).toEqual([]);
      expect(await store.getMapViews()).toEqual([]);
    });
  });
};

verifySharedContract("InMemoryStore", async () => new InMemoryStore());

describe("LocalStorageStore", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("uses isolated prefixes and recovers safely from malformed data", async () => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    const first = new LocalStorageStore("first");
    const second = new LocalStorageStore("second");

    await first.createAsset(asset("one"));
    expect(await second.getAssets()).toEqual([]);
    storage.setItem("first:assets", "not-json");
    expect(await first.getAssets()).toEqual([]);
  });

  it("round-trips the shared snapshot and clears only its namespace", async () => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    storage.setItem("unrelated", "keep");
    const source = new InMemoryStore([asset("one")]);
    await source.saveOverlay(overlay);
    await source.saveMapView(view);
    await source.savePreference("density", "compact");
    const target = new LocalStorageStore("target");

    await migrateStore(source, target);
    expect(await target.getAsset("one")).toEqual(asset("one"));
    expect(await target.getPreference("density")).toBe("compact");
    target.clear();
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});

describe("SqliteStore", () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  it("implements the shared contract and exports a portable database", async () => {
    const store = new SqliteStore(new SQL.Database());
    await store.createAssets([asset("north"), asset("south", { type: "meter", status: "inactive" })]);
    await store.saveOverlay(overlay);
    await store.saveMapView(view);
    await store.savePreference("theme", "dark");

    expect(await store.getAssets({ types: ["well"] })).toHaveLength(1);
    expect((await store.updateAsset("north", { name: "Renamed" })).name).toBe("Renamed");
    expect(await store.getPreference("theme")).toBe("dark");
    expect(store.exportBinary()).toBeInstanceOf(Uint8Array);

    const migrated = new InMemoryStore();
    await migrateStore(store, migrated);
    expect((await migrated.exportAll()).assets).toHaveLength(2);
    expect(await migrated.getOverlays()).toEqual([expect.objectContaining({ id: overlay.id })]);
  });
});
