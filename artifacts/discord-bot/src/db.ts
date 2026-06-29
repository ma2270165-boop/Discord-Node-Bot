import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { getPool } from "./persistence.js";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;
let _db: DrizzleDb | null = null;

export function getDb(): DrizzleDb {
  if (!_db) _db = drizzle(getPool(), { schema });
  return _db;
}
