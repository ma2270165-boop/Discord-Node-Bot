import { eq, sql } from "drizzle-orm";
import { getDb } from "../db.js";
import { trainingLogsTable, botSequencesTable } from "@workspace/db/schema";

export interface TrainingLog {
  id: string;
  host: string;
  durationCompleted: string;
  mvp: string;
  notes: string;
  endedBy: string;
  endedById: string;
  timestamp: string;
  guildId: string;
  sessionNumber: number;
}

export async function nextTrainingNumber(): Promise<number> {
  const db = getDb();
  const rows = await db
    .insert(botSequencesTable)
    .values({ name: "training", value: 1 })
    .onConflictDoUpdate({
      target: botSequencesTable.name,
      set: { value: sql`${botSequencesTable.value} + 1` },
    })
    .returning({ value: botSequencesTable.value });
  return rows[0]?.value ?? 1;
}

export async function saveTrainingLog(log: TrainingLog): Promise<void> {
  const db = getDb();
  await db.insert(trainingLogsTable).values(log).onConflictDoUpdate({
    target: trainingLogsTable.id,
    set: { ...log },
  });
}

export async function getTrainingLogs(guildId: string): Promise<TrainingLog[]> {
  const db = getDb();
  return db
    .select()
    .from(trainingLogsTable)
    .where(eq(trainingLogsTable.guildId, guildId));
}
