import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../../artifacts/discord-bot/data/leveling.json");
const OUT_PATH  = join(__dirname, "../../restore-leveling.sql");

interface UserData {
  xp: number; level: number; totalXp: number; weeklyXp: number;
  lastMessageAt: number; lastMessageContent: string;
}
interface GuildConfig {
  enabled: boolean; xpMin: number; xpMax: number; cooldown: number;
  levelUpChannelId: string | null; announcements: boolean; pingOnLevelUp: boolean;
  keepOldRoles: boolean; blacklistedChannels: string[]; whitelistedChannels: string[];
  serverMultiplier: number; roleMultipliers: Record<string, number>; eventMultiplier: number;
}
interface LevelingData {
  configs: Record<string, GuildConfig>;
  users: Record<string, Record<string, UserData>>;
  levelRoles: Record<string, Record<string, string>>;
  lastWeeklyReset: number;
}

function esc(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const data: LevelingData = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const lines: string[] = [];

lines.push(`-- ============================================================`);
lines.push(`-- Leveling data restore`);
lines.push(`-- Generated: ${new Date().toISOString()}`);
lines.push(`-- Run this against your Railway PostgreSQL database.`);
lines.push(`-- ============================================================`);
lines.push(``);

// Tables
lines.push(`CREATE TABLE IF NOT EXISTS leveling_users (
  guild_id             TEXT   NOT NULL,
  user_id              TEXT   NOT NULL,
  xp                   INT    NOT NULL DEFAULT 0,
  level                INT    NOT NULL DEFAULT 0,
  total_xp             INT    NOT NULL DEFAULT 0,
  weekly_xp            INT    NOT NULL DEFAULT 0,
  last_message_at      BIGINT NOT NULL DEFAULT 0,
  last_message_content TEXT   NOT NULL DEFAULT '',
  PRIMARY KEY (guild_id, user_id)
);`);
lines.push(`CREATE TABLE IF NOT EXISTS leveling_configs (
  guild_id              TEXT    PRIMARY KEY,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  xp_min                INT     NOT NULL DEFAULT 15,
  xp_max                INT     NOT NULL DEFAULT 25,
  cooldown              INT     NOT NULL DEFAULT 60,
  level_up_channel_id   TEXT,
  announcements         BOOLEAN NOT NULL DEFAULT true,
  ping_on_level_up      BOOLEAN NOT NULL DEFAULT true,
  keep_old_roles        BOOLEAN NOT NULL DEFAULT true,
  blacklisted_channels  TEXT[]  NOT NULL DEFAULT '{}',
  whitelisted_channels  TEXT[]  NOT NULL DEFAULT '{}',
  server_multiplier     FLOAT   NOT NULL DEFAULT 1.0,
  role_multipliers      JSONB   NOT NULL DEFAULT '{}',
  event_multiplier      FLOAT   NOT NULL DEFAULT 1.0,
  anti_spam_enabled     BOOLEAN NOT NULL DEFAULT true
);`);
lines.push(`CREATE TABLE IF NOT EXISTS leveling_level_roles (
  guild_id  TEXT NOT NULL,
  level     INT  NOT NULL,
  role_name TEXT NOT NULL,
  PRIMARY KEY (guild_id, level)
);`);
lines.push(`CREATE TABLE IF NOT EXISTS leveling_meta (
  key      TEXT   PRIMARY KEY,
  int_val  BIGINT,
  json_val JSONB
);`);
lines.push(``);

// Guild configs
lines.push(`-- Guild configs`);
for (const [guildId, cfg] of Object.entries(data.configs)) {
  const chanId = cfg.levelUpChannelId ? esc(cfg.levelUpChannelId) : "NULL";
  const blacklist = `ARRAY[${cfg.blacklistedChannels.map(esc).join(",") || ""}]::TEXT[]`;
  const whitelist = `ARRAY[${cfg.whitelistedChannels.map(esc).join(",") || ""}]::TEXT[]`;
  const roleMulti = esc(JSON.stringify(cfg.roleMultipliers ?? {}));
  lines.push(
    `INSERT INTO leveling_configs ` +
    `(guild_id,enabled,xp_min,xp_max,cooldown,level_up_channel_id,announcements,ping_on_level_up,keep_old_roles,blacklisted_channels,whitelisted_channels,server_multiplier,role_multipliers,event_multiplier,anti_spam_enabled) ` +
    `VALUES (${esc(guildId)},${cfg.enabled},${cfg.xpMin},${cfg.xpMax},${cfg.cooldown},${chanId},${cfg.announcements},${cfg.pingOnLevelUp},${cfg.keepOldRoles},${blacklist},${whitelist},${cfg.serverMultiplier},${roleMulti}::jsonb,${cfg.eventMultiplier},true) ` +
    `ON CONFLICT (guild_id) DO UPDATE SET ` +
    `enabled=EXCLUDED.enabled,xp_min=EXCLUDED.xp_min,xp_max=EXCLUDED.xp_max,cooldown=EXCLUDED.cooldown,` +
    `level_up_channel_id=EXCLUDED.level_up_channel_id,announcements=EXCLUDED.announcements,` +
    `ping_on_level_up=EXCLUDED.ping_on_level_up,keep_old_roles=EXCLUDED.keep_old_roles,` +
    `blacklisted_channels=EXCLUDED.blacklisted_channels,whitelisted_channels=EXCLUDED.whitelisted_channels,` +
    `server_multiplier=EXCLUDED.server_multiplier,role_multipliers=EXCLUDED.role_multipliers,` +
    `event_multiplier=EXCLUDED.event_multiplier,anti_spam_enabled=EXCLUDED.anti_spam_enabled;`
  );
}
lines.push(``);

// Level roles
lines.push(`-- Level roles`);
for (const [guildId, roles] of Object.entries(data.levelRoles)) {
  for (const [level, roleName] of Object.entries(roles)) {
    lines.push(
      `INSERT INTO leveling_level_roles (guild_id,level,role_name) ` +
      `VALUES (${esc(guildId)},${Number(level)},${esc(roleName)}) ` +
      `ON CONFLICT (guild_id,level) DO UPDATE SET role_name=EXCLUDED.role_name;`
    );
  }
}
lines.push(``);

// Users
lines.push(`-- Users (${Object.values(data.users).reduce((n, u) => n + Object.keys(u).length, 0)} rows)`);
for (const [guildId, users] of Object.entries(data.users)) {
  for (const [userId, u] of Object.entries(users)) {
    const content = esc(u.lastMessageContent ?? "");
    lines.push(
      `INSERT INTO leveling_users ` +
      `(guild_id,user_id,xp,level,total_xp,weekly_xp,last_message_at,last_message_content) ` +
      `VALUES (${esc(guildId)},${esc(userId)},${u.xp},${u.level},${u.totalXp},${u.weeklyXp},${u.lastMessageAt},${content}) ` +
      `ON CONFLICT (guild_id,user_id) DO UPDATE SET ` +
      `xp=EXCLUDED.xp,level=EXCLUDED.level,total_xp=EXCLUDED.total_xp,` +
      `weekly_xp=EXCLUDED.weekly_xp,last_message_at=EXCLUDED.last_message_at,` +
      `last_message_content=EXCLUDED.last_message_content;`
    );
  }
}
lines.push(``);

// Weekly reset
if (data.lastWeeklyReset) {
  lines.push(`-- Weekly reset timestamp`);
  lines.push(
    `INSERT INTO leveling_meta (key,int_val) VALUES ('last_weekly_reset',${data.lastWeeklyReset}) ` +
    `ON CONFLICT (key) DO UPDATE SET int_val=EXCLUDED.int_val;`
  );
}

writeFileSync(OUT_PATH, lines.join("\n") + "\n");
console.log(`✅  SQL written to: ${OUT_PATH}`);
console.log(`    ${Object.keys(data.configs).length} guild config(s)`);
console.log(`    ${Object.values(data.levelRoles).reduce((n,r) => n + Object.keys(r).length, 0)} level roles`);
console.log(`    ${Object.values(data.users).reduce((n,u) => n + Object.keys(u).length, 0)} users`);
