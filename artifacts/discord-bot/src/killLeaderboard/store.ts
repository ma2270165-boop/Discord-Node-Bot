import { eq, asc } from "drizzle-orm";
import { getDb } from "../db.js";
import { killLeaderboardPlayersTable, killPinnedMessagesTable } from "@workspace/db/schema";

export type KillStage = string;

export const KILL_STAGES = [
  "Stage 2 High Strong",
  "Stage 2 High Stable",
  "Stage 2 High Weak",
  "Stage 2 Mid Strong",
  "Stage 2 Mid Stable",
  "Stage 2 Mid Weak",
] as const;

export interface KillPlayer {
  rank: number;
  displayName: string;
  robloxUsername: string;
  discordUsername: string;
  position: string;
  killCount: number;
  stage: KillStage;
  avatarUrl: string;
}

export interface KillPinnedMessage {
  guildId: string;
  channelId: string;
  messageId: string;
}

export async function getKillPlayers(): Promise<KillPlayer[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(killLeaderboardPlayersTable)
    .orderBy(asc(killLeaderboardPlayersTable.rank));
  return rows.map(r => ({
    rank:            r.rank,
    displayName:     r.displayName,
    robloxUsername:  r.robloxUsername,
    discordUsername: r.discordUsername,
    position:        r.position,
    killCount:       r.killCount,
    stage:           r.stage,
    avatarUrl:       r.avatarUrl,
  }));
}

export async function killPlayerExistsAtRank(rank: number): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ rank: killLeaderboardPlayersTable.rank })
    .from(killLeaderboardPlayersTable)
    .where(eq(killLeaderboardPlayersTable.rank, rank))
    .limit(1);
  return rows.length > 0;
}

export async function addKillPlayer(player: KillPlayer): Promise<void> {
  const db = getDb();
  await db.insert(killLeaderboardPlayersTable).values(player);
}

export async function editKillPlayer(rank: number, updates: Partial<KillPlayer>): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(killLeaderboardPlayersTable)
    .set(updates)
    .where(eq(killLeaderboardPlayersTable.rank, rank));
  return (result.rowCount ?? 0) > 0;
}

export async function removeKillPlayerByRank(rank: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(killLeaderboardPlayersTable)
    .where(eq(killLeaderboardPlayersTable.rank, rank));
  return (result.rowCount ?? 0) > 0;
}

export async function moveKillPlayerRank(rank: number, newRank: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(killLeaderboardPlayersTable)
    .set({ rank: newRank })
    .where(eq(killLeaderboardPlayersTable.rank, rank));
  return (result.rowCount ?? 0) > 0;
}

export async function getKillPinnedMessage(): Promise<KillPinnedMessage | undefined> {
  const db = getDb();
  const rows = await db.select().from(killPinnedMessagesTable).limit(1);
  return rows[0] ? { guildId: rows[0].guildId, channelId: rows[0].channelId, messageId: rows[0].messageId } : undefined;
}

export async function setKillPinnedMessage(pinned: KillPinnedMessage): Promise<void> {
  const db = getDb();
  await db
    .insert(killPinnedMessagesTable)
    .values(pinned)
    .onConflictDoUpdate({
      target: killPinnedMessagesTable.guildId,
      set: { channelId: pinned.channelId, messageId: pinned.messageId },
    });
}

export async function clearKillPinnedMessage(): Promise<void> {
  const db = getDb();
  await db.delete(killPinnedMessagesTable);
}
