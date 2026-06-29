import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db.js";
import { tournamentsTable, tournamentParticipantsTable, botSequencesTable } from "@workspace/db/schema";

export interface TournamentParticipant {
  userId: string;
  userTag: string;
  joinedAt: string;
}

export interface TournamentData {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  about: string;
  rules: string;
  gameLink: string;
  prize: string;
  pingRoleId: string;
  tournamentDate: string;
  tournamentTime: string;
  hostId: string;
  hostTag: string;
  maxParticipants: number;
  entryRequirement: string;
  notes?: string;
  registrationDeadline?: string;
  closed?: boolean;
  createdById: string;
  createdByTag: string;
  createdAt: string;
  participants: TournamentParticipant[];
}

function rowToTournament(
  row: typeof tournamentsTable.$inferSelect,
  participants: TournamentParticipant[],
): TournamentData {
  return {
    id:                   row.id,
    guildId:              row.guildId,
    channelId:            row.channelId,
    messageId:            row.messageId,
    about:                row.about,
    rules:                row.rules,
    gameLink:             row.gameLink,
    prize:                row.prize,
    pingRoleId:           row.pingRoleId,
    tournamentDate:       row.tournamentDate,
    tournamentTime:       row.tournamentTime,
    hostId:               row.hostId,
    hostTag:              row.hostTag,
    maxParticipants:      row.maxParticipants,
    entryRequirement:     row.entryRequirement,
    notes:                row.notes ?? undefined,
    registrationDeadline: row.registrationDeadline ?? undefined,
    closed:               row.closed,
    createdById:          row.createdById,
    createdByTag:         row.createdByTag,
    createdAt:            row.createdAt,
    participants,
  };
}

export async function nextTournamentId(): Promise<string> {
  const db = getDb();
  const rows = await db
    .insert(botSequencesTable)
    .values({ name: "tournaments", value: 1 })
    .onConflictDoUpdate({
      target: botSequencesTable.name,
      set: { value: sql`${botSequencesTable.value} + 1` },
    })
    .returning({ value: botSequencesTable.value });
  const n = rows[0]?.value ?? 1;
  return `LS-${String(n).padStart(4, "0")}`;
}

export async function saveTournament(tournament: TournamentData): Promise<void> {
  const db = getDb();
  const { participants, ...row } = tournament;
  await db
    .insert(tournamentsTable)
    .values({ ...row, closed: row.closed ?? false })
    .onConflictDoUpdate({
      target: tournamentsTable.id,
      set: {
        guildId:              row.guildId,
        channelId:            row.channelId,
        messageId:            row.messageId,
        about:                row.about,
        rules:                row.rules,
        gameLink:             row.gameLink,
        prize:                row.prize,
        pingRoleId:           row.pingRoleId,
        tournamentDate:       row.tournamentDate,
        tournamentTime:       row.tournamentTime,
        hostId:               row.hostId,
        hostTag:              row.hostTag,
        maxParticipants:      row.maxParticipants,
        entryRequirement:     row.entryRequirement,
        notes:                row.notes,
        registrationDeadline: row.registrationDeadline,
        closed:               row.closed ?? false,
        createdById:          row.createdById,
        createdByTag:         row.createdByTag,
        createdAt:            row.createdAt,
      },
    });

  // Sync participants only when provided (non-empty = initial creation / full update)
  if (participants.length > 0) {
    await db
      .delete(tournamentParticipantsTable)
      .where(eq(tournamentParticipantsTable.tournamentId, tournament.id));
    for (const p of participants) {
      await db.insert(tournamentParticipantsTable).values({
        tournamentId: tournament.id, ...p,
      }).onConflictDoNothing();
    }
  }
}

export async function getTournament(id: string): Promise<TournamentData | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, id))
    .limit(1);
  if (!rows[0]) return undefined;

  const pRows = await db
    .select()
    .from(tournamentParticipantsTable)
    .where(eq(tournamentParticipantsTable.tournamentId, id));
  const participants = pRows.map(p => ({ userId: p.userId, userTag: p.userTag, joinedAt: p.joinedAt }));
  return rowToTournament(rows[0], participants);
}

export async function closeTournament(id: string): Promise<TournamentData | undefined> {
  const db = getDb();
  await db
    .update(tournamentsTable)
    .set({ closed: true })
    .where(eq(tournamentsTable.id, id));
  return getTournament(id);
}

export async function addTournamentParticipant(
  id: string,
  participant: TournamentParticipant,
): Promise<"joined" | "duplicate" | "full" | "missing"> {
  const db = getDb();
  const tournament = await getTournament(id);
  if (!tournament) return "missing";
  if (tournament.participants.some(p => p.userId === participant.userId)) return "duplicate";
  if (tournament.participants.length >= tournament.maxParticipants) return "full";

  await db.insert(tournamentParticipantsTable).values({
    tournamentId: id, ...participant,
  });
  return "joined";
}

export async function removeTournamentParticipant(
  id: string,
  userId: string,
): Promise<"left" | "not_joined" | "missing"> {
  const db = getDb();
  const rows = await db
    .select({ userId: tournamentParticipantsTable.userId })
    .from(tournamentParticipantsTable)
    .where(and(
      eq(tournamentParticipantsTable.tournamentId, id),
      eq(tournamentParticipantsTable.userId, userId),
    ))
    .limit(1);
  if (rows.length === 0) {
    const t = await getTournament(id);
    return t ? "not_joined" : "missing";
  }
  await db
    .delete(tournamentParticipantsTable)
    .where(and(
      eq(tournamentParticipantsTable.tournamentId, id),
      eq(tournamentParticipantsTable.userId, userId),
    ));
  return "left";
}
