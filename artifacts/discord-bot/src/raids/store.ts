import { eq, sql } from "drizzle-orm";
import { getDb } from "../db.js";
import { raidResultsTable, botSequencesTable } from "@workspace/db/schema";

export interface RaidResult {
  id: string;
  clanName: string;
  opponentClan: string;
  result: string;
  topPerformers: string;
  notes: string;
  endedBy: string;
  endedById: string;
  timestamp: string;
  guildId: string;
  raidNumber: number;
}

export async function nextRaidNumber(): Promise<number> {
  const db = getDb();
  const rows = await db
    .insert(botSequencesTable)
    .values({ name: "raids", value: 1 })
    .onConflictDoUpdate({
      target: botSequencesTable.name,
      set: { value: sql`${botSequencesTable.value} + 1` },
    })
    .returning({ value: botSequencesTable.value });
  return rows[0]?.value ?? 1;
}

export async function saveRaidResult(result: RaidResult): Promise<void> {
  const db = getDb();
  await db.insert(raidResultsTable).values(result).onConflictDoUpdate({
    target: raidResultsTable.id,
    set: { ...result },
  });
}

export async function getRaidResults(guildId: string): Promise<RaidResult[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(raidResultsTable)
    .where(eq(raidResultsTable.guildId, guildId));
  return rows;
}
