import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../db.js";
import {
  mewoEnabledChannelsTable,
  mewoTagsTable,
  mewoTimezonesTable,
  mewoEmbedColorsTable,
  mewoAiUsageTable,
  mewoWalletsTable,
} from "@workspace/db/schema";

export interface MewoTag {
  name: string;
  content: string;
  createdBy: string;
  createdByTag: string;
  createdAt: string;
}

// ── Channel enable/disable ─────────────────────────────────────────────────
// Cached locally: read on every command invocation
let _enabledChannels: Set<string> | null = null;

async function loadEnabledChannels(): Promise<Set<string>> {
  if (_enabledChannels) return _enabledChannels;
  const db = getDb();
  const rows = await db.select().from(mewoEnabledChannelsTable);
  _enabledChannels = new Set(rows.map(r => r.channelId));
  return _enabledChannels;
}

export async function isChannelEnabled(channelId: string): Promise<boolean> {
  const s = await loadEnabledChannels();
  return s.size === 0 || s.has(channelId);
}

export async function enableChannel(channelId: string): Promise<void> {
  const s = await loadEnabledChannels();
  if (s.has(channelId)) return;
  s.add(channelId);
  await getDb().insert(mewoEnabledChannelsTable).values({ channelId }).onConflictDoNothing();
}

export async function disableChannel(channelId: string): Promise<void> {
  const s = await loadEnabledChannels();
  s.delete(channelId);
  await getDb().delete(mewoEnabledChannelsTable).where(eq(mewoEnabledChannelsTable.channelId, channelId));
}

export async function getEnabledChannels(): Promise<string[]> {
  return [...(await loadEnabledChannels())];
}

// ── Tags ───────────────────────────────────────────────────────────────────

export async function getTag(guildId: string, name: string): Promise<MewoTag | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mewoTagsTable)
    .where(eq(mewoTagsTable.guildId, guildId))
    .limit(100);
  const row = rows.find(r => r.name === name.toLowerCase());
  if (!row) return null;
  return { name: row.name, content: row.content, createdBy: row.createdBy, createdByTag: row.createdByTag, createdAt: row.createdAt };
}

export async function createTag(guildId: string, tag: MewoTag): Promise<boolean> {
  const db = getDb();
  try {
    await db.insert(mewoTagsTable).values({
      guildId,
      name:        tag.name.toLowerCase(),
      content:     tag.content,
      createdBy:   tag.createdBy,
      createdByTag: tag.createdByTag,
      createdAt:   tag.createdAt,
    });
    return true;
  } catch { return false; }
}

export async function deleteTag(guildId: string, name: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ guildId: mewoTagsTable.guildId, name: mewoTagsTable.name })
    .from(mewoTagsTable)
    .where(eq(mewoTagsTable.guildId, guildId))
    .limit(100);
  const found = rows.find(r => r.name === name.toLowerCase());
  if (!found) return false;
  await db
    .delete(mewoTagsTable)
    .where(eq(mewoTagsTable.guildId, guildId));
  // Re-insert all except deleted — simpler than a composite-key delete without Drizzle native support
  // For composite PK delete, use sql template
  await db.delete(mewoTagsTable).where(
    sql`guild_id = ${guildId} AND name = ${name.toLowerCase()}`
  );
  return true;
}

export async function listTags(guildId: string): Promise<MewoTag[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mewoTagsTable)
    .where(eq(mewoTagsTable.guildId, guildId));
  return rows.map(r => ({ name: r.name, content: r.content, createdBy: r.createdBy, createdByTag: r.createdByTag, createdAt: r.createdAt }));
}

export async function editTag(guildId: string, name: string, content: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(mewoTagsTable)
    .set({ content })
    .where(sql`guild_id = ${guildId} AND name = ${name.toLowerCase()}`);
  return (result.rowCount ?? 0) > 0;
}

// ── Timezones ──────────────────────────────────────────────────────────────

export async function getTimezone(userId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ timezone: mewoTimezonesTable.timezone })
    .from(mewoTimezonesTable)
    .where(eq(mewoTimezonesTable.userId, userId))
    .limit(1);
  return rows[0]?.timezone ?? "UTC";
}

export async function setTimezone(userId: string, tz: string): Promise<void> {
  const db = getDb();
  await db
    .insert(mewoTimezonesTable)
    .values({ userId, timezone: tz })
    .onConflictDoUpdate({ target: mewoTimezonesTable.userId, set: { timezone: tz } });
}

// ── Embed colors ───────────────────────────────────────────────────────────

export async function getEmbedColor(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ color: mewoEmbedColorsTable.color })
    .from(mewoEmbedColorsTable)
    .where(eq(mewoEmbedColorsTable.userId, userId))
    .limit(1);
  const color = rows[0]?.color;
  return color ? (parseInt(color.replace("#", ""), 16) || 0x5865F2) : 0x5865F2;
}

export async function setEmbedColor(userId: string, hex: string): Promise<void> {
  const db = getDb();
  const normalized = hex.replace("#", "");
  await db
    .insert(mewoEmbedColorsTable)
    .values({ userId, color: normalized })
    .onConflictDoUpdate({ target: mewoEmbedColorsTable.userId, set: { color: normalized } });
}

// ── AI usage ───────────────────────────────────────────────────────────────

export async function getAiUsage(userId: string): Promise<{ chatgpt: number; llama: number; deepseek: number; resetDate: string }> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(mewoAiUsageTable)
    .where(eq(mewoAiUsageTable.userId, userId))
    .limit(1);
  const u = rows[0];
  if (!u || u.resetDate !== today) return { chatgpt: 0, llama: 0, deepseek: 0, resetDate: today };
  return { chatgpt: u.chatgpt, llama: u.llama, deepseek: u.deepseek, resetDate: u.resetDate };
}

export async function incrementAiUsage(userId: string, model: "chatgpt" | "llama" | "deepseek"): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const col = model === "chatgpt" ? mewoAiUsageTable.chatgpt
    : model === "llama" ? mewoAiUsageTable.llama
    : mewoAiUsageTable.deepseek;
  await db
    .insert(mewoAiUsageTable)
    .values({ userId, [model]: 1, resetDate: today })
    .onConflictDoUpdate({
      target: mewoAiUsageTable.userId,
      set: {
        [model]: sql`CASE WHEN ${mewoAiUsageTable.resetDate} = ${today} THEN ${col} + 1 ELSE 1 END`,
        resetDate: today,
      },
    });
}

// ── Wallets ────────────────────────────────────────────────────────────────

interface WalletEntry {
  balance: number;
  dailyDate: string;
  streak: number;
  lastClaimDate: string;
}

async function getWalletRow(userId: string): Promise<WalletEntry> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mewoWalletsTable)
    .where(eq(mewoWalletsTable.userId, userId))
    .limit(1);
  return rows[0]
    ? { balance: rows[0].balance, dailyDate: rows[0].dailyDate, streak: rows[0].streak, lastClaimDate: rows[0].lastClaimDate }
    : { balance: 0, dailyDate: "", streak: 0, lastClaimDate: "" };
}

export async function getWallet(userId: string): Promise<WalletEntry> {
  return getWalletRow(userId);
}

export async function setWalletBalance(userId: string, balance: number): Promise<void> {
  const db = getDb();
  await db
    .insert(mewoWalletsTable)
    .values({ userId, balance })
    .onConflictDoUpdate({ target: mewoWalletsTable.userId, set: { balance } });
}

export async function updateWalletBalance(userId: string, delta: number): Promise<void> {
  const db = getDb();
  await db
    .insert(mewoWalletsTable)
    .values({ userId, balance: Math.max(0, delta) })
    .onConflictDoUpdate({
      target: mewoWalletsTable.userId,
      set: { balance: sql`GREATEST(0, ${mewoWalletsTable.balance} + ${delta})` },
    });
}

export async function claimDaily(userId: string): Promise<{ claimed: boolean; amount: number; balance: number; streak: number; bonus: number }> {
  const db = getDb();
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(mewoWalletsTable)
      .where(eq(mewoWalletsTable.userId, userId))
      .limit(1);
    const w = rows[0] ?? { balance: 0, dailyDate: "", streak: 0, lastClaimDate: "" };

    if (w.dailyDate === today) {
      return { claimed: false, amount: 0, balance: w.balance, streak: w.streak, bonus: 0 };
    }

    const isConsecutive = (w.lastClaimDate || w.dailyDate) === yesterday;
    const streak  = isConsecutive ? w.streak + 1 : 1;
    const base    = Math.floor(Math.random() * 400) + 100;
    const bonus   = streak >= 30 ? Math.floor(base * 4) : streak >= 7 ? Math.floor(base * 1) : streak >= 3 ? Math.floor(base * 0.5) : 0;
    const amount  = base + bonus;
    const balance = w.balance + amount;

    await tx
      .insert(mewoWalletsTable)
      .values({ userId, balance, dailyDate: today, streak, lastClaimDate: today })
      .onConflictDoUpdate({
        target: mewoWalletsTable.userId,
        set: { balance, dailyDate: today, streak, lastClaimDate: today },
      });

    return { claimed: true, amount, balance, streak, bonus };
  });
}

export async function transferCoins(fromId: string, toId: string, amount: number): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const fromRows = await tx
      .select({ balance: mewoWalletsTable.balance })
      .from(mewoWalletsTable)
      .where(eq(mewoWalletsTable.userId, fromId))
      .limit(1);
    const fromBalance = fromRows[0]?.balance ?? 0;
    if (fromBalance < amount) return false;

    await tx
      .insert(mewoWalletsTable)
      .values({ userId: fromId, balance: fromBalance - amount })
      .onConflictDoUpdate({ target: mewoWalletsTable.userId, set: { balance: fromBalance - amount } });

    await tx
      .insert(mewoWalletsTable)
      .values({ userId: toId, balance: amount })
      .onConflictDoUpdate({
        target: mewoWalletsTable.userId,
        set: { balance: sql`${mewoWalletsTable.balance} + ${amount}` },
      });

    return true;
  });
}

export async function getWalletLeaderboard(limit = 10): Promise<Array<{ userId: string; balance: number }>> {
  const db = getDb();
  const rows = await db
    .select({ userId: mewoWalletsTable.userId, balance: mewoWalletsTable.balance })
    .from(mewoWalletsTable)
    .orderBy(desc(mewoWalletsTable.balance))
    .limit(limit);
  return rows;
}
