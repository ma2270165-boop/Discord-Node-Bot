import pg from "pg";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: total } = await pool.query(`SELECT COUNT(*) as count FROM leveling_users`);
  console.log(`Total user rows: ${total[0].count}`);

  const { rows } = await pool.query(
    `SELECT user_id, level, total_xp, xp FROM leveling_users WHERE guild_id = '1479910330669990025' ORDER BY total_xp DESC LIMIT 10`
  );
  console.log("\nTop 10 users by total_xp:");
  console.table(rows);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
