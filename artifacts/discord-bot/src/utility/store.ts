import { and, eq } from "drizzle-orm";
import { getDb } from "../db.js";
import {
  warnsTable,
  promotionsTable,
  attendancesTable,
  mvpsTable,
} from "@workspace/db/schema";

export interface WarnEntry {
  id: string;
  userId: string;
  userTag: string;
  moderatorId: string;
  moderatorTag: string;
  reason: string;
  timestamp: string;
  guildId: string;
}

export interface PromotionEntry {
  id: string;
  userId: string;
  userTag: string;
  moderatorId: string;
  moderatorTag: string;
  type: "promote" | "demote";
  newRank: string;
  timestamp: string;
  guildId: string;
}

export interface AttendanceEntry {
  id: string;
  userId: string;
  userTag: string;
  event: string;
  markedById: string;
  markedByTag: string;
  timestamp: string;
  guildId: string;
}

export interface MvpEntry {
  id: string;
  userId: string;
  userTag: string;
  event: string;
  reason: string;
  awardedById: string;
  awardedByTag: string;
  timestamp: string;
  guildId: string;
}

export async function addWarn(entry: WarnEntry): Promise<void> {
  await getDb().insert(warnsTable).values(entry);
}

export async function getWarns(userId: string, guildId: string): Promise<WarnEntry[]> {
  return getDb()
    .select()
    .from(warnsTable)
    .where(and(eq(warnsTable.userId, userId), eq(warnsTable.guildId, guildId)));
}

export async function addPromotion(entry: PromotionEntry): Promise<void> {
  await getDb().insert(promotionsTable).values(entry);
}

export async function addAttendance(entry: AttendanceEntry): Promise<void> {
  await getDb().insert(attendancesTable).values(entry);
}

export async function addMvp(entry: MvpEntry): Promise<void> {
  await getDb().insert(mvpsTable).values(entry);
}

export async function removeWarns(userId: string, guildId: string, amount: number): Promise<number> {
  const db = getDb();
  const existing = await db
    .select({ id: warnsTable.id })
    .from(warnsTable)
    .where(and(eq(warnsTable.userId, userId), eq(warnsTable.guildId, guildId)))
    .limit(amount);
  if (existing.length === 0) return 0;
  for (const row of existing) {
    await db.delete(warnsTable).where(eq(warnsTable.id, row.id));
  }
  return existing.length;
}
