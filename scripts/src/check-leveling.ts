import pg from "pg";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false },
  });

  const { rows: users } = await pool.query(
    `SELECT guild_id, user_id, level, total_xp FROM leveling_users ORDER BY total_xp DESC LIMIT 15`
  );
  console.log(`\n=== leveling_users (top 15 by total_xp) — ${users.length} rows shown ===`);
  console.table(users);

  const { rows: total } = await pool.query(`SELECT COUNT(*) as count FROM leveling_users`);
  console.log(`Total user rows in DB: ${total[0].count}`);

  const { rows: cfg } = await pool.query(`SELECT * FROM leveling_configs`);
  console.log(`\n=== leveling_configs ===`);
  console.table(cfg);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
