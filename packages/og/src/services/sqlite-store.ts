import type { Asset, AssetQuery, AssetStore, MapOverlay, SavedMapView, StoreExport } from "../types";

/**
 * SQLite-backed asset store using sql.js (browser-compatible).
 * Ships as default persistent store — zero backend required.
 *
 * Usage:
 * ```ts
 * import initSqlJs from "sql.js";
 * import { SqliteStore } from "@aai-og/components/services";
 *
 * const SQL = await initSqlJs();
 * const store = new SqliteStore(new SQL.Database());
 * ```
 */
export class SqliteStore implements AssetStore {
  private db: SqlJsDatabase;

  constructor(db: SqlJsDatabase) {
    this.db = db;
    this.init();
  }

  private init() {
    // ── Assets table ──
    this.db.run(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        lines TEXT,
        polygons TEXT,
        properties TEXT NOT NULL DEFAULT '{}',
        meta TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status)`);

    // ── Overlays table (full MapOverlay fields) ──
    this.db.run(`
      CREATE TABLE IF NOT EXISTS overlays (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        geojson TEXT NOT NULL,
        file_name TEXT,
        style TEXT,
        feature_overrides TEXT,
        version INTEGER DEFAULT 1,
        uploaded_at TEXT,
        image_url TEXT,
        image_bounds TEXT
      )
    `);

    // ── Map views (saved bookmarks) ──
    this.db.run(`
      CREATE TABLE IF NOT EXISTS map_views (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        longitude REAL NOT NULL,
        latitude REAL NOT NULL,
        zoom REAL NOT NULL,
        pitch REAL DEFAULT 0,
        bearing REAL DEFAULT 0,
        color_by TEXT,
        visible_overlay_ids TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )
    `);

    // ── Preferences (key-value) ──
    this.db.run(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // ── Migrate existing overlays table if missing columns ──
    this.migrateOverlaysTable();
  }

  /** Add missing columns to overlays table for existing databases */
  private migrateOverlaysTable() {
    const cols = this.db.exec("PRAGMA table_info(overlays)");
    if (!cols.length) return;
    const existing = new Set(cols[0].values.map((row) => row[1] as string));

    const migrations: [string, string][] = [
      ["feature_overrides", "TEXT"],
      ["version", "INTEGER DEFAULT 1"],
      ["uploaded_at", "TEXT"],
      ["image_url", "TEXT"],
      ["image_bounds", "TEXT"],
    ];

    for (const [col, type] of migrations) {
      if (!existing.has(col)) {
        this.db.run(`ALTER TABLE overlays ADD COLUMN ${col} ${type}`);
      }
    }
  }

  // ── Assets ──────────────────────────────────────────────────────────────────

  async getAssets(query?: AssetQuery): Promise<Asset[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query?.types?.length) {
      conditions.push(`type IN (${query.types.map(() => "?").join(",")})`);
      params.push(...query.types);
    }
    if (query?.statuses?.length) {
      conditions.push(`status IN (${query.statuses.map(() => "?").join(",")})`);
      params.push(...query.statuses);
    }
    if (query?.bounds) {
      const [w, s, e, n] = query.bounds;
      conditions.push("lng >= ? AND lng <= ? AND lat >= ? AND lat <= ?");
      params.push(w, e, s, n);
    }
    if (query?.search) {
      conditions.push("(name LIKE ? OR id LIKE ?)");
      const q = `%${query.search}%`;
      params.push(q, q);
    }

    let sql = "SELECT * FROM assets";
    if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += " ORDER BY name";
    if (query?.limit) {
      sql += ` LIMIT ${query.limit}`;
      if (query?.offset) sql += ` OFFSET ${query.offset}`;
    }

    const results = this.db.exec(sql, params);
    if (!results.length) return [];
    return results[0].values.map((row) => this.rowToAsset(results[0].columns, row));
  }

  async getAsset(id: string): Promise<Asset | null> {
    const results = this.db.exec("SELECT * FROM assets WHERE id = ?", [id]);
    if (!results.length || !results[0].values.length) return null;
    return this.rowToAsset(results[0].columns, results[0].values[0]);
  }

  async createAsset(asset: Asset): Promise<Asset> {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO assets (id, name, type, status, lat, lng, lines, polygons, properties, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset.id, asset.name, asset.type, asset.status,
        asset.coordinates.lat, asset.coordinates.lng,
        asset.lines ? JSON.stringify(asset.lines) : null,
        asset.polygons ? JSON.stringify(asset.polygons) : null,
        JSON.stringify(asset.properties),
        asset.meta ? JSON.stringify(asset.meta) : null,
        asset.createdAt ?? now, asset.updatedAt ?? now,
      ]
    );
    return { ...asset, createdAt: asset.createdAt ?? now, updatedAt: asset.updatedAt ?? now };
  }

  async createAssets(assets: Asset[]): Promise<Asset[]> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO assets (id, name, type, status, lat, lng, lines, polygons, properties, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const asset of assets) {
      stmt.run([
        asset.id, asset.name, asset.type, asset.status,
        asset.coordinates.lat, asset.coordinates.lng,
        asset.lines ? JSON.stringify(asset.lines) : null,
        asset.polygons ? JSON.stringify(asset.polygons) : null,
        JSON.stringify(asset.properties),
        asset.meta ? JSON.stringify(asset.meta) : null,
        asset.createdAt ?? now, asset.updatedAt ?? now,
      ]);
    }
    stmt.free();
    return assets.map((a) => ({ ...a, createdAt: a.createdAt ?? now, updatedAt: a.updatedAt ?? now }));
  }

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset> {
    const existing = await this.getAsset(id);
    if (!existing) throw new Error(`Asset not found: ${id}`);
    const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
    this.db.run(
      `UPDATE assets SET name=?, type=?, status=?, lat=?, lng=?, lines=?, polygons=?, properties=?, meta=?, updated_at=?
       WHERE id=?`,
      [
        updated.name, updated.type, updated.status,
        updated.coordinates.lat, updated.coordinates.lng,
        updated.lines ? JSON.stringify(updated.lines) : null,
        updated.polygons ? JSON.stringify(updated.polygons) : null,
        JSON.stringify(updated.properties),
        updated.meta ? JSON.stringify(updated.meta) : null,
        updated.updatedAt, id,
      ]
    );
    return updated;
  }

  async deleteAsset(id: string): Promise<void> {
    this.db.run("DELETE FROM assets WHERE id = ?", [id]);
  }

  // ── Overlays ────────────────────────────────────────────────────────────────

  async getOverlays(): Promise<MapOverlay[]> {
    const results = this.db.exec("SELECT * FROM overlays");
    if (!results.length) return [];
    return results[0].values.map((row) => this.rowToOverlay(results[0].columns, row));
  }

  async saveOverlay(overlay: MapOverlay): Promise<MapOverlay> {
    this.db.run(
      `INSERT OR REPLACE INTO overlays (id, name, type, visible, geojson, file_name, style, feature_overrides, version, uploaded_at, image_url, image_bounds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        overlay.id,
        overlay.name,
        overlay.type,
        overlay.visible ? 1 : 0,
        JSON.stringify(overlay.geojson),
        overlay.fileName ?? null,
        overlay.style ? JSON.stringify(overlay.style) : null,
        overlay.featureOverrides ? JSON.stringify(overlay.featureOverrides) : null,
        overlay.version ?? 1,
        overlay.uploadedAt ?? null,
        overlay.imageUrl ?? null,
        overlay.imageBounds ? JSON.stringify(overlay.imageBounds) : null,
      ]
    );
    return overlay;
  }

  async deleteOverlay(id: string): Promise<void> {
    this.db.run("DELETE FROM overlays WHERE id = ?", [id]);
  }

  // ── Map Views ───────────────────────────────────────────────────────────────

  async getMapViews(): Promise<SavedMapView[]> {
    const results = this.db.exec("SELECT * FROM map_views ORDER BY created_at DESC");
    if (!results.length) return [];
    return results[0].values.map((row) => {
      const obj = this.rowToObj(results[0].columns, row);
      return {
        id: obj.id as string,
        name: obj.name as string,
        viewState: {
          longitude: obj.longitude as number,
          latitude: obj.latitude as number,
          zoom: obj.zoom as number,
          pitch: (obj.pitch as number) ?? 0,
          bearing: (obj.bearing as number) ?? 0,
        },
        colorBy: (obj.color_by as string) ?? undefined,
        visibleOverlayIds: obj.visible_overlay_ids ? JSON.parse(obj.visible_overlay_ids as string) : undefined,
        createdAt: obj.created_at as string,
        updatedAt: (obj.updated_at as string) ?? undefined,
      };
    });
  }

  async saveMapView(view: SavedMapView): Promise<SavedMapView> {
    this.db.run(
      `INSERT OR REPLACE INTO map_views (id, name, longitude, latitude, zoom, pitch, bearing, color_by, visible_overlay_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        view.id,
        view.name,
        view.viewState.longitude,
        view.viewState.latitude,
        view.viewState.zoom,
        view.viewState.pitch ?? 0,
        view.viewState.bearing ?? 0,
        view.colorBy ?? null,
        view.visibleOverlayIds ? JSON.stringify(view.visibleOverlayIds) : null,
        view.createdAt,
        view.updatedAt ?? null,
      ]
    );
    return view;
  }

  async deleteMapView(id: string): Promise<void> {
    this.db.run("DELETE FROM map_views WHERE id = ?", [id]);
  }

  // ── Preferences ─────────────────────────────────────────────────────────────

  async getPreference<T = unknown>(key: string): Promise<T | null> {
    const results = this.db.exec("SELECT value FROM preferences WHERE key = ?", [key]);
    if (!results.length || !results[0].values.length) return null;
    return JSON.parse(results[0].values[0][0] as string) as T;
  }

  async savePreference(key: string, value: unknown): Promise<void> {
    this.db.run(
      "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)",
      [key, JSON.stringify(value)]
    );
  }

  // ── Migration ───────────────────────────────────────────────────────────────

  async exportAll(): Promise<StoreExport> {
    const [assets, overlays, mapViews] = await Promise.all([
      this.getAssets(),
      this.getOverlays(),
      this.getMapViews(),
    ]);

    // Export all preferences
    const prefResults = this.db.exec("SELECT key, value FROM preferences");
    const preferences: Record<string, unknown> = {};
    if (prefResults.length) {
      for (const row of prefResults[0].values) {
        preferences[row[0] as string] = JSON.parse(row[1] as string);
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      assets,
      overlays,
      mapViews,
      preferences,
    };
  }

  async importAll(data: StoreExport): Promise<void> {
    // Clear existing data
    this.db.run("DELETE FROM assets");
    this.db.run("DELETE FROM overlays");
    this.db.run("DELETE FROM map_views");
    this.db.run("DELETE FROM preferences");

    // Import assets
    if (data.assets.length) await this.createAssets(data.assets);

    // Import overlays
    for (const overlay of data.overlays) await this.saveOverlay(overlay);

    // Import map views
    for (const view of data.mapViews) await this.saveMapView(view);

    // Import preferences
    for (const [key, value] of Object.entries(data.preferences)) {
      await this.savePreference(key, value);
    }
  }

  /** Export the entire database as a Uint8Array (for saving/downloading) */
  exportBinary(): Uint8Array {
    return this.db.export();
  }

  // ── Row mappers ─────────────────────────────────────────────────────────────

  private rowToObj(columns: string[], row: unknown[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => (obj[col] = row[i]));
    return obj;
  }

  private rowToAsset(columns: string[], row: unknown[]): Asset {
    const obj = this.rowToObj(columns, row);
    return {
      id: obj.id as string,
      name: obj.name as string,
      type: obj.type as string,
      status: obj.status as string,
      coordinates: { lat: obj.lat as number, lng: obj.lng as number },
      lines: obj.lines ? JSON.parse(obj.lines as string) : undefined,
      polygons: obj.polygons ? JSON.parse(obj.polygons as string) : undefined,
      properties: JSON.parse((obj.properties as string) || "{}"),
      meta: obj.meta ? JSON.parse(obj.meta as string) : undefined,
      createdAt: obj.created_at as string | undefined,
      updatedAt: obj.updated_at as string | undefined,
    };
  }

  private rowToOverlay(columns: string[], row: unknown[]): MapOverlay {
    const obj = this.rowToObj(columns, row);
    return {
      id: obj.id as string,
      name: obj.name as string,
      type: obj.type as MapOverlay["type"],
      visible: obj.visible === 1,
      geojson: JSON.parse(obj.geojson as string),
      fileName: (obj.file_name as string) ?? undefined,
      style: obj.style ? JSON.parse(obj.style as string) : undefined,
      featureOverrides: obj.feature_overrides ? JSON.parse(obj.feature_overrides as string) : undefined,
      version: (obj.version as number) ?? 1,
      uploadedAt: (obj.uploaded_at as string) ?? undefined,
      imageUrl: (obj.image_url as string) ?? undefined,
      imageBounds: obj.image_bounds ? JSON.parse(obj.image_bounds as string) : undefined,
    };
  }
}

/** Minimal sql.js Database interface — keeps us decoupled from the full sql.js types */
export interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): { columns: string[]; values: unknown[][] }[];
  prepare(sql: string): { run(params?: unknown[]): void; free(): void };
  export(): Uint8Array;
}
