import type { AssetStore } from "../types";

/**
 * Migrate all data from one store to another.
 * Exports everything from `source`, then imports into `target`.
 *
 * ```ts
 * import { migrateStore, createSqliteStore } from "@aai-agency/og-components";
 *
 * // Migrate from SQLite → Postgres
 * const sqliteStore = await createSqliteStore();
 * const postgresStore = new MyPostgresAdapter(process.env.DATABASE_URL);
 * await migrateStore(sqliteStore, postgresStore);
 * ```
 */
export const migrateStore = async (source: AssetStore, target: AssetStore): Promise<void> => {
  const data = await source.exportAll();
  await target.importAll(data);
};
