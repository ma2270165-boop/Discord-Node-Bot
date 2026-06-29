import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../db.js";
import { economyUsersTable } from "@workspace/db/schema";

export interface EcoUser {
  balance: number;
  bank: number;
  lastDaily: number;
  lastWeekly: number;
  lastWork: number;
  lastRob: number;
  lastCrime: number;
  lastInvest: number;
  inventory: { name: string; qty: number; price: number }[];
  investAmount: number;
  investAt: number;
  totalEarned: number;
}

function defaultUser(): EcoUser {
  return {
    balance: 0, bank: 0,
    lastDaily: 0, lastWeekly: 0, lastWork: 0, lastRob: 0, lastCrime: 0, lastInvest: 0,
    inventory: [], investAmount: 0, investAt: 0, totalEarned: 0,
  };
}

function rowToUser(row: typeof economyUsersTable.$inferSelect): EcoUser {
  return {
    balance:     row.balance,
    bank:        row.bank,
    lastDaily:   row.lastDaily,
    lastWeekly:  row.lastWeekly,
    lastWork:    row.lastWork,
    lastRob:     row.lastRob,
    lastCrime:   row.lastCrime,
    lastInvest:  row.lastInvest,
    inventory:   (row.inventory ?? []) as { name: string; qty: number; price: number }[],
    investAmount: row.investAmount,
    investAt:    row.investAt,
    totalEarned: row.totalEarned,
  };
}

export async function getUser(userId: string): Promise<EcoUser> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(economyUsersTable)
      .where(eq(economyUsersTable.userId, userId))
      .limit(1);
    if (rows[0]) return rowToUser(rows[0]);
    // Auto-create on first access
    await db.insert(economyUsersTable).values({ userId }).onConflictDoNothing();
    return defaultUser();
  } catch { return defaultUser(); }
}

export async function setUser(userId: string, data: Partial<EcoUser>): Promise<void> {
  const db = getDb();
  const current = await getUser(userId);
  const merged = { ...current, ...data };
  await db
    .insert(economyUsersTable)
    .values({ userId, ...merged, inventory: merged.inventory as unknown[] })
    .onConflictDoUpdate({
      target: economyUsersTable.userId,
      set: {
        balance:     merged.balance,
        bank:        merged.bank,
        lastDaily:   merged.lastDaily,
        lastWeekly:  merged.lastWeekly,
        lastWork:    merged.lastWork,
        lastRob:     merged.lastRob,
        lastCrime:   merged.lastCrime,
        lastInvest:  merged.lastInvest,
        inventory:   merged.inventory as unknown[],
        investAmount: merged.investAmount,
        investAt:    merged.investAt,
        totalEarned: merged.totalEarned,
      },
    });
}

export async function addBalance(userId: string, amount: number): Promise<number> {
  const db = getDb();
  await db
    .insert(economyUsersTable)
    .values({ userId, balance: Math.max(0, amount), totalEarned: amount > 0 ? amount : 0 })
    .onConflictDoUpdate({
      target: economyUsersTable.userId,
      set: {
        balance:     sql`${economyUsersTable.balance} + ${amount}`,
        totalEarned: amount > 0
          ? sql`${economyUsersTable.totalEarned} + ${amount}`
          : economyUsersTable.totalEarned,
      },
    });
  const rows = await db
    .select({ balance: economyUsersTable.balance })
    .from(economyUsersTable)
    .where(eq(economyUsersTable.userId, userId))
    .limit(1);
  return rows[0]?.balance ?? 0;
}

export async function getTopUsers(limit = 10): Promise<{ userId: string; balance: number; bank: number }[]> {
  const db = getDb();
  const rows = await db
    .select({
      userId:  economyUsersTable.userId,
      balance: economyUsersTable.balance,
      bank:    economyUsersTable.bank,
    })
    .from(economyUsersTable)
    .orderBy(desc(sql`${economyUsersTable.balance} + ${economyUsersTable.bank}`))
    .limit(limit);
  return rows.map(r => ({ userId: r.userId, balance: r.balance, bank: r.bank }));
}
