import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { lowoGuildSettingsTable } from "@workspace/db/schema";

const cache = new Map<string, boolean>();

export async function isDynamic(guildId: string | null): Promise<boolean> {
  if (!guildId) return false;
  if (cache.has(guildId)) return cache.get(guildId)!;
  try {
    const db = getDb();
    const rows = await db
      .select({ dynamicMode: lowoGuildSettingsTable.dynamicMode })
      .from(lowoGuildSettingsTable)
      .where(eq(lowoGuildSettingsTable.guildId, guildId))
      .limit(1);
    const val = rows[0]?.dynamicMode ?? false;
    cache.set(guildId, val);
    return val;
  } catch { return false; }
}

export async function setDynamic(guildId: string, on: boolean): Promise<void> {
  cache.set(guildId, on);
  const db = getDb();
  await db
    .insert(lowoGuildSettingsTable)
    .values({ guildId, dynamicMode: on })
    .onConflictDoUpdate({
      target: lowoGuildSettingsTable.guildId,
      set: { dynamicMode: on },
    });
}
