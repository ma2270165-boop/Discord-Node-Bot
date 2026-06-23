import { getPool } from "../persistence.js";

export type ActionType =
  | "channelDelete"
  | "roleDelete"
  | "ban"
  | "guildUpdate"
  | "webhookCreate"
  | "emojiDelete";

export interface AntiNukeConfig {
  enabled: boolean;
  logChannelId: string | null;
  thresholds: Record<ActionType, { count: number; window: number }>;
}

export const DEFAULT_THRESHOLDS: AntiNukeConfig["thresholds"] = {
  channelDelete: { count: 3, window: 20_000 },
  roleDelete:    { count: 3, window: 20_000 },
  ban:           { count: 5, window: 20_000 },
  guildUpdate:   { count: 2, window: 20_000 },
  webhookCreate: { count: 5, window: 20_000 },
  emojiDelete:   { count: 5, window: 20_000 },
};

// ── In-memory sliding window ───────────────────────────────────────────────
// guildId → executorId → actionType → timestamps[]
const actionMap = new Map<string, Map<string, Map<ActionType, number[]>>>();

// ── In-memory caches ───────────────────────────────────────────────────────
const whitelistCache = new Map<string, Set<string>>();
const configCache    = new Map<string, AntiNukeConfig>();

// Record an action for an executor. Returns true when threshold is crossed.
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

// Clear action history for an executor after quarantine.
export function clearActions(guildId: string, executorId: string): void {
  actionMap.get(guildId)?.delete(executorId);
}

// ── Whitelist ──────────────────────────────────────────────────────────────
export async function getWhitelist(guildId: string): Promise<Set<string>> {
  if (whitelistCache.has(guildId)) return whitelistCache.get(guildId)!;
  try {
    const res = await getPool().query<{ value: string[] }>(
      "SELECT value FROM bot_kv WHERE key = $1",
      [`antinuke_whitelist:${guildId}`],
    );
    const s = new Set<string>(res.rows[0]?.value ?? []);
    whitelistCache.set(guildId, s);
    return s;
  } catch { return new Set(); }
}

export async function saveWhitelist(guildId: string, whitelist: Set<string>): Promise<void> {
  whitelistCache.set(guildId, whitelist);
  await getPool().query(
    `INSERT INTO bot_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [`antinuke_whitelist:${guildId}`, JSON.stringify([...whitelist])],
  );
}

// ── Config ─────────────────────────────────────────────────────────────────
export async function getConfig(guildId: string): Promise<AntiNukeConfig> {
  if (configCache.has(guildId)) return configCache.get(guildId)!;
  try {
    const res = await getPool().query<{ value: Partial<AntiNukeConfig> }>(
      "SELECT value FROM bot_kv WHERE key = $1",
      [`antinuke_config:${guildId}`],
    );
    const raw = res.rows[0]?.value;
    const cfg: AntiNukeConfig = {
      enabled:      raw?.enabled      ?? false,
      logChannelId: raw?.logChannelId ?? null,
      thresholds:   { ...DEFAULT_THRESHOLDS, ...(raw?.thresholds ?? {}) },
    };
    configCache.set(guildId, cfg);
    return cfg;
  } catch {
    return { enabled: false, logChannelId: null, thresholds: { ...DEFAULT_THRESHOLDS } };
  }
}

export async function saveConfig(guildId: string, cfg: AntiNukeConfig): Promise<void> {
  configCache.set(guildId, cfg);
  await getPool().query(
    `INSERT INTO bot_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [`antinuke_config:${guildId}`, JSON.stringify(cfg)],
  );
}
