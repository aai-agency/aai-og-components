import type { Asset, AssetQuery, AssetStore, MapOverlay } from "../types";

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

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS overlays (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        geojson TEXT NOT NULL,
        file_name TEXT,
        style TEXT
      )
    `);
  }

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
        asset.id,
        asset.name,
        asset.type,
        asset.status,
        asset.coordinates.lat,
        asset.coordinates.lng,
        asset.lines ? JSON.stringify(asset.lines) : null,
        asset.polygons ? JSON.stringify(asset.polygons) : null,
        JSON.stringify(asset.properties),
        asset.meta ? JSON.stringify(asset.meta) : null,
        asset.createdAt ?? now,
        asset.updatedAt ?? now,
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
        asset.id,
        asset.name,
        asset.type,
        asset.status,
        asset.coordinates.lat,
        asset.coordinates.lng,
        asset.lines ? JSON.stringify(asset.lines) : null,
        asset.polygons ? JSON.stringify(asset.polygons) : null,
        JSON.stringify(asset.properties),
        asset.meta ? JSON.stringify(asset.meta) : null,
        asset.createdAt ?? now,
        asset.updatedAt ?? now,
      ]);
    }
    stmt.free();

    return assets.map((a) => ({
      ...a,
      createdAt: a.createdAt ?? now,
      updatedAt: a.updatedAt ?? now,
    }));
  }

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset> {
    const existing = await this.getAsset(id);
    if (!existing) throw new Error(`Asset not found: ${id}`);

    const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
    this.db.run(
      `UPDATE assets SET name=?, type=?, status=?, lat=?, lng=?, lines=?, polygons=?, properties=?, meta=?, updated_at=?
       WHERE id=?`,
      [
        updated.name,
        updated.type,
        updated.status,
        updated.coordinates.lat,
        updated.coordinates.lng,
        updated.lines ? JSON.stringify(updated.lines) : null,
        updated.polygons ? JSON.stringify(updated.polygons) : null,
        JSON.stringify(updated.properties),
        updated.meta ? JSON.stringify(updated.meta) : null,
        updated.updatedAt,
        id,
      ]
    );
    return updated;
  }

  async deleteAsset(id: string): Promise<void> {
    this.db.run("DELETE FROM assets WHERE id = ?", [id]);
  }

  async getOverlays(): Promise<MapOverlay[]> {
    const results = this.db.exec("SELECT * FROM overlays");
    if (!results.length) return [];
    return results[0].values.map((row) => this.rowToOverlay(results[0].columns, row));
  }

  async saveOverlay(overlay: MapOverlay): Promise<MapOverlay> {
    this.db.run(
      `INSERT OR REPLACE INTO overlays (id, name, type, visible, geojson, file_name, style)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        overlay.id,
        overlay.name,
        overlay.type,
        overlay.visible ? 1 : 0,
        JSON.stringify(overlay.geojson),
        overlay.fileName ?? null,
        overlay.style ? JSON.stringify(overlay.style) : null,
      ]
    );
    return overlay;
  }

  async deleteOverlay(id: string): Promise<void> {
    this.db.run("DELETE FROM overlays WHERE id = ?", [id]);
  }

  /** Export the entire database as a Uint8Array (for saving/downloading) */
  export(): Uint8Array {
    return this.db.export();
  }

  private rowToAsset(columns: string[], row: unknown[]): Asset {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => (obj[col] = row[i]));

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
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => (obj[col] = row[i]));

    return {
      id: obj.id as string,
      name: obj.name as string,
      type: obj.type as "kmz" | "kml" | "geojson" | "custom",
      visible: obj.visible === 1,
      geojson: JSON.parse(obj.geojson as string),
      fileName: obj.file_name as string | undefined,
      style: obj.style ? JSON.parse(obj.style as string) : undefined,
    };
  }
}

/** Minimal sql.js Database interface — keeps us decoupled from the full sql.js types */
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): { columns: string[]; values: unknown[][] }[];
  prepare(sql: string): { run(params?: unknown[]): void; free(): void };
  export(): Uint8Array;
}
