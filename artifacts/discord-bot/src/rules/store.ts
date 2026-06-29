import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { rulesMessagesTable } from "@workspace/db/schema";

export interface RulesMessage {
  guildId: string;
  channelId: string;
  messageId: string;
}

export async function getRulesMessage(guildId: string): Promise<RulesMessage | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(rulesMessagesTable)
    .where(eq(rulesMessagesTable.guildId, guildId))
    .limit(1);
  return rows[0];
}

export async function setRulesMessage(entry: RulesMessage): Promise<void> {
  const db = getDb();
  await db
    .insert(rulesMessagesTable)
    .values(entry)
    .onConflictDoUpdate({
      target: rulesMessagesTable.guildId,
      set: { channelId: entry.channelId, messageId: entry.messageId },
    });
}
