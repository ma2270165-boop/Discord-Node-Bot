import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { lowoGuildSettingsTable } from "@workspace/db/schema";

// ── In-memory cache: guild settings are read on every message ─────────────
interface LowoSettings {
  whitelistMode: boolean;
  allowedChannels: string[];
}
const cache = new Map<string, LowoSettings>();

async function getSettings(guildId: string): Promise<LowoSettings> {
  if (cache.has(guildId)) return cache.get(guildId)!;
  try {
    const db = getDb();
    const rows = await db
      .select({
        whitelistMode:   lowoGuildSettingsTable.whitelistMode,
        allowedChannels: lowoGuildSettingsTable.allowedChannels,
      })
      .from(lowoGuildSettingsTable)
      .where(eq(lowoGuildSettingsTable.guildId, guildId))
      .limit(1);
    const s: LowoSettings = rows[0]
      ? { whitelistMode: rows[0].whitelistMode, allowedChannels: rows[0].allowedChannels ?? [] }
      : { whitelistMode: false, allowedChannels: [] };
    cache.set(guildId, s);
    return s;
  } catch { return { whitelistMode: false, allowedChannels: [] }; }
}

async function saveSettings(guildId: string, s: LowoSettings): Promise<void> {
  cache.set(guildId, s);
  const db = getDb();
  await db
    .insert(lowoGuildSettingsTable)
    .values({ guildId, whitelistMode: s.whitelistMode, allowedChannels: s.allowedChannels })
    .onConflictDoUpdate({
      target: lowoGuildSettingsTable.guildId,
      set: { whitelistMode: s.whitelistMode, allowedChannels: s.allowedChannels },
    });
}

export async function isChannelAllowed(guildId: string | null, channelId: string): Promise<boolean> {
  if (!guildId) return true;
  const s = await getSettings(guildId);
  if (!s.whitelistMode) return true;
  return s.allowedChannels.includes(channelId);
}

export async function getChannelList(guildId: string): Promise<string[]> {
  return (await getSettings(guildId)).allowedChannels;
}

export async function isWhitelistMode(guildId: string): Promise<boolean> {
  return (await getSettings(guildId)).whitelistMode;
}

export async function enableChannel(guildId: string, channelId: string): Promise<void> {
  const s = await getSettings(guildId);
  const set = new Set(s.allowedChannels);
  set.add(channelId);
  await saveSettings(guildId, { whitelistMode: true, allowedChannels: [...set] });
}

export async function disableChannel(guildId: string, channelId: string): Promise<void> {
  const s = await getSettings(guildId);
  const channels = s.allowedChannels.filter(id => id !== channelId);
  await saveSettings(guildId, { whitelistMode: true, allowedChannels: channels });
}
