import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import {
  antiNukeConfigTable,
  antiNukeWhitelistTable,
} from "@workspace/db/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ActionType =
  | "channelDelete"
  | "channelCreate"
  | "roleDelete"
  | "roleCreate"
  | "ban"
  | "kick"
  | "guildUpdate"
  | "webhookCreate"
  | "emojiDelete";

/**
 * What happens to an offender when they cross a threshold.
 *   ban   — permanently bans from the server (strongest, use for confirmed threats)
 *   kick  — kicks; they can rejoin but lose admin access immediately
 *   strip — removes all roles (default; reversible via ?antinuke restore)
 *
 * Bots are ALWAYS banned regardless of this setting — managed/integration
 * roles cannot be stripped, so ban is the only effective action.
 */
export type PunishAction = "ban" | "kick" | "strip";

export interface AntiNukeConfig {
  enabled: boolean;
  logChannelId: string | null;
  logPingIds: string[];
  punishAction: PunishAction;
  thresholds: Record<ActionType, { count: number; window: number }>;
}

/**
 * Defaults — tuned for fast detection:
 *   - 10 second sliding window (tighter than the old 20s)
 *   - Destructive actions (delete) trigger on 2 events; creative (create)
 *     trigger on 4 since some legitimate bots do batch-create.
 */
export const DEFAULT_THRESHOLDS: AntiNukeConfig["thresholds"] = {
  channelDelete: { count: 2, window: 10_000 },
  channelCreate: { count: 4, window: 10_000 },
  roleDelete:    { count: 2, window: 10_000 },
  roleCreate:    { count: 4, window: 10_000 },
  ban:           { count: 3, window: 10_000 },
  kick:          { count: 3, window: 10_000 },
  guildUpdate:   { count: 2, window: 10_000 },
  webhookCreate: { count: 3, window: 10_000 },
  emojiDelete:   { count: 5, window: 10_000 },
};

// ── In-memory sliding window ───────────────────────────────────────────────────
// guildId → executorId → actionType → timestamps[]
const actionMap = new Map<string, Map<string, Map<ActionType, number[]>>>();

// ── In-memory caches ──────────────────────────────────────────────────────────
const whitelistCache = new Map<string, Set<string>>();
const configCache    = new Map<string, AntiNukeConfig>();

// ── Sliding-window counter ────────────────────────────────────────────────────

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

// ── Whitelist ──────────────────────────────────────────────────────────────────

export async function getWhitelist(guildId: string): Promise<Set<string>> {
  if (whitelistCache.has(guildId)) return whitelistCache.get(guildId)!;
  try {
    const db   = getDb();
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

// ── Config ─────────────────────────────────────────────────────────────────────
//
// punishAction is stored inside the JSONB thresholds column under the
// reserved key "_punishAction". This avoids a schema migration while keeping
// it persistent. It is extracted at read time and never merged into thresholds.

const PUNISH_KEY = "_punishAction";

export async function getConfig(guildId: string): Promise<AntiNukeConfig> {
  if (configCache.has(guildId)) return configCache.get(guildId)!;
  try {
    const db   = getDb();
    const rows = await db
      .select()
      .from(antiNukeConfigTable)
      .where(eq(antiNukeConfigTable.guildId, guildId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return {
        enabled: false,
        logChannelId: null,
        logPingIds: [],
        punishAction: "strip",
        thresholds: { ...DEFAULT_THRESHOLDS },
      };
    }

    const raw = (row.thresholds ?? {}) as Record<string, unknown>;
    const punishAction = (raw[PUNISH_KEY] as PunishAction | undefined) ?? "strip";

    const { [PUNISH_KEY]: _removed, ...thresholdBlob } = raw;

    const cfg: AntiNukeConfig = {
      enabled:      row.enabled,
      logChannelId: row.logChannelId ?? null,
      logPingIds:   row.logPingIds ?? [],
      punishAction,
      thresholds:   {
        ...DEFAULT_THRESHOLDS,
        ...(thresholdBlob as Partial<AntiNukeConfig["thresholds"]>),
      },
    };
    configCache.set(guildId, cfg);
    return cfg;
  } catch {
    return {
      enabled: false,
      logChannelId: null,
      logPingIds: [],
      punishAction: "strip",
      thresholds: { ...DEFAULT_THRESHOLDS },
    };
  }
}

export async function saveConfig(guildId: string, cfg: AntiNukeConfig): Promise<void> {
  configCache.set(guildId, cfg);
  const db = getDb();

  // Merge punishAction back into the thresholds JSONB blob
  const thresholdsBlob = {
    ...cfg.thresholds,
    [PUNISH_KEY]: cfg.punishAction,
  };

  await db
    .insert(antiNukeConfigTable)
    .values({
      guildId,
      enabled:      cfg.enabled,
      logChannelId: cfg.logChannelId,
      logPingIds:   cfg.logPingIds,
      thresholds:   thresholdsBlob as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: antiNukeConfigTable.guildId,
      set: {
        enabled:      cfg.enabled,
        logChannelId: cfg.logChannelId,
        logPingIds:   cfg.logPingIds,
        thresholds:   thresholdsBlob as Record<string, unknown>,
      },
    });
}
