import { eq, asc } from "drizzle-orm";
import { getDb } from "../db.js";
import { leaderboardPlayersTable, leaderboardPinnedMessagesTable } from "@workspace/db/schema";

export type StageRank =
  | "High Strong"
  | "High Stable"
  | "Mid Strong"
  | "Mid Stable"
  | "Weak Stable";

export const STAGE_RANKS: StageRank[] = [
  "High Strong", "High Stable", "Mid Strong", "Mid Stable", "Weak Stable",
];

export const STAGE_RANK_COLORS: Record<StageRank, number> = {
  "High Strong": 0xffd700,
  "High Stable": 0xf39c12,
  "Mid Strong":  0x3498db,
  "Mid Stable":  0x9b59b6,
  "Weak Stable": 0x95a5a6,
};

export const STAGE_RANK_EMOJI: Record<StageRank, string> = {
  "High Strong": "🏆",
  "High Stable": "🥇",
  "Mid Strong":  "🥈",
  "Mid Stable":  "🥉",
  "Weak Stable": "⚔️",
};

export interface LeaderboardPlayer {
  position: number;
  displayName: string;
  robloxUsername: string;
  discordUsername: string;
  country: string;
  avatarUrl: string;
  stageRank: StageRank;
}

export interface PinnedMessage {
  guildId: string;
  channelId: string;
  messageId: string;
}

export async function getPlayers(): Promise<LeaderboardPlayer[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(leaderboardPlayersTable)
    .orderBy(asc(leaderboardPlayersTable.position));
  return rows.map(r => ({
    position:        r.position,
    displayName:     r.displayName,
    robloxUsername:  r.robloxUsername,
    discordUsername: r.discordUsername,
    country:         r.country,
    avatarUrl:       r.avatarUrl,
    stageRank:       r.stageRank as StageRank,
  }));
}

export async function addPlayer(player: LeaderboardPlayer): Promise<void> {
  const db = getDb();
  await db.insert(leaderboardPlayersTable).values(player);
}

export async function removePlayerByPosition(position: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(leaderboardPlayersTable)
    .where(eq(leaderboardPlayersTable.position, position));
  return (result.rowCount ?? 0) > 0;
}

export async function editPlayer(position: number, updates: Partial<LeaderboardPlayer>): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(leaderboardPlayersTable)
    .set(updates)
    .where(eq(leaderboardPlayersTable.position, position));
  return (result.rowCount ?? 0) > 0;
}

export async function playerExistsAtPosition(position: number): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ position: leaderboardPlayersTable.position })
    .from(leaderboardPlayersTable)
    .where(eq(leaderboardPlayersTable.position, position))
    .limit(1);
  return rows.length > 0;
}

export async function getPinnedMessage(): Promise<PinnedMessage | undefined> {
  const db = getDb();
  const rows = await db.select().from(leaderboardPinnedMessagesTable).limit(1);
  return rows[0];
}

export async function setPinnedMessage(pinned: PinnedMessage): Promise<void> {
  const db = getDb();
  await db
    .insert(leaderboardPinnedMessagesTable)
    .values(pinned)
    .onConflictDoUpdate({
      target: leaderboardPinnedMessagesTable.guildId,
      set: { channelId: pinned.channelId, messageId: pinned.messageId },
    });
}

export async function clearPinnedMessage(): Promise<void> {
  const db = getDb();
  await db.delete(leaderboardPinnedMessagesTable);
}
