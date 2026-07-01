import type { Message, ChatInputCommandInteraction } from "discord.js";
import { getUser, updateUser, allUsers } from "./storage.js";
import {
  ANIMAL_BY_ID, ANIMALS,
  MINERAL_BY_ID, MINERALS,
  GAMEPASS_BY_ID, GAMEPASS_DEFS,
  ENCHANTMENTS, ENCHANT_BY_ID,
} from "./data.js";
import { adminListAll, adminClearAll, fmtListingForAdmin } from "./market.js";
import { latestPendingEntry, markReleased, formatEntryFull } from "./updateLogs.js";

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// ─── Animal lookup ─────────────────────────────────────────────────────────────
const ANIMAL_LOOKUP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const a of ANIMALS) { m[norm(a.id)] = a.id; m[norm(a.name)] = a.id; }
  return m;
})();
function resolveAnimalId(q: string): string | null {
  if (!q) return null;
  return ANIMAL_LOOKUP[norm(q)] ?? null;
}

// ─── Area resolution ──────────────────────────────────────────────────────────
const AREA_ALIASES: Record<string, string> = {
  forest: "default", default: "default",
  volcanic: "volcanic", volcano: "volcanic",
  space: "space",
  heaven: "heaven", sky: "heaven",
  void: "void_unknown", "void_unknown": "void_unknown", unknown: "void_unknown",
  infinite: "infinite_void", "infinite_void": "infinite_void",
  infinitevoid: "infinite_void", iv: "infinite_void",
};
function resolveArea(q: string): string | null {
  return AREA_ALIASES[q.toLowerCase()] ?? null;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function ownerId(): string | null {
  const id = process.env.LOWO_OWNER_ID;
  return id && /^\d+$/.test(id) ? id : null;
}
function isOwner(uid: string): boolean { return ownerId() === uid; }
function isAdmin(uid: string): boolean {
  if (isOwner(uid)) return true;
  return getUser(uid).isAdmin === true;
}

// Same string the router emits for unknown commands — keeps admin gates invisible.
async function silentDeny(message: Message, sub: string): Promise<void> {
  await message.reply(`❓ Unknown lowo command \`${sub}\`. Try \`lowo help\`.`);
}

// Strip @mentions so they don't get parsed as values.
function stripMentionTokens(args: string[]): string[] {
  return args.filter((a) => !/^<@!?\d+>$/.test(a));
}

// ─── /*o*  — owner-only toggle ────────────────────────────────────────────────
export async function cmdAdminGrant(message: Message, args: string[]): Promise<void> {
  if (!isOwner(message.author.id)) { await silentDeny(message, "/*o*"); return; }
  const target = message.mentions.users.first();
  if (!target) {
    if (!ownerId()) {
      await message.reply("⚠️ `LOWO_OWNER_ID` env var is not set. Set it to your Discord user id, then use `lowo /*o* @user`.");
      return;
    }
    await message.reply("Usage: `lowo /*o* @user` — toggles admin status. *(Owner only.)*");
    return;
  }
  const newState = !getUser(target.id).isAdmin;
  updateUser(target.id, (x) => { x.isAdmin = newState; });
  await message.reply(`🔐 **${target.username}** admin status: ${newState ? "**GRANTED**" : "**REVOKED**"}.`);
}

// ─── /lowoadmin — slash command, password-gated admin grant ──────────────────
export async function executeLowoadmin(interaction: ChatInputCommandInteraction): Promise<void> {
  const pw = process.env.LOWO_ADMIN_PASSWORD;
  if (!pw) {
    await interaction.editReply("⚠️ `LOWO_ADMIN_PASSWORD` is not set on this deployment. Add it as an environment variable in Railway.");
    return;
  }
  const entered = interaction.options.getString("password", true);
  if (entered !== pw) {
    await interaction.editReply("❌ Incorrect password.");
    return;
  }
  const target = interaction.options.getUser("user", true);
  const newState = !getUser(target.id).isAdmin;
  updateUser(target.id, (x) => { x.isAdmin = newState; });
  await interaction.editReply(
    `🔐 **${target.username}** Lowo admin: ${newState ? "**GRANTED** ✅" : "**REVOKED** ❌"}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXISTING ADMIN COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function cmdSetMoney(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "setmoney"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^-?\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo setmoney @user <amount>`"); return; }
  const amt = Math.max(0, parseInt(amtStr, 10));
  updateUser(target.id, (x) => { x.cowoncy = amt; });
  await message.reply(`💰 Set **${target.username}**'s cowoncy to **${amt.toLocaleString()}**.`);
}

export async function cmdSetCash(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "setcash"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^-?\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo setcash @user <amount>`"); return; }
  const amt = Math.max(0, parseInt(amtStr, 10));
  updateUser(target.id, (x) => { x.lowoCash = amt; });
  await message.reply(`💎 Set **${target.username}**'s Lowo Cash to **${amt.toLocaleString()}**.`);
}

export async function cmdSpawnAnimal(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "spawnanimal"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  let count = 1;
  let nameTokens = cleaned;
  const last = cleaned[cleaned.length - 1];
  if (last && /^\d+$/.test(last)) { count = Math.max(1, parseInt(last, 10)); nameTokens = cleaned.slice(0, -1); }
  const id = resolveAnimalId(nameTokens.join(" "));
  if (!id) { await message.reply("Usage: `lowo spawnanimal @user <name> [count]`"); return; }
  const a = ANIMAL_BY_ID[id];
  updateUser(target.id, (x) => {
    x.zoo[id] = (x.zoo[id] ?? 0) + count;
    if (!x.dex.includes(id)) x.dex.push(id);
  });
  await message.reply(`🪄 Spawned ${count}× ${a.emoji} **${a.name}** for **${target.username}**.`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW ADMIN COMMANDS (20+)
// ═══════════════════════════════════════════════════════════════════════════════

// 1. addcowoncy — add cowoncy additively
export async function cmdAddCowoncy(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "addcowoncy"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^-?\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo addcowoncy @user <amount>`"); return; }
  const amt = parseInt(amtStr, 10);
  updateUser(target.id, (x) => { x.cowoncy = Math.max(0, (x.cowoncy ?? 0) + amt); });
  const sign = amt >= 0 ? "+" : "";
  await message.reply(`💰 **${sign}${amt.toLocaleString()}** cowoncy → **${target.username}** (new total: **${getUser(target.id).cowoncy.toLocaleString()}**).`);
}

// 2. setessence — set essence to exact value
export async function cmdSetEssence(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "setessence"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo setessence @user <amount>`"); return; }
  const amt = parseInt(amtStr, 10);
  updateUser(target.id, (x) => { x.essence = amt; });
  await message.reply(`✨ Set **${target.username}**'s essence to **${amt.toLocaleString()}**.`);
}

// 3. addessence — add essence additively
export async function cmdAddEssence(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "addessence"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^-?\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo addessence @user <amount>`"); return; }
  const amt = parseInt(amtStr, 10);
  updateUser(target.id, (x) => { x.essence = Math.max(0, (x.essence ?? 0) + amt); });
  const sign = amt >= 0 ? "+" : "";
  await message.reply(`✨ **${sign}${amt.toLocaleString()}** essence → **${target.username}** (new total: **${getUser(target.id).essence.toLocaleString()}**).`);
}

// 4. setbattletokens — set battle tokens
export async function cmdSetBattleTokens(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "setbattletokens"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo setbattletokens @user <amount>`"); return; }
  const amt = parseInt(amtStr, 10);
  updateUser(target.id, (x) => { x.battleTokens = amt; });
  await message.reply(`🪙 Set **${target.username}**'s Battle Tokens to **${amt.toLocaleString()}**.`);
}

// 5. setpetmaterials — set pet materials
export async function cmdSetPetMaterials(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "setpetmaterials"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo setpetmaterials @user <amount>`"); return; }
  const amt = parseInt(amtStr, 10);
  updateUser(target.id, (x) => { x.petMaterials = amt; });
  await message.reply(`🧬 Set **${target.username}**'s Pet Materials to **${amt.toLocaleString()}**.`);
}

// 6. resetcooldowns — reset all time-based cooldowns
export async function cmdResetCooldowns(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "resetcooldowns"); return; }
  const target = message.mentions.users.first() ?? message.author;
  updateUser(target.id, (x) => {
    x.lastHunt = 0;
    x.lastDaily = 0;
    x.lastBattle = 0;
    x.lastFish = 0;
    x.lastMine = 0;
    x.lastRep = 0;
  });
  await message.reply(`⏱️ All cooldowns reset for **${target.username}** (hunt, daily, battle, fish, mine, rep).`);
}

// 7. resetdaily — reset only the daily cooldown
export async function cmdResetDaily(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "resetdaily"); return; }
  const target = message.mentions.users.first() ?? message.author;
  updateUser(target.id, (x) => { x.lastDaily = 0; x.dailyStreak = Math.max(0, (x.dailyStreak ?? 0)); });
  await message.reply(`📅 Daily cooldown reset for **${target.username}** — they can claim now.`);
}

// 8. wipeanimals — wipe entire zoo (keeps dex)
export async function cmdWipeAnimals(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "wipeanimals"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  if (!cleaned.includes("CONFIRM")) {
    await message.reply("⚠️ This wipes **all animals** in the zoo. Add `CONFIRM` to proceed: `lowo wipeanimals @user CONFIRM`");
    return;
  }
  updateUser(target.id, (x) => { x.zoo = {}; x.team = []; });
  await message.reply(`🗑️ Zoo wiped for **${target.username}**. Dex entries were kept.`);
}

// 9. givebox — give crate boxes
export async function cmdGiveBox(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "givebox"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const VALID = ["bronze", "silver", "gold"] as const;
  type BoxType = typeof VALID[number];
  const tier = cleaned.find((a) => VALID.includes(a as BoxType)) as BoxType | undefined;
  if (!tier) { await message.reply("Usage: `lowo givebox @user <bronze|silver|gold> [count]`"); return; }
  const countStr = cleaned.find((a) => /^\d+$/.test(a));
  const count = countStr ? Math.max(1, parseInt(countStr, 10)) : 1;
  updateUser(target.id, (x) => { x.boxes[tier] = (x.boxes[tier] ?? 0) + count; });
  const emojis = { bronze: "🟫", silver: "⬜", gold: "🟨" };
  await message.reply(`${emojis[tier]} Gave **${count}× ${tier} crate** to **${target.username}**.`);
}

// 10. giveskill — add a pet active skill to ownedSkills
export async function cmdGiveSkill(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "giveskill"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const countStr = cleaned.find((a) => /^\d+$/.test(a));
  const count = countStr ? Math.max(1, parseInt(countStr, 10)) : 1;
  const skillId = cleaned.filter((a) => !/^\d+$/.test(a))[0];
  if (!skillId) { await message.reply("Usage: `lowo giveskill @user <skillId> [count]`\n_Use `lowo skillshop` to see skill IDs._"); return; }
  updateUser(target.id, (x) => { x.ownedSkills[skillId] = (x.ownedSkills[skillId] ?? 0) + count; });
  await message.reply(`🎯 Gave **${count}× \`${skillId}\`** skill to **${target.username}**.`);
}

// 11. unlockarea — force-unlock a hunt area
export async function cmdUnlockArea(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "unlockarea"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const areaRaw = cleaned[0];
  if (!areaRaw) { await message.reply("Usage: `lowo unlockarea @user <forest|volcanic|space|heaven|void>`"); return; }
  const area = resolveArea(areaRaw);
  if (!area) { await message.reply(`❌ Unknown area \`${areaRaw}\`. Options: \`forest\` \`volcanic\` \`space\` \`heaven\` \`void\``); return; }
  updateUser(target.id, (x) => {
    if (!x.unlockedAreas.includes(area)) x.unlockedAreas.push(area);
    // Also unlock all prerequisite areas in order
    const ORDER = ["default", "volcanic", "space", "heaven", "void_unknown", "infinite_void"];
    const idx = ORDER.indexOf(area);
    for (let i = 0; i <= idx; i++) {
      if (!x.unlockedAreas.includes(ORDER[i])) x.unlockedAreas.push(ORDER[i]);
    }
  });
  const AREA_EMOJIS: Record<string, string> = { default: "🌲", volcanic: "🌋", space: "🌌", heaven: "☁️", void_unknown: "🕳️", infinite_void: "👾" };
  await message.reply(`${AREA_EMOJIS[area] ?? "🗺️"} Unlocked **${area}** area (and all prerequisites) for **${target.username}**.`);
}

// 12. givepickaxe — give or upgrade pickaxe
export async function cmdGivePickaxe(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "givepickaxe"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const tierStr = cleaned.find((a) => /^[0-3]$/.test(a));
  const tier = tierStr !== undefined ? parseInt(tierStr, 10) : 3;
  const TIER_NAMES = ["Basic", "Iron", "Gold", "Diamond"];
  const TIER_EMOJIS = ["⛏️", "⛏️🔗", "⛏️🟡", "⛏️💎"];
  updateUser(target.id, (x) => { x.hasPickaxe = true; x.pickaxeTier = tier; });
  await message.reply(`${TIER_EMOJIS[tier]} Gave **${TIER_NAMES[tier]} Pickaxe** (tier ${tier}) to **${target.username}**.`);
}

// 13. giveenchant — give enchant tomes
export async function cmdGiveEnchant(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "giveenchant"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const countStr = cleaned.find((a) => /^\d+$/.test(a));
  const count = countStr ? Math.max(1, parseInt(countStr, 10)) : 1;
  const rawId = cleaned.filter((a) => !/^\d+$/.test(a))[0]?.toLowerCase();
  if (!rawId) {
    const list = ENCHANTMENTS.map((e) => `\`${e.id}\``).join(", ");
    await message.reply(`Usage: \`lowo giveenchant @user <enchantId> [count]\`\nValid IDs: ${list}`);
    return;
  }
  const enchant = ENCHANT_BY_ID[rawId];
  if (!enchant) {
    const list = ENCHANTMENTS.map((e) => `\`${e.id}\``).join(", ");
    await message.reply(`❌ Unknown enchant \`${rawId}\`. Valid: ${list}`);
    return;
  }
  updateUser(target.id, (x) => {
    x.enchantTomes[enchant.tomeShopId] = (x.enchantTomes[enchant.tomeShopId] ?? 0) + count;
  });
  await message.reply(`${enchant.emoji} Gave **${count}× ${enchant.name}** tome to **${target.username}**.`);
}

// 14. setgamepass — grant or revoke a permanent gamepass
export async function cmdSetGamepass(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "setgamepass"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const stateToken = cleaned.find((a) => a === "on" || a === "off" || a === "true" || a === "false");
  const passId = cleaned.find((a) => a !== stateToken);
  if (!passId) {
    const list = GAMEPASS_DEFS.map((g) => `\`${g.id}\``).join(", ");
    await message.reply(`Usage: \`lowo setgamepass @user <passId> on|off\`\nValid IDs: ${list}`);
    return;
  }
  const gp = GAMEPASS_BY_ID[passId];
  if (!gp) {
    const list = GAMEPASS_DEFS.map((g) => `\`${g.id}\``).join(", ");
    await message.reply(`❌ Unknown gamepass \`${passId}\`. Valid: ${list}`);
    return;
  }
  const newState = stateToken === "on" || stateToken === "true" || stateToken === undefined ? true : false;
  updateUser(target.id, (x) => { x.gamepasses[passId] = newState; });
  await message.reply(`${gp.emoji} Gamepass **${gp.name}** → **${newState ? "GRANTED ✅" : "REVOKED ❌"}** for **${target.username}**.`);
}

// 15. inspectuser — show a key-stats summary for any user
export async function cmdInspectUser(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "inspectuser"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const u = getUser(target.id);
  const now = Date.now();
  const cdLeft = (ts: number, ms: number) => {
    const left = ts + ms - now;
    return left > 0 ? `${Math.ceil(left / 60000)}m` : "ready";
  };
  const gps = Object.entries(u.gamepasses).filter(([, v]) => v).map(([k]) => k).join(", ") || "none";
  const lines = [
    `🔍 **Inspect: ${target.username}** (${target.id})`,
    `💰 Cowoncy: **${u.cowoncy.toLocaleString()}** | ✨ Essence: **${u.essence.toLocaleString()}** | 💎 Lowo Cash: **${u.lowoCash.toLocaleString()}**`,
    `🪙 Battle Tokens: **${u.battleTokens.toLocaleString()}** | 🧬 Pet Materials: **${u.petMaterials.toLocaleString()}**`,
    `🐾 Zoo: **${Object.keys(u.zoo).length}** species | Dex: **${u.dex.length}** | Team: **${u.team.length}** pets`,
    `📊 Hunts: **${u.huntsTotal}** | Boss Kills: **${u.bossKills}** | SB Wins: **${u.sbWins}** / Losses: **${u.sbLosses}**`,
    `🗺️ Area: **${u.huntArea}** | Unlocked: **${u.unlockedAreas.join(", ")}**`,
    `⏱️ Hunt CD: ${cdLeft(u.lastHunt, 45000)} | Daily CD: ${cdLeft(u.lastDaily, 86400000)} | Battle CD: ${cdLeft(u.lastBattle, 10000)}`,
    `⛏️ Pickaxe: **tier ${u.pickaxeTier}** (${u.hasPickaxe ? "owned" : "none"}) | 🎯 Pity: **${u.pity}**`,
    `🎮 Gamepasses: ${gps}`,
    `🔐 Admin: **${u.isAdmin}** | 🚫 Banned: **${(u as any).lowoBanned ?? false}**`,
  ];
  await message.reply(lines.join("\n"));
}

// 16. listadmins — list all users with isAdmin=true
export async function cmdListAdmins(message: Message, _args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "listadmins"); return; }
  const users = allUsers();
  const admins = Object.entries(users).filter(([, u]) => u.isAdmin);
  if (admins.length === 0) {
    await message.reply("📋 No Lowo admins set (besides the bot owner via `LOWO_OWNER_ID`).");
    return;
  }
  const lines = admins.map(([id]) => `• <@${id}> (\`${id}\`)`);
  await message.reply(`🔐 **Lowo Admins** (${admins.length}):\n${lines.join("\n")}`);
}

// 17. resetuser — full data reset (requires CONFIRM)
export async function cmdResetUser(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "resetuser"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  if (!cleaned.includes("CONFIRM")) {
    await message.reply("⚠️ **This fully resets ALL Lowo data** for the user. Add `CONFIRM` to proceed:\n`lowo resetuser @user CONFIRM`");
    return;
  }
  updateUser(target.id, (x) => {
    x.cowoncy = 0; x.essence = 0; x.lowoCash = 0; x.battleTokens = 0;
    x.petMaterials = 0; x.zoo = {}; x.team = []; x.dex = [];
    x.weapons = []; x.armor = []; x.accessories = []; x.equippedArmor = {};
    x.equipped = {}; x.equippedAccessory = {};
    x.lastHunt = 0; x.lastDaily = 0; x.lastBattle = 0; x.lastFish = 0;
    x.lastMine = 0; x.lastRep = 0; x.huntsTotal = 0; x.bossKills = 0;
    x.pity = 0; x.dailyStreak = 0; x.rep = 0;
    x.ownedSkills = { basic_strike: 1 }; x.petSkills = {};
    x.gamepasses = {}; x.enchantTomes = {}; x.enchantments = {};
    x.mutations = {}; x.opChests = {}; x.minerals = {}; x.boxes = {};
    x.unlockedAreas = ["default"]; x.huntArea = "default";
    x.aquarium = {}; x.fishDex = []; x.volcanicDex = []; x.spaceDex = [];
    x.heavenDex = []; x.voidUnknownDex = []; x.craftedWeapons = [];
    x.autoSell = []; x.lifetimeCowoncy = 0;
    x.hasPickaxe = false; x.pickaxeTier = 0;
    x.extraTeamSlots = 0; x.fusionPetCount = 0; x.ownedGamepassesPurchased = 0;
    x.sbWins = 0; x.sbLosses = 0; x.sbInvite = null; x.sbActive = null;
    x.isAdmin = false; (x as any).lowoBanned = false;
    x.luckUntil = 0; x.megaLuckUntil = 0; x.hasteUntil = 0; x.shieldUntil = 0; x.dinoSummonUntil = 0;
    x.tag = null; x.background = null; x.marriedTo = null;
  });
  await message.reply(`🔄 **${target.username}**'s Lowo data has been **fully reset** to default.`);
}

// 18. wipeinv — wipe weapons, armor, accessories
export async function cmdWipeInv(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "wipeinv"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  if (!cleaned.includes("CONFIRM")) {
    await message.reply("⚠️ This wipes all **weapons, armor, accessories**. Add `CONFIRM`:\n`lowo wipeinv @user CONFIRM`");
    return;
  }
  updateUser(target.id, (x) => {
    x.weapons = []; x.armor = []; x.accessories = [];
    x.equipped = {}; x.equippedArmor = {}; x.equippedAccessory = {};
    x.craftedWeapons = [];
  });
  await message.reply(`🗑️ Inventory (weapons/armor/accessories) wiped for **${target.username}**.`);
}

// 19. addminerals — add minerals to a user
export async function cmdAddMinerals(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "addminerals"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const countStr = cleaned.find((a) => /^\d+$/.test(a));
  const count = countStr ? Math.max(1, parseInt(countStr, 10)) : 1;
  const mineralId = cleaned.filter((a) => !/^\d+$/.test(a))[0]?.toLowerCase();
  if (!mineralId) {
    const list = MINERALS.map((m) => `\`${m.id}\``).join(", ");
    await message.reply(`Usage: \`lowo addminerals @user <mineralId> [count]\`\nValid: ${list}`);
    return;
  }
  const mineral = MINERAL_BY_ID[mineralId];
  if (!mineral) {
    const list = MINERALS.map((m) => `\`${m.id}\``).join(", ");
    await message.reply(`❌ Unknown mineral \`${mineralId}\`. Valid: ${list}`);
    return;
  }
  updateUser(target.id, (x) => { x.minerals[mineralId] = (x.minerals[mineralId] ?? 0) + count; });
  await message.reply(`${mineral.emoji} Gave **${count}× ${mineral.name}** to **${target.username}**.`);
}

// 20. setpity — set the pity counter
export async function cmdSetPity(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "setpity"); return; }
  const target = message.mentions.users.first() ?? message.author;
  const cleaned = stripMentionTokens(args);
  const amtStr = cleaned.find((a) => /^\d+$/.test(a));
  if (!amtStr) { await message.reply("Usage: `lowo setpity @user <amount>` *(0 = reset, 100/200 = near guaranteed)*"); return; }
  const amt = parseInt(amtStr, 10);
  updateUser(target.id, (x) => { x.pity = amt; });
  await message.reply(`🎯 Set **${target.username}**'s pity counter to **${amt}**.`);
}

// 21. toggleban — ban or unban a user from using lowo commands
export async function cmdToggleBan(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "toggleban"); return; }
  const target = message.mentions.users.first();
  if (!target) { await message.reply("Usage: `lowo toggleban @user`"); return; }
  const u = getUser(target.id);
  const newState = !((u as any).lowoBanned ?? false);
  updateUser(target.id, (x) => { (x as any).lowoBanned = newState; });
  await message.reply(`🚫 **${target.username}** Lowo ban: ${newState ? "**BANNED** 🔒 — they cannot use any lowo commands." : "**UNBANNED** ✅ — access restored."}`);
}

// ─── VOID ASCENSION (v6) — admin marketplace tools ───────────────────────────
export async function cmdCheckMarket(message: Message, _args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "checkmarket"); return; }
  const all = adminListAll();
  if (!all.length) { await message.reply("📭 The marketplace is empty."); return; }
  const lines = [`🛡️ **Marketplace — ALL Listings** *(${all.length})*`];
  for (const l of all.slice(0, 30)) lines.push(`• ${fmtListingForAdmin(l)}`);
  if (all.length > 30) lines.push(`\n_…and ${all.length - 30} more._`);
  const text = lines.join("\n");
  if (text.length <= 1950) { await message.reply(text); return; }
  await message.reply(text.slice(0, 1950));
  const ch = message.channel;
  if ("send" in ch) await ch.send(text.slice(1950).trim().slice(0, 1950)).catch(() => {});
}

export async function cmdClearListings(message: Message, args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "clearlistings"); return; }
  const confirm = args.find((a) => a.toUpperCase() === "CONFIRM");
  if (!confirm) {
    await message.reply("⚠️ This will refund every pet to its seller and wipe the entire marketplace.\nType `lowo clearlistings CONFIRM` to proceed.");
    return;
  }
  const { cleared } = adminClearAll();
  await message.reply(`🧹 Cleared **${cleared}** marketplace listing(s) and refunded every pet to its seller.`);
}

// ─── VOID ASCENSION (v6) — `lowo update` publishes pending update entry ──────
export async function cmdPublishUpdate(message: Message, _args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) {
    // Public command (documented in v6 changelog), so be explicit instead of silent.
    const ownerSet = !!ownerId();
    const lines = [
      "🔒 **`lowo update` is admin-only.**",
      "",
      ownerSet
        ? "Ask the bot owner to grant you admin via `lowo /*o* @you` (owner only) or `/lowoadmin user:@you password:***`."
        : "⚠️ The bot owner hasn't set `LOWO_OWNER_ID` on Railway yet — without it nobody can grant admin via `lowo /*o*`. Set that env var to your Discord user id, redeploy, then run `lowo /*o* @you`. Alternatively set `LOWO_ADMIN_PASSWORD` and use `/lowoadmin`.",
    ];
    await message.reply(lines.join("\n"));
    return;
  }
  const pending = latestPendingEntry();
  if (!pending) {
    await message.reply("📭 No pending update to publish. *(Run `lowo updatelogs` to see what's already public.)*");
    return;
  }
  markReleased(pending.version);
  const announce = `📣 **NEW LOWO UPDATE PUBLISHED** — by **${message.author.username}**\n\n${formatEntryFull(pending)}`;
  // Auto-chunk if huge.
  const MAX = 1950;
  if (announce.length <= MAX) { await message.reply(announce); return; }
  let cut = announce.lastIndexOf("\n", MAX);
  if (cut < 1000) cut = MAX;
  await message.reply(announce.slice(0, cut));
  const ch = message.channel;
  if ("send" in ch) {
    let rem = announce.slice(cut).trim();
    while (rem.length) {
      let take = rem.length;
      if (take > MAX) {
        take = rem.lastIndexOf("\n", MAX);
        if (take < 1000) take = MAX;
      }
      await ch.send(rem.slice(0, take)).catch(() => {});
      rem = rem.slice(take).trim();
    }
  }
}

// 22. alladmincmds — show the full admin command reference
/**
 * `lowo cashaudit [reset]`
 * Lists every user with lowoCash > 10,000 (impossible without exploitation).
 * Append `reset` to immediately clamp all flagged balances back to 10,000.
 */
export async function cmdCashAudit(message: Message, args: string[]): Promise<void> {
  if (!isOwner(message.author.id)) { await silentDeny(message, "cashaudit"); return; }
  const CASH_HARD_CAP = 10_000;
  const doReset = (args[0] ?? "").toLowerCase() === "reset";
  const users = allUsers();
  const flagged = Object.entries(users)
    .filter(([, u]) => (u.lowoCash ?? 0) > CASH_HARD_CAP)
    .sort((a, b) => (b[1].lowoCash ?? 0) - (a[1].lowoCash ?? 0));

  if (flagged.length === 0) {
    await message.reply(`✅ **Cash Audit clean** — no user exceeds ${CASH_HARD_CAP.toLocaleString()} 💎 Cash.`);
    return;
  }
  const lines = [`⚠️ **Cash Audit — ${flagged.length} flagged user(s)${doReset ? " (RESETTING to cap)" : ""}:**`];
  for (const [id, u] of flagged) {
    if (doReset) {
      updateUser(id, (x) => { x.lowoCash = CASH_HARD_CAP; });
    }
    lines.push(`<@${id}> — 💎 \`${(u.lowoCash ?? 0).toLocaleString()}\`${doReset ? ` → reset to \`${CASH_HARD_CAP.toLocaleString()}\`` : ""}`);
  }
  if (!doReset) lines.push(`\nRun \`lowo cashaudit reset\` to clamp all flagged balances to \`${CASH_HARD_CAP.toLocaleString()}\`.`);
  await message.reply(lines.join("\n").slice(0, 1990));
}

export async function cmdAdminHelp(message: Message, _args: string[]): Promise<void> {
  if (!isAdmin(message.author.id)) { await silentDeny(message, "adminhelp"); return; }
  const lines = [
    "🔐 **LOWO ADMIN COMMANDS** *(admin-only, not shown in public help)*",
    "",
    "**Economy**",
    "• `lowo setmoney @u <n>` — set cowoncy to exact value",
    "• `lowo addcowoncy @u <n>` — add/subtract cowoncy",
    "• `lowo setcash @u <n>` — set Lowo Cash",
    "• `lowo setessence @u <n>` — set essence",
    "• `lowo addessence @u <n>` — add/subtract essence",
    "• `lowo setbattletokens @u <n>` — set battle tokens",
    "• `lowo setpetmaterials @u <n>` — set pet materials",
    "",
    "**Animals & Inventory**",
    "• `lowo spawnanimal @u <name> [n]` — spawn animals into zoo",
    "• `lowo wipeanimals @u CONFIRM` — wipe entire zoo",
    "• `lowo wipeinv @u CONFIRM` — wipe weapons/armor/accessories",
    "• `lowo givebox @u <bronze|silver|gold> [n]` — give crates",
    "• `lowo addminerals @u <mineralId> [n]` — add minerals",
    "",
    "**Skills, Areas & Gear**",
    "• `lowo giveskill @u <skillId> [n]` — add pet skill",
    "• `lowo unlockarea @u <area>` — force-unlock hunt area",
    "• `lowo givepickaxe @u [tier 0-3]` — give pickaxe",
    "• `lowo giveenchant @u <enchantId> [n]` — give enchant tome",
    "• `lowo setgamepass @u <passId> on|off` — grant/revoke gamepass",
    "",
    "**Cooldowns & Stats**",
    "• `lowo resetcooldowns @u` — reset all cooldowns",
    "• `lowo resetdaily @u` — reset daily claim only",
    "• `lowo setpity @u <n>` — set pity counter",
    "",
    "**User Management**",
    "• `lowo inspectuser @u` — view key stats",
    "• `lowo listadmins` — list all Lowo admins",
    "• `lowo toggleban @u` — ban/unban from lowo",
    "• `lowo resetuser @u CONFIRM` — full data reset",
    "• `lowo /*o* @u` — owner-only admin toggle (no password)",
    "",
    "**Marketplace (v6)**",
    "• `lowo checkmarket` — list every active marketplace listing",
    "• `lowo clearlistings CONFIRM` — wipe all listings & refund pets",
    "",
    "**Update Log (v6)**",
    "• `lowo update` — publish the latest pending update entry to this channel",
    "",
    "**Slash Command**",
    "• `/lowoadmin user:@u password:***` — grant/revoke admin (password-gated)",
  ];
  const text = lines.join("\n");
  if (text.length <= 1950) {
    await message.reply(text);
  } else {
    await message.reply(text.slice(0, 1950));
    const ch = message.channel;
    if ("send" in ch) await ch.send(text.slice(1950).trim()).catch(() => {});
  }
}
