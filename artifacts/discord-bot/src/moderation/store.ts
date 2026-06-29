import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db.js";
import { censorGuildConfigTable, censorUserFlagsTable } from "@workspace/db/schema";

export interface GuildCensorConfig {
  enabled: boolean;
  modLogChannelId: string | null;
}

export interface UserFlagRecord {
  count: number;
  lastFlag: string;
  totalLifetime: number;
}

// ── In-memory cache for guild config (read on every message) ────────────────
const configCache = new Map<string, GuildCensorConfig>();

export async function getCensorConfig(guildId: string): Promise<GuildCensorConfig> {
  if (configCache.has(guildId)) return configCache.get(guildId)!;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(censorGuildConfigTable)
      .where(eq(censorGuildConfigTable.guildId, guildId))
      .limit(1);
    const cfg: GuildCensorConfig = rows[0]
      ? { enabled: rows[0].enabled, modLogChannelId: rows[0].modLogChannelId ?? null }
      : { enabled: false, modLogChannelId: null };
    configCache.set(guildId, cfg);
    return cfg;
  } catch { return { enabled: false, modLogChannelId: null }; }
}

export async function setCensorConfig(guildId: string, patch: Partial<GuildCensorConfig>): Promise<void> {
  const current = await getCensorConfig(guildId);
  const updated = { ...current, ...patch };
  configCache.set(guildId, updated);
  const db = getDb();
  await db
    .insert(censorGuildConfigTable)
    .values({ guildId, ...updated })
    .onConflictDoUpdate({
      target: censorGuildConfigTable.guildId,
      set: { enabled: updated.enabled, modLogChannelId: updated.modLogChannelId },
    });
}

export async function isCensorEnabled(guildId: string): Promise<boolean> {
  return (await getCensorConfig(guildId)).enabled;
}

// ── User flags ────────────────────────────────────────────────────────────────

export async function getUserFlags(guildId: string, userId: string): Promise<UserFlagRecord> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(censorUserFlagsTable)
      .where(and(
        eq(censorUserFlagsTable.guildId, guildId),
        eq(censorUserFlagsTable.userId, userId),
      ))
      .limit(1);
    return rows[0]
      ? { count: rows[0].count, lastFlag: rows[0].lastFlag, totalLifetime: rows[0].totalLifetime }
      : { count: 0, lastFlag: new Date().toISOString(), totalLifetime: 0 };
  } catch { return { count: 0, lastFlag: new Date().toISOString(), totalLifetime: 0 }; }
}

export async function incrementFlag(guildId: string, userId: string): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db
    .insert(censorUserFlagsTable)
    .values({ guildId, userId, count: 1, lastFlag: now, totalLifetime: 1 })
    .onConflictDoUpdate({
      target: [censorUserFlagsTable.guildId, censorUserFlagsTable.userId],
      set: {
        count:         sql`${censorUserFlagsTable.count} + 1`,
        totalLifetime: sql`${censorUserFlagsTable.totalLifetime} + 1`,
        lastFlag:      now,
      },
    })
    .returning({ count: censorUserFlagsTable.count });
  return rows[0]?.count ?? 1;
}

export async function resetFlags(guildId: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(censorUserFlagsTable)
    .set({ count: 0 })
    .where(and(
      eq(censorUserFlagsTable.guildId, guildId),
      eq(censorUserFlagsTable.userId, userId),
    ));
}
