import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import {
  antiNukeConfigTable,
  antiNukeWhitelistTable,
} from "@workspace/db/schema";

export type ActionType =
  | "channelDelete"
  | "roleDelete"
  | "ban"
  | "kick"
  | "guildUpdate"
  | "webhookCreate"
  | "emojiDelete";

export interface AntiNukeConfig {
  enabled: boolean;
  logChannelId: string | null;
  logPingIds: string[];
  thresholds: Record<ActionType, { count: number; window: number }>;
}

export const DEFAULT_THRESHOLDS: AntiNukeConfig["thresholds"] = {
  channelDelete: { count: 3, window: 20_000 },
  roleDelete:    { count: 3, window: 20_000 },
  ban:           { count: 5, window: 20_000 },
  kick:          { count: 5, window: 20_000 },
  guildUpdate:   { count: 2, window: 20_000 },
  webhookCreate: { count: 5, window: 20_000 },
  emojiDelete:   { count: 5, window: 20_000 },
};

// ── In-memory sliding window ───────────────────────────────────────────────
// guildId → executorId → actionType → timestamps[]
const actionMap = new Map<string, Map<string, Map<ActionType, number[]>>>();

// ── In-memory caches (config rarely changes; avoid a DB round-trip per event) ──
const whitelistCache = new Map<string, Set<string>>();
const configCache    = new Map<string, AntiNukeConfig>();

export function recordAction(
  guildId: string,
  executorId: string,
  action: ActionType,
  config: AntiNukeConfig,
): boolean {
  const { count, window } = config.thresholds[action];
  const now    = Date.now();
  const cutoff = now - window;

  if (!actionMap.has(guildId)) actionMap.set(guildId, new Map());
  const byGuild = actionMap.get(guildId)!;
  if (!byGuild.has(executorId)) byGuild.set(executorId, new Map());
  const byUser = byGuild.get(executorId)!;
  if (!byUser.has(action)) byUser.set(action, []);
  const timestamps = byUser.get(action)!;

  const fresh = timestamps.filter(t => t > cutoff);
  fresh.push(now);
  byUser.set(action, fresh);
  return fresh.length >= count;
}

export function clearActions(guildId: string, executorId: string): void {
  actionMap.get(guildId)?.delete(executorId);
}

// ── Whitelist ──────────────────────────────────────────────────────────────
export async function getWhitelist(guildId: string): Promise<Set<string>> {
  if (whitelistCache.has(guildId)) return whitelistCache.get(guildId)!;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(antiNukeWhitelistTable)
      .where(eq(antiNukeWhitelistTable.guildId, guildId))
      .limit(1);
    const s = new Set<string>(rows[0]?.userIds ?? []);
    whitelistCache.set(guildId, s);
    return s;
  } catch { return new Set(); }
}

export async function saveWhitelist(guildId: string, whitelist: Set<string>): Promise<void> {
  whitelistCache.set(guildId, whitelist);
  const db = getDb();
  await db
    .insert(antiNukeWhitelistTable)
    .values({ guildId, userIds: [...whitelist] })
    .onConflictDoUpdate({
      target: antiNukeWhitelistTable.guildId,
      set: { userIds: [...whitelist] },
    });
}

// ── Config ─────────────────────────────────────────────────────────────────
export async function getConfig(guildId: string): Promise<AntiNukeConfig> {
  if (configCache.has(guildId)) return configCache.get(guildId)!;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(antiNukeConfigTable)
      .where(eq(antiNukeConfigTable.guildId, guildId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return { enabled: false, logChannelId: null, logPingIds: [], thresholds: { ...DEFAULT_THRESHOLDS } };
    }
    const cfg: AntiNukeConfig = {
      enabled:      row.enabled,
      logChannelId: row.logChannelId ?? null,
      logPingIds:   row.logPingIds ?? [],
      thresholds:   { ...DEFAULT_THRESHOLDS, ...(row.thresholds as Partial<AntiNukeConfig["thresholds"]> ?? {}) },
    };
    configCache.set(guildId, cfg);
    return cfg;
  } catch {
    return { enabled: false, logChannelId: null, logPingIds: [], thresholds: { ...DEFAULT_THRESHOLDS } };
  }
}

export async function saveConfig(guildId: string, cfg: AntiNukeConfig): Promise<void> {
  configCache.set(guildId, cfg);
  const db = getDb();
  await db
    .insert(antiNukeConfigTable)
    .values({
      guildId,
      enabled:      cfg.enabled,
      logChannelId: cfg.logChannelId,
      logPingIds:   cfg.logPingIds,
      thresholds:   cfg.thresholds as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: antiNukeConfigTable.guildId,
      set: {
        enabled:      cfg.enabled,
        logChannelId: cfg.logChannelId,
        logPingIds:   cfg.logPingIds,
        thresholds:   cfg.thresholds as Record<string, unknown>,
      },
    });
}
