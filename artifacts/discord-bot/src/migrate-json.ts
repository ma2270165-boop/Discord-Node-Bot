/**
 * One-time JSON → Postgres migration.
 *
 * Reads every legacy JSON data file that still exists in `data/`, inserts the
 * records into their proper normalized tables, then renames the file to
 * `<name>.migrated` so this logic never runs again for that file.
 *
 * Safe to call on every startup — it is a no-op once all files have been
 * renamed.
 */

import { existsSync, readFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db.js";
import {
  economyUsersTable,
  killLeaderboardPlayersTable,
  killPinnedMessagesTable,
  leaderboardPlayersTable,
  leaderboardPinnedMessagesTable,
  mewoEnabledChannelsTable,
  mewoTagsTable,
  mewoTimezonesTable,
  mewoEmbedColorsTable,
  mewoAiUsageTable,
  mewoWalletsTable,
  censorGuildConfigTable,
  censorUserFlagsTable,
  raidResultsTable,
  botSequencesTable,
  rulesMessagesTable,
  tournamentsTable,
  tournamentParticipantsTable,
  trainingLogsTable,
  warnsTable,
  promotionsTable,
  attendancesTable,
  mvpsTable,
  lowoGuildSettingsTable,
} from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../data");

function readJson<T>(file: string): T | null {
  const full = join(DATA_DIR, file);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf-8")) as T;
  } catch {
    return null;
  }
}

function markMigrated(file: string): void {
  const full = join(DATA_DIR, file);
  if (existsSync(full)) renameSync(full, `${full}.migrated`);
}

export async function runJsonMigration(): Promise<void> {
  const db = getDb();

  // ── economy.json ──────────────────────────────────────────────────────────
  const eco = readJson<Record<string, {
    balance?: number; bank?: number;
    lastDaily?: number; lastWeekly?: number; lastWork?: number;
    lastRob?: number; lastCrime?: number; lastInvest?: number;
    inventory?: unknown[]; investAmount?: number; investAt?: number;
    totalEarned?: number;
  }>>("economy.json");
  if (eco) {
    const rows = Object.entries(eco).map(([userId, u]) => ({
      userId,
      balance: u.balance ?? 0,
      bank: u.bank ?? 0,
      lastDaily: u.lastDaily ?? 0,
      lastWeekly: u.lastWeekly ?? 0,
      lastWork: u.lastWork ?? 0,
      lastRob: u.lastRob ?? 0,
      lastCrime: u.lastCrime ?? 0,
      lastInvest: u.lastInvest ?? 0,
      inventory: (u.inventory ?? []) as unknown[],
      investAmount: u.investAmount ?? 0,
      investAt: u.investAt ?? 0,
      totalEarned: u.totalEarned ?? 0,
    }));
    if (rows.length > 0) {
      for (const row of rows) {
        await db.insert(economyUsersTable).values(row)
          .onConflictDoNothing();
      }
    }
    markMigrated("economy.json");
    console.log(`[MIGRATE] economy.json → economy_users (${rows.length} rows)`);
  }

  // ── kill-leaderboard.json ─────────────────────────────────────────────────
  const kl = readJson<{
    players?: Array<{
      rank: number; displayName: string; robloxUsername: string;
      discordUsername: string; position?: string; rolePosition?: string;
      killCount: number; stage: string; avatarUrl: string;
    }>;
    pinnedMessage?: { guildId: string; channelId: string; messageId: string };
  }>("kill-leaderboard.json");
  if (kl) {
    for (const p of kl.players ?? []) {
      await db.insert(killLeaderboardPlayersTable).values({
        rank: p.rank,
        displayName: p.displayName,
        robloxUsername: p.robloxUsername,
        discordUsername: p.discordUsername,
        position: p.position ?? p.rolePosition ?? "Clan Member",
        killCount: p.killCount,
        stage: p.stage,
        avatarUrl: p.avatarUrl,
      }).onConflictDoNothing();
    }
    if (kl.pinnedMessage) {
      await db.insert(killPinnedMessagesTable).values(kl.pinnedMessage)
        .onConflictDoNothing();
    }
    markMigrated("kill-leaderboard.json");
    console.log(`[MIGRATE] kill-leaderboard.json → kill_leaderboard_players (${(kl.players ?? []).length} rows)`);
  }

  // ── leaderboard.json ──────────────────────────────────────────────────────
  const lb = readJson<{
    players?: Array<{
      position: number; displayName: string; robloxUsername: string;
      discordUsername: string; country: string; avatarUrl: string; stageRank: string;
    }>;
    pinnedMessage?: { guildId: string; channelId: string; messageId: string };
  }>("leaderboard.json");
  if (lb) {
    for (const p of lb.players ?? []) {
      await db.insert(leaderboardPlayersTable).values(p).onConflictDoNothing();
    }
    if (lb.pinnedMessage) {
      await db.insert(leaderboardPinnedMessagesTable).values(lb.pinnedMessage)
        .onConflictDoNothing();
    }
    markMigrated("leaderboard.json");
    console.log(`[MIGRATE] leaderboard.json → leaderboard_players (${(lb.players ?? []).length} rows)`);
  }

  // ── mewo.json ─────────────────────────────────────────────────────────────
  const mewo = readJson<{
    enabledChannels?: string[];
    tags?: Record<string, Record<string, {
      name: string; content: string; createdBy: string; createdByTag: string; createdAt: string;
    }>>;
    timezones?: Record<string, string>;
    embedColors?: Record<string, string>;
    aiUsage?: Record<string, { chatgpt: number; llama: number; deepseek: number; resetDate: string }>;
    wallets?: Record<string, { balance: number; dailyDate: string; streak: number; lastClaimDate: string }>;
  }>("mewo.json");
  if (mewo) {
    for (const ch of mewo.enabledChannels ?? []) {
      await db.insert(mewoEnabledChannelsTable).values({ channelId: ch }).onConflictDoNothing();
    }
    for (const [guildId, tagMap] of Object.entries(mewo.tags ?? {})) {
      for (const [, tag] of Object.entries(tagMap)) {
        await db.insert(mewoTagsTable).values({
          guildId, name: tag.name.toLowerCase(),
          content: tag.content, createdBy: tag.createdBy,
          createdByTag: tag.createdByTag, createdAt: tag.createdAt,
        }).onConflictDoNothing();
      }
    }
    for (const [userId, tz] of Object.entries(mewo.timezones ?? {})) {
      await db.insert(mewoTimezonesTable).values({ userId, timezone: tz }).onConflictDoNothing();
    }
    for (const [userId, color] of Object.entries(mewo.embedColors ?? {})) {
      await db.insert(mewoEmbedColorsTable).values({ userId, color }).onConflictDoNothing();
    }
    for (const [userId, u] of Object.entries(mewo.aiUsage ?? {})) {
      await db.insert(mewoAiUsageTable).values({
        userId, chatgpt: u.chatgpt ?? 0, llama: u.llama ?? 0,
        deepseek: u.deepseek ?? 0, resetDate: u.resetDate ?? "",
      }).onConflictDoNothing();
    }
    for (const [userId, w] of Object.entries(mewo.wallets ?? {})) {
      await db.insert(mewoWalletsTable).values({
        userId, balance: w.balance ?? 0, dailyDate: w.dailyDate ?? "",
        streak: w.streak ?? 0, lastClaimDate: w.lastClaimDate ?? "",
      }).onConflictDoNothing();
    }
    markMigrated("mewo.json");
    console.log("[MIGRATE] mewo.json → mewo_* tables");
  }

  // ── censor.json ───────────────────────────────────────────────────────────
  const censor = readJson<{
    guilds?: Record<string, { enabled: boolean; modLogChannelId: string | null }>;
    flags?: Record<string, { count: number; lastFlag: string; totalLifetime: number }>;
  }>("censor.json");
  if (censor) {
    for (const [guildId, cfg] of Object.entries(censor.guilds ?? {})) {
      await db.insert(censorGuildConfigTable).values({
        guildId, enabled: cfg.enabled, modLogChannelId: cfg.modLogChannelId ?? null,
      }).onConflictDoNothing();
    }
    for (const [key, f] of Object.entries(censor.flags ?? {})) {
      const [guildId, userId] = key.split(":");
      if (guildId && userId) {
        await db.insert(censorUserFlagsTable).values({
          guildId, userId, count: f.count, lastFlag: f.lastFlag, totalLifetime: f.totalLifetime,
        }).onConflictDoNothing();
      }
    }
    markMigrated("censor.json");
    console.log("[MIGRATE] censor.json → censor_guild_config, censor_user_flags");
  }

  // ── raids.json ────────────────────────────────────────────────────────────
  const raids = readJson<{
    results?: Array<{
      id: string; clanName: string; opponentClan: string; result: string;
      topPerformers: string; notes: string; endedBy: string; endedById: string;
      timestamp: string; guildId: string; raidNumber: number;
    }>;
    counter?: number;
  }>("raids.json");
  if (raids) {
    for (const r of raids.results ?? []) {
      await db.insert(raidResultsTable).values(r).onConflictDoNothing();
    }
    if ((raids.counter ?? 0) > 0) {
      await db.insert(botSequencesTable).values({ name: "raids", value: raids.counter ?? 0 })
        .onConflictDoNothing();
    }
    markMigrated("raids.json");
    console.log(`[MIGRATE] raids.json → raid_results (${(raids.results ?? []).length} rows)`);
  }

  // ── rules.json ────────────────────────────────────────────────────────────
  const rules = readJson<{ messages?: Array<{ guildId: string; channelId: string; messageId: string }> }>("rules.json");
  if (rules) {
    for (const m of rules.messages ?? []) {
      await db.insert(rulesMessagesTable).values(m).onConflictDoNothing();
    }
    markMigrated("rules.json");
    console.log(`[MIGRATE] rules.json → rules_messages (${(rules.messages ?? []).length} rows)`);
  }

  // ── tournaments.json ──────────────────────────────────────────────────────
  const tourn = readJson<{
    counter?: number;
    tournaments?: Array<{
      id: string; guildId: string; channelId: string; messageId: string;
      about: string; rules: string; gameLink: string; prize: string;
      pingRoleId: string; tournamentDate: string; tournamentTime: string;
      hostId: string; hostTag: string; maxParticipants: number;
      entryRequirement: string; notes?: string; registrationDeadline?: string;
      closed?: boolean; createdById: string; createdByTag: string; createdAt: string;
      participants: Array<{ userId: string; userTag: string; joinedAt: string }>;
    }>;
  }>("tournaments.json");
  if (tourn) {
    for (const t of tourn.tournaments ?? []) {
      const { participants, ...tournRow } = t;
      await db.insert(tournamentsTable).values({
        ...tournRow, closed: tournRow.closed ?? false,
      }).onConflictDoNothing();
      for (const p of participants ?? []) {
        await db.insert(tournamentParticipantsTable).values({
          tournamentId: t.id, ...p,
        }).onConflictDoNothing();
      }
    }
    if ((tourn.counter ?? 0) > 0) {
      await db.insert(botSequencesTable).values({ name: "tournaments", value: tourn.counter ?? 0 })
        .onConflictDoNothing();
    }
    markMigrated("tournaments.json");
    console.log(`[MIGRATE] tournaments.json → tournaments + participants (${(tourn.tournaments ?? []).length} tournaments)`);
  }

  // ── training.json ─────────────────────────────────────────────────────────
  const training = readJson<{
    logs?: Array<{
      id: string; host: string; durationCompleted: string; mvp: string;
      notes: string; endedBy: string; endedById: string; timestamp: string;
      guildId: string; sessionNumber: number;
    }>;
    counter?: number;
  }>("training.json");
  if (training) {
    for (const l of training.logs ?? []) {
      await db.insert(trainingLogsTable).values(l).onConflictDoNothing();
    }
    if ((training.counter ?? 0) > 0) {
      await db.insert(botSequencesTable).values({ name: "training", value: training.counter ?? 0 })
        .onConflictDoNothing();
    }
    markMigrated("training.json");
    console.log(`[MIGRATE] training.json → training_logs (${(training.logs ?? []).length} rows)`);
  }

  // ── utility.json ──────────────────────────────────────────────────────────
  const util = readJson<{
    warns?: Array<{ id: string; userId: string; userTag: string; moderatorId: string; moderatorTag: string; reason: string; timestamp: string; guildId: string }>;
    promotions?: Array<{ id: string; userId: string; userTag: string; moderatorId: string; moderatorTag: string; type: string; newRank: string; timestamp: string; guildId: string }>;
    attendances?: Array<{ id: string; userId: string; userTag: string; event: string; markedById: string; markedByTag: string; timestamp: string; guildId: string }>;
    mvps?: Array<{ id: string; userId: string; userTag: string; event: string; reason: string; awardedById: string; awardedByTag: string; timestamp: string; guildId: string }>;
  }>("utility.json");
  if (util) {
    for (const w of util.warns ?? []) await db.insert(warnsTable).values(w).onConflictDoNothing();
    for (const p of util.promotions ?? []) await db.insert(promotionsTable).values(p).onConflictDoNothing();
    for (const a of util.attendances ?? []) await db.insert(attendancesTable).values(a).onConflictDoNothing();
    for (const m of util.mvps ?? []) await db.insert(mvpsTable).values(m).onConflictDoNothing();
    markMigrated("utility.json");
    console.log("[MIGRATE] utility.json → warns, promotions, attendances, mvps");
  }

  // ── lowo_channels.json ────────────────────────────────────────────────────
  const lowoCh = readJson<{ whitelistMode?: string[]; channels?: Record<string, string[]> }>("lowo_channels.json");
  if (lowoCh) {
    const allGuilds = new Set([
      ...(lowoCh.whitelistMode ?? []),
      ...Object.keys(lowoCh.channels ?? {}),
    ]);
    for (const guildId of allGuilds) {
      await db.insert(lowoGuildSettingsTable).values({
        guildId,
        whitelistMode: (lowoCh.whitelistMode ?? []).includes(guildId),
        allowedChannels: lowoCh.channels?.[guildId] ?? [],
        dynamicMode: false,
      }).onConflictDoUpdate({
        target: lowoGuildSettingsTable.guildId,
        set: {
          whitelistMode: (lowoCh.whitelistMode ?? []).includes(guildId),
          allowedChannels: lowoCh.channels?.[guildId] ?? [],
        },
      });
    }
    markMigrated("lowo_channels.json");
    console.log("[MIGRATE] lowo_channels.json → lowo_guild_settings");
  }

  // ── lowo_dynamic.json ─────────────────────────────────────────────────────
  const lowoDyn = readJson<{ guilds?: string[] }>("lowo_dynamic.json");
  if (lowoDyn) {
    for (const guildId of lowoDyn.guilds ?? []) {
      await db.insert(lowoGuildSettingsTable).values({
        guildId, whitelistMode: false, allowedChannels: [], dynamicMode: true,
      }).onConflictDoUpdate({
        target: lowoGuildSettingsTable.guildId,
        set: { dynamicMode: true },
      });
    }
    markMigrated("lowo_dynamic.json");
    console.log("[MIGRATE] lowo_dynamic.json → lowo_guild_settings.dynamic_mode");
  }

  // Keep antinuke data: it already used bot_kv (raw SQL) — the new stores
  // read from antinuke_whitelist / antinuke_config on first access, returning
  // empty defaults for guilds not yet in the new tables. The old bot_kv rows
  // remain harmlessly in place.
  void sql; // imported but used only for type reference
}
