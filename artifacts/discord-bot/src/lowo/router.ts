import type { Message } from "discord.js";
import { isLowoEnabled } from "./toggle.js";
import { dispatchOwoCommand } from "./owoMode.js";
import { cmdCowoncy, cmdDaily, cmdGive, cmdVote, cmdRep, cmdTag, cmdCash } from "./economy.js";
import { cmdHunt, cmdZoo, cmdSell, cmdSacrifice, cmdLowodex } from "./hunt.js";
import { cmdAutoSell, cmdBulkSell, cmdAnimalStat } from "./autoSell.js";
import { cmdTeam, cmdBattle, cmdCrate, cmdWeapon, cmdEquip } from "./battle.js";
import { cmdSlots, cmdCoinflip, cmdBlackjack, cmdLottery } from "./gambling.js";
import { cmdPiku, cmdPikuReset, cmdPet, cmdFeed } from "./minigames.js";
import { cmdHug, cmdKiss, cmdSlap, cmdPat, cmdCuddle, cmdPoke, cmdPropose, cmdDivorce, cmdLowoify, cmdShip } from "./social.js";
import { cmdShop, cmdBuy, cmdSetBg } from "./shop.js";
import * as Emotes from "./emotes.js";
import * as Actions from "./actions.js";
import * as Memes from "./memes.js";
import * as Util from "./utility.js";
import { cmdQuest, cmdChecklist } from "./quests.js";
import { cmdProfile, cmdLevel, cmdAvatar, cmdWallpaper, cmdEmoji, cmdCookie, cmdPray, cmdCurse, cmdTop, cmdMy, cmdCard, cmdEmojiList, cmdEmojiSync, cmdEmojiUpload } from "./profile.js";
import { cmdAutohunt, cmdLootbox, cmdBox, cmdInv, cmdRename, cmdDismantle, cmdBattlesetting } from "./extra.js";
import { cmdSkills } from "./skills.js";
import { cmdEvent } from "./events.js";
import { cmdTrade } from "./trade.js";
import { cmdFish } from "./fish.js";
import {
  cmdAdminGrant, cmdSetMoney, cmdSetCash, cmdSpawnAnimal,
  cmdAddCowoncy, cmdSetEssence, cmdAddEssence,
  cmdSetBattleTokens, cmdSetPetMaterials,
  cmdResetCooldowns, cmdResetDaily,
  cmdWipeAnimals, cmdGiveBox, cmdGiveSkill,
  cmdUnlockArea, cmdGivePickaxe, cmdGiveEnchant,
  cmdSetGamepass, cmdInspectUser, cmdListAdmins,
  cmdResetUser, cmdWipeInv, cmdAddMinerals,
  cmdSetPity, cmdToggleBan, cmdAdminHelp, cmdCashAudit,
  cmdCheckMarket, cmdClearListings, cmdPublishUpdate,
} from "./admin.js";
// ─── VOID ASCENSION (v6) — new public modules ────────────────────────────────
import { cmdInteract, cmdPetMood } from "./sentientPets.js";
import { cmdMarket } from "./market.js";
import { cmdPrestige } from "./prestige.js";
import { cmdForge } from "./forge.js";
import { cmdCorrupt } from "./corrupt.js";
import { cmdVoidShop } from "./voidshop.js";
import { cmdUpdateLogs } from "./updateLogs.js";
import { setCensored, isCensored } from "./censor.js";
import { isSocialsEnabled, setSocialsEnabled } from "./socials.js";
import { cmdElements, cmdSummon, cmdSetEternalCode, cmdSetEternalOwner, cmdEternalStatus, cmdEternalBoard } from "./elements.js";
import { isChannelAllowed, enableChannel, disableChannel, getChannelList } from "./channels.js";

import { getUser } from "./storage.js";
import { PermissionFlagsBits } from "discord.js";
// ─── New v3 modules ──────────────────────────────────────────────────────────
import { cmdArea } from "./areas.js";
import { cmdMine, cmdMinerals, cmdSellMineral } from "./mine.js";
import { cmdCraft } from "./crafting.js";
import { cmdSkillShop, cmdLearnSkill, cmdMySkills, cmdEquipSkill, cmdPetSkills } from "./petSkills.js";
import { cmdSkillBattle, cmdSBAttack } from "./skillBattle.js";
import { cmdAttackBoss, cmdBossInfo, recordLowoActivity } from "./bosses.js";
import { cmdAquarium, cmdFishDex } from "./aquarium.js";
import { cmdRecycle, cmdMaterials, cmdFuse } from "./pets.js";
// ─── MASSIVE LOWO UPDATE — new modules ──────────────────────────────────────
import { cmdEnchant } from "./enchant.js";
import { cmdOpOpen, cmdReroll, cmdMutation } from "./opItems.js";
import { isDynamic } from "./dynamic.js";
import { suggestClosest } from "./suggest.js";

type Handler = (m: Message, args: string[]) => Promise<void>;

async function cmdCensor(message: Message, args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase();
  if (!message.guildId) { await message.reply("❌ Server-only command."); return; }
  if (!sub) {
    const on = isCensored(message.guildId);
    await message.reply(`🤫 Lowo censor on this server: **${on ? "ON" : "OFF"}**\n_Usage: \`lowo censor on|off\` (admin)_`);
    return;
  }
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply("❌ You need **Manage Server** permission.");
    return;
  }
  if (sub === "on" || sub === "enable") {
    setCensored(message.guildId, true);
    await message.reply("🤫 Censor **enabled** — `lewd, kill, bully, slap, punch, bite, curse, fuck` are blocked here.");
  } else if (sub === "off" || sub === "disable") {
    setCensored(message.guildId, false);
    await message.reply("✅ Censor **disabled** — all commands allowed.");
  } else {
    await message.reply("Usage: `lowo censor on|off`");
  }
}

async function cmdSocials(message: Message, args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase();
  if (!message.guildId) { await message.reply("❌ Server-only command."); return; }
  if (!sub) {
    const on = isSocialsEnabled(message.guildId);
    await message.reply(`💕 Social features on this server: **${on ? "ON" : "OFF"}**\n_Usage: \`lowo socials on|off\` (admin)_`);
    return;
  }
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply("❌ You need **Manage Server** permission.");
    return;
  }
  if (sub === "on" || sub === "enable") {
    setSocialsEnabled(message.guildId, true);
    await message.reply("💕 Social features **enabled** — hug, kiss, pat, emotes, actions and more are active.");
  } else if (sub === "off" || sub === "disable") {
    setSocialsEnabled(message.guildId, false);
    await message.reply("🔒 Social features **disabled** — all social, emote, and action commands are turned off on this server.");
  } else {
    await message.reply("Usage: `lowo socials on|off`");
  }
}

function socialGuard(handler: Handler): Handler {
  return async (message, args) => {
    if (!isSocialsEnabled(message.guildId)) {
      await message.reply("🔒 Social features are **disabled** on this server. An admin can run `lowo socials on` to enable them.");
      return;
    }
    return handler(message, args);
  };
}

async function cmdChannelEnable(message: Message, _args: string[]): Promise<void> {
  if (!message.guildId) { await message.reply("❌ Server-only command."); return; }
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply("❌ You need **Manage Channels** permission.");
    return;
  }
  enableChannel(message.guildId, message.channelId);
  await message.reply("✅ Lowo System Online in this channel.");
}

async function cmdChannelDisable(message: Message, _args: string[]): Promise<void> {
  if (!message.guildId) { await message.reply("❌ Server-only command."); return; }
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply("❌ You need **Manage Channels** permission.");
    return;
  }
  disableChannel(message.guildId, message.channelId);
  const remaining = getChannelList(message.guildId);
  const msg = remaining.length === 0
    ? `🔇 All channels disabled. Lowo is now **SILENT** in this server. Use \`lowo enable all\` in a channel to reactivate.`
    : `🔇 Lowo disabled in this channel. ${remaining.length} channel(s) still enabled.`;
  await message.reply(msg);
}

async function cmdChannelList(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) { await message.reply("❌ Server-only command."); return; }
  const sub = args[0]?.toLowerCase();
  if (sub === "list") {
    const list = getChannelList(message.guildId);
    if (list.length === 0) {
      await message.reply("📋 No channel restrictions set — Lowo responds everywhere on this server.");
    } else {
      const lines = list.map((id) => `• <#${id}>`).join("\n");
      await message.reply(`📋 **Lowo-enabled channels on this server:**\n${lines}`);
    }
    return;
  }
  await message.reply("Usage: `lowo channel list`");
}

const HANDLERS: Record<string, Handler> = {
  // economy
  cowoncy: cmdCowoncy, bal: cmdCowoncy, balance: cmdCowoncy, money: cmdCowoncy,
  daily: cmdDaily, d: cmdDaily, give: cmdGive, send: cmdGive, vote: cmdVote,
  rep: cmdRep, tag: cmdTag,
  cash: cmdCash, c: cmdCash,
  // hunt / inventory
  hunt: cmdHunt, h: cmdHunt,
  zoo: cmdZoo, z: cmdZoo,
  sell: cmdSell, s: cmdSell, sacrifice: cmdSacrifice, sac: cmdSacrifice,
  lowodex: cmdLowodex, dex: cmdLowodex,
  // HOTFIX v5.1 — auto-sell, bulk sell, animal stat lookup
  autosell: cmdAutoSell, as: cmdAutoSell,
  bulk: cmdBulkSell, bulksell: cmdBulkSell,
  animalstat: cmdAnimalStat, astat: cmdAnimalStat, animal: cmdAnimalStat, info: cmdAnimalStat,
  // areas
  area: cmdArea, areas: cmdArea, region: cmdArea,
  // fishing + aquarium
  fish: cmdFish, f: cmdFish,
  aquarium: cmdAquarium, aq: cmdAquarium, tank: cmdAquarium,
  fishdex: cmdFishDex, fd: cmdFishDex,
  // mining + crafting
  mine: cmdMine, m: cmdMine,
  minerals: cmdMinerals, ore: cmdMinerals, ores: cmdMinerals,
  sellmineral: cmdSellMineral, sm: cmdSellMineral, sellore: cmdSellMineral,
  craft: cmdCraft, recipes: cmdCraft, recipe: cmdCraft,
  // pet skills
  skillshop: cmdSkillShop, learnskill: cmdLearnSkill, learn: cmdLearnSkill,
  myskills: cmdMySkills, equipskill: cmdEquipSkill,
  petskills: cmdPetSkills, petskill: cmdPetSkills, ps: cmdPetSkills,
  // PvP skill battle
  sb: cmdSkillBattle, skillbattle: cmdSkillBattle,
  sba: cmdSBAttack, sbattack: cmdSBAttack,
  // World bosses
  attackboss: cmdAttackBoss, ab: cmdAttackBoss, hitboss: cmdAttackBoss,
  boss: cmdBossInfo, bossinfo: cmdBossInfo,
  // ─── THE NEW ERA — pet recycling + 100-pet fusion system ──────────────────
  recycle: cmdRecycle, rec: cmdRecycle, breakdown: cmdRecycle,
  materials: cmdMaterials, mats: cmdMaterials, mat: cmdMaterials,
  fuse: cmdFuse, fusion: cmdFuse,
  // battle
  team: cmdTeam, t: cmdTeam, battle: cmdBattle, b: cmdBattle,
  crate: cmdCrate, weapon: cmdWeapon, weapons: cmdWeapon, w: cmdWeapon,
  equip: cmdEquip, eq: cmdEquip,
  // gambling
  slots: cmdSlots, slot: cmdSlots, coinflip: cmdCoinflip, cf: cmdCoinflip,
  blackjack: cmdBlackjack, bj: cmdBlackjack, lottery: cmdLottery,
  // minigames
  piku: cmdPiku, pikureset: cmdPikuReset, pet: cmdPet, feed: cmdFeed,
  // social (guarded — off by default can be toggled with `lowo socials on|off`)
  hug: socialGuard(cmdHug), kiss: socialGuard(cmdKiss), slap: socialGuard(cmdSlap),
  pat: socialGuard(cmdPat), cuddle: socialGuard(cmdCuddle), poke: socialGuard(cmdPoke),
  propose: socialGuard(cmdPropose), marry: socialGuard(cmdPropose),
  divorce: socialGuard(cmdDivorce),
  lowoify: socialGuard(cmdLowoify), ship: socialGuard(cmdShip),
  // shop
  shop: cmdShop, buy: cmdBuy, setbg: cmdSetBg, background: cmdSetBg,
  // quests
  quest: cmdQuest, quests: cmdQuest, q: cmdQuest, checklist: cmdChecklist, cl: cmdChecklist,
  // profile / rankings
  profile: cmdProfile, p: cmdProfile, my: cmdMy, top: cmdTop, leaderboard: cmdTop, lb: cmdTop,
  level: cmdLevel, lvl: cmdLevel, avatar: cmdAvatar, av: cmdAvatar,
  wallpaper: cmdWallpaper, emoji: cmdEmoji, cookie: cmdCookie, pray: cmdPray, curse: cmdCurse,
  emojis: cmdEmojiList, emojilist: cmdEmojiList, emojikeys: cmdEmojiList,
  emojisync: cmdEmojiSync, syncemojis: cmdEmojiSync, esync: cmdEmojiSync,
  emojiupload: cmdEmojiUpload, uploademoji: cmdEmojiUpload, uploademojis: cmdEmojiUpload, eup: cmdEmojiUpload,
  card: cmdCard,
  // extra inventory / battle
  autohunt: cmdAutohunt, ah: cmdAutohunt,
  lootbox: cmdLootbox, lb2: cmdLootbox,
  box: cmdBox, boxes: cmdBox, open: cmdBox,
  inv: cmdInv, inventory: cmdInv, i: cmdInv,
  rename: cmdRename, dismantle: cmdDismantle, battlesetting: cmdBattlesetting, bs: cmdBattlesetting,
  // skills + events + censor
  skills: cmdSkills, skill: cmdSkills, sk: cmdSkills,
  event: cmdEvent, events: cmdEvent, ev: cmdEvent,
  censor: cmdCensor,
  socials: cmdSocials,
  enable: cmdChannelEnable,
  disable: cmdChannelDisable,
  channel: cmdChannelList,
  // trading
  trade: cmdTrade, tr: cmdTrade,
  // utility
  "8b": Util.cmd8ball, "8ball": Util.cmd8ball, roll: Util.cmdRoll, choose: Util.cmdChoose,
  define: Util.cmdDefine, gif: Util.cmdGif, pic: Util.cmdPic, translate: Util.cmdTranslate,
  bell: Util.cmdBell, math: Util.cmdMath, color: Util.cmdColor, ping: Util.cmdPing, stats: Util.cmdStats,
  // emotes — guarded by socials toggle
  blush: socialGuard(Emotes.cmdBlush), cry: socialGuard(Emotes.cmdCry),
  dance: socialGuard(Emotes.cmdDance), lewd: socialGuard(Emotes.cmdLewd),
  pout: socialGuard(Emotes.cmdPout), shrug: socialGuard(Emotes.cmdShrug),
  sleepy: socialGuard(Emotes.cmdSleepy), smile: socialGuard(Emotes.cmdSmile),
  smug: socialGuard(Emotes.cmdSmug), thumbsup: socialGuard(Emotes.cmdThumbsup),
  thumbs: socialGuard(Emotes.cmdThumbsup), wag: socialGuard(Emotes.cmdWag),
  thinking: socialGuard(Emotes.cmdThinking), triggered: socialGuard(Emotes.cmdTriggered),
  teehee: socialGuard(Emotes.cmdTeehee), deredere: socialGuard(Emotes.cmdDeredere),
  thonking: socialGuard(Emotes.cmdThonking), scoff: socialGuard(Emotes.cmdScoff),
  happy: socialGuard(Emotes.cmdHappy), grin: socialGuard(Emotes.cmdGrin),
  // actions (target @user) — guarded by socials toggle
  lick: socialGuard(Actions.cmdLick), nom: socialGuard(Actions.cmdNom),
  stare: socialGuard(Actions.cmdStare), highfive: socialGuard(Actions.cmdHighfive),
  bite: socialGuard(Actions.cmdBite), greet: socialGuard(Actions.cmdGreet),
  punch: socialGuard(Actions.cmdPunch), handholding: socialGuard(Actions.cmdHandholding),
  tickle: socialGuard(Actions.cmdTickle), kill: socialGuard(Actions.cmdKill),
  hold: socialGuard(Actions.cmdHold), pats: socialGuard(Actions.cmdPats),
  wave: socialGuard(Actions.cmdWave), boop: socialGuard(Actions.cmdBoop),
  snuggle: socialGuard(Actions.cmdSnuggle), bully: socialGuard(Actions.cmdBully),
  fuck: socialGuard(Actions.cmdFuck), frick: socialGuard(Actions.cmdFuck),
  fk: socialGuard(Actions.cmdFuck),
  // memes
  spongebobchicken: Memes.cmdSpongebobChicken, slapcar: Memes.cmdSlapcar, isthisa: Memes.cmdIsthisa,
  drake: Memes.cmdDrake, distractedbf: Memes.cmdDistractedbf, communismcat: Memes.cmdCommunismcat,
  eject: Memes.cmdEject, emergencymeeting: Memes.cmdEmergencyMeeting, headpat: Memes.cmdHeadpat,
  tradeoffer: Memes.cmdTradeoffer, waddle: Memes.cmdWaddle,
  // ─── MASSIVE LOWO UPDATE — new commands ────────────────────────────────────
  enchant: cmdEnchant, ench: cmdEnchant, enchantments: cmdEnchant,
  mutation: cmdMutation, mutations: cmdMutation, mut: cmdMutation,
  op_open: cmdOpOpen, opopen: cmdOpOpen,
  reroll: cmdReroll, rr: cmdReroll,
  // ─── VOID ASCENSION (v6) ────────────────────────────────────────────────
  interact: cmdInteract, play: cmdInteract, talk: cmdInteract,
  petmood: cmdPetMood, mood: cmdPetMood, loyalty: cmdPetMood,
  market: cmdMarket, mk: cmdMarket, mkt: cmdMarket, marketplace: cmdMarket,
  prestige: cmdPrestige, ascend: cmdPrestige, ascension: cmdPrestige,
  // ─── VOID CORRUPTIONS (v6.2) ────────────────────────────────────────────
  forge: cmdForge, smelt: cmdForge, relic: cmdForge, relics: cmdForge,
  corrupt: cmdCorrupt, corruption: cmdCorrupt, corrupted: cmdCorrupt, void: cmdCorrupt,
  voidshop: cmdVoidShop, vshop: cmdVoidShop, shardshop: cmdVoidShop,
  updatelogs: cmdUpdateLogs, changelog: cmdUpdateLogs, changelogs: cmdUpdateLogs, news: cmdUpdateLogs,
  // ─── ETERNAL ELEMENTS (endgame) ─────────────────────────────────────────────
  elements: cmdElements, el: cmdElements, eternalelements: cmdElements,
  summon: cmdSummon,
  eternalboard: cmdEternalBoard, elboard: cmdEternalBoard, elementsboard: cmdEternalBoard,
  // ─── Hidden admin (NOT in HELP_TEXT) ──────────────────────────────────────
  "/*o*": cmdAdminGrant,
  // existing
  setmoney: cmdSetMoney,
  setcash: cmdSetCash,
  spawnanimal: cmdSpawnAnimal, spawn: cmdSpawnAnimal,
  // economy
  addcowoncy: cmdAddCowoncy, givemoney: cmdAddCowoncy,
  setessence: cmdSetEssence,
  addessence: cmdAddEssence, giveessence: cmdAddEssence,
  setbattletokens: cmdSetBattleTokens, setbt: cmdSetBattleTokens,
  setpetmaterials: cmdSetPetMaterials, setpm: cmdSetPetMaterials,
  // animals & inventory
  wipeanimals: cmdWipeAnimals, wipezoo: cmdWipeAnimals,
  givebox: cmdGiveBox, giveboxes: cmdGiveBox,
  addminerals: cmdAddMinerals, giveminerals: cmdAddMinerals,
  wipeinv: cmdWipeInv, wipeinventory: cmdWipeInv,
  // skills, areas & gear
  giveskill: cmdGiveSkill,
  unlockarea: cmdUnlockArea, forcearea: cmdUnlockArea,
  givepickaxe: cmdGivePickaxe,
  giveenchant: cmdGiveEnchant,
  setgamepass: cmdSetGamepass, givepass: cmdSetGamepass,
  // cooldowns & stats
  resetcooldowns: cmdResetCooldowns, resetcd: cmdResetCooldowns,
  resetdaily: cmdResetDaily,
  setpity: cmdSetPity,
  // user management
  inspectuser: cmdInspectUser, inspect: cmdInspectUser,
  listadmins: cmdListAdmins,
  resetuser: cmdResetUser,
  toggleban: cmdToggleBan, banuser: cmdToggleBan, unbanuser: cmdToggleBan,
  // ── VOID ASCENSION (v6) admin tools ──
  checkmarket: cmdCheckMarket, marketcheck: cmdCheckMarket,
  clearlistings: cmdClearListings, clearmarket: cmdClearListings, wipemarket: cmdClearListings,
  update: cmdPublishUpdate, publishupdate: cmdPublishUpdate, releaseupdate: cmdPublishUpdate,
  // help
  adminhelp: cmdAdminHelp, admincmds: cmdAdminHelp,
  cashaudit: cmdCashAudit,
  seteternalcode: cmdSetEternalCode, eternalcode: cmdSetEternalCode,
  seteternalowner: cmdSetEternalOwner, eternalowner: cmdSetEternalOwner,
  eternalstatus: cmdEternalStatus,
};

// ─── MASSIVE LOWO UPDATE — categorized help. `lowo help` shows category index;
//     `lowo help <category>` shows that section. Update-log section removed. ──
const HELP_CATEGORIES: Record<string, { title: string; lines: string[] }> = {
  basics: {
    title: "💰 Basics & Economy",
    lines: [
      "**Economy** — `cowoncy` `cash`(c) `daily` `give @u <amt>` `vote` `rep @u` `tag <text>`",
      "**Profile** — `profile`(p) `card` `level` `top [cowoncy|essence|dex|animals|rep|streak]` `inv`(i)",
      "**Quests** — `quest`(q) `checklist`(cl) — *resets daily 00:00 UTC*",
      "**Events** — `event` *(check active global event — including the 10 mutation events)*",
    ],
  },
  hunt: {
    title: "🎯 Hunt, Areas & Mutations",
    lines: [
      "**Hunt / Zoo** — `hunt`(h) `zoo`(z) `sell`(s) `<name> [n|all]` `sacrifice`(sac) `<name>` `lowodex`(dex)",
      "**Above-Omni Bonus** — every catch of a rarity *strictly above Omni* drops **+1 🪙 Lowo Cash** instantly. The 50-hunt milestone bonus still applies on top.",
      "**Auto-Sell** — `autosell <rarity>`(as) toggles a rarity • `autosell list` / `autosell clear`. Caught animals of that rarity are sold instantly (Dex still credits!).",
      "**Bulk Sell** — `bulk sell <rarity>` (or `bulksell <rarity>`) sells every animal of that rarity in your zoo at once.",
      "**Animal Lookup** — `animalstat <name>`(astat / animal / info) shows price, damage range, HP/DEF/MAG, signature ability.",
      "**Dex Filter** — `dex <area>` or `dex <1..5>` (1=Forest, 2=Volcanic, 3=Space, 4=Heaven, 5=Unknown Void).",
      "**Auto** — `autohunt`(ah) — *2-min interval (1-min with Auto-Hunt Upgrade gamepass), ½ luck*",
      "**Hunt Areas** — `area` to view & switch — Forest (default), 🌋 Volcanic, 🌌 Space, ☁️ Heaven *(4th)*, 🕳️ Unknown Void *(5th)* — unlock by completing the previous area's dex.",
      "**Fishing** — `fish`(f) — fish go to your **aquarium** • `aquarium`(aq) view tank • `fishdex`(fd) fish-only dex",
      "**Mutations** — only roll during one of the 10 mutation events. View with `mutation list` / `mutation view <petId>`. Mutations multiply sell value AND stats.",
    ],
  },
  battle: {
    title: "⚔️ Battle, Team, Bosses",
    lines: [
      "**Team** — `team add|remove|view <name>` *(default 3 slots, expand to 6 via `lowo shop team_slots`)*",
      "**Battle** — `battle`(b) [@user] — rewards 🪙 Battle Tokens.",
      "**Skill Battle** — `sb @user`, opponent `sb accept`, then `sba <skillId>`.",
      "**Coop World Boss** — spawns when 3+ players use lowo in 10m. `boss` view, `attackboss <skillId>`(ab) hit. **Top damage dealer on a kill is awarded a SUPREME boss-pet drop.**",
      "**Settings** — `battlesetting instant` • `rename <i> <name>` • `dismantle <i>`",
    ],
  },
  pets: {
    title: "🐾 Pets, Skills, Attributes",
    lines: [
      "**Pet Skills** — `skills <petId>` shows the skill tree. *(High-rarity pets render an image card.)*",
      "**Attributes** — every above-ethereal pet has a unique attribute (luck or team-stat boost) shown on `skills <petId>`.",
      "**Pet Skill Slots** — `skillshop` `learnskill <id>` `myskills` `petskills <pet>` `equipskill <pet> <slot 1-5> <skillId>`",
      "**Recycling + Fusion** — `recycle`(rec) `<name> [n|all]` → 🧬 Pet Materials. `materials`(mats) view count. `fuse <petA> + <petB>` combines 2 pets + 50 🧬 → random fusion pet (100 unique fusions).",
      "**💞 Sentient Pets (v6)** — `interact <pet>` *(play / talk)* raises mood & loyalty *(1h cd)* • `petmood [pet]` view stats • Devoted pets (loyalty ≥ 800) find hidden minerals/boxes on hunts.",
      "**🌟 Ascension (v6)** — `prestige <pet>` *(alias `ascend`)* — at level cap, costs 50,000 ✨ to reset Lv 1 with **DOUBLE one random stat forever**. Stack up to ×16 on a single stat.",
    ],
  },
  market: {
    title: "🛒 Global Marketplace (v6)",
    lines: [
      "**Browse** — `market` shows newest listings • `market search <rarity>` filters",
      "**Sell** — `market post <pet name> <price>` — 48h auto-expiry, 5% market tax, cap 10 per user",
      "**Buy** — `market buy <listingId>` — pet & dex transfer instantly",
      "**Manage** — `market mine` view yours • `market cancel <id>` pull a listing back",
    ],
  },
  gear: {
    title: "🛡️ Weapons, Armor, Mining, Craft",
    lines: [
      "**Weapons** — `weapon`(w) • `weapon rr <i>` *(reroll, 50 ✨)* • `crate` *(2500 cwn)*",
      "**Equip** — `equip <pet> [weapon|armor|accessory] <idx>` *(crafted: `c<idx>`)*",
      "**Mining** — `mine`(m) `minerals`(ore) `sellmineral <id> [n|all]` *(buy a Pickaxe first)*",
      "**Crafting** — `craft` (list) • `craft <recipeId>` (build)",
      "**Accessories** — 3rd equip slot, buy from `lowo shop pets`",
    ],
  },
  enchant: {
    title: "📕 Enchantments",
    lines: [
      "**List** — `enchant list` shows every tome and its essence cost.",
      "**Apply** — `enchant <petId> <enchantId>` — needs an unused tome from `lowo shop enchant` AND essence.",
      "**View** — `enchant view <petId>` shows the active enchant on that pet.",
      "**Tomes** — Blessed, Savage, Mystic, Swift, Eternal, Godslayer — six tiers from cheap stat boosts to +50% all-stats with team luck.",
    ],
  },
  shop: {
    title: "🛒 Shop & OP Items",
    lines: [
      "**Shop** — `shop [items|potions|events|equips|pets|mining|skills|gamepasses|essence|team_slots|enchant|op_expensive|premium]` `buy <id> [cash]`",
      "**OP Expensive** — `lowo shop op_expensive` — pet chests (`op_open <chestId>`), Attribute Seal (`reroll <petId>`), Dino Summon Stone, Essence Brick.",
      "**Team Slots** — `lowo shop team_slots` — buy 4th, 5th, and 6th team slots.",
      "**Backgrounds** — `setbg <id>` *(see `lowo shop pets` for available backgrounds)*",
      "**Boxes** — `box bronze|silver|gold` open • buy via `lowo buy bronze|silver|gold`",
    ],
  },
  social: {
    title: "💕 Social, Trade, Gambling, Misc",
    lines: [
      "**Social** — `hug|kiss|slap|pat|cuddle|poke @u` `propose @u` `divorce` `ship @a [@b]` `lowoify <text>`",
      "**Trade** — `trade @u` → `trade add cowoncy|essence|animal|weapon …` → both `trade confirm`",
      "**Gambling** — `slots <amt>` `coinflip h|t <amt>` `blackjack <amt>` `lottery info|buy <n>`",
      "**Pets/Garden** — `piku` `pikureset` `pet` `feed`",
      "**Mod** — `censor on|off` · `socials on|off` *(server admin)*",
      "**Utility** — `8b <q>` `roll` `choose a,b,c` `define <w>` `gif <q>` `pic` `math` `color` `ping` `stats`",
      "**Emotes** — `blush cry dance lewd pout shrug sleepy smile smug thumbsup wag thinking triggered teehee deredere thonking scoff happy grin`",
      "**Actions** — `lick nom stare highfive bite greet punch handholding tickle kill hold pats wave boop snuggle bully fuck`",
      "**Memes** — `spongebobchicken slapcar isthisa drake distractedbf communismcat eject emergencymeeting headpat tradeoffer waddle`",
    ],
  },
};

const HELP_INDEX = [
  "🦊 **LOWO COMMANDS** *(prefix: `lowo`)*",
  "Use `lowo help <category>` to view a section:",
  "",
  ...Object.entries(HELP_CATEGORIES).map(([k, v]) => `• \`lowo help ${k}\` — ${v.title}`),
  "",
  "_Tip: misspelled a command? I'll suggest the closest match._",
].join("\n");

function helpFor(cat: string): string {
  const c = HELP_CATEGORIES[cat];
  if (!c) return HELP_INDEX;
  return [`**${c.title}**`, "", ...c.lines].join("\n");
}

// Commands that always work regardless of channel whitelist.
// Includes channel-toggle commands (so admins can never lock themselves out)
// and all hidden admin commands.
const CHANNEL_BYPASS = new Set([
  // channel toggle (self-recovery)
  "enable", "disable", "channel",
  // admin / owner commands
  "/*o*",
  "setmoney", "setcash", "spawnanimal", "spawn",
  "addcowoncy", "givemoney",
  "setessence", "addessence", "giveessence",
  "setbattletokens", "setbt",
  "setpetmaterials", "setpm",
  "wipeanimals", "wipezoo",
  "givebox", "giveboxes",
  "addminerals", "giveminerals",
  "resetcooldowns", "resetcd",
  "resetdaily",
  "giveskill",
  "unlockarea",
  "givepickaxe",
  "giveenchant",
  "setgamepass",
  "inspect", "inspectuser",
  "listadmins",
  "resetuser",
  "wipeinv",
  "setpity",
  "toggleban",
  "adminhelp", "admincmds",
  "cashaudit",
  "checkmarket", "marketcheck",
  "clearlistings", "clearmarket", "wipemarket",
  "update", "publishupdate", "releaseupdate",
  // moderation (must work in any channel)
  "warn", "clearwarn", "removewarn", "unwarn",
]);

// ─── Lowo Mode state — persisted in memory; survives process restart via bot_kv ─
// Mode 1 = normal Lowo (default), Mode 2 = OWO bot replacement
let _lowoMode: 1 | 2 = 1;
export function getLowoMode(): 1 | 2 { return _lowoMode; }
export function setLowoMode(m: 1 | 2): void { _lowoMode = m; }

export async function handleLowoCommand(message: Message): Promise<boolean> {
  if (message.author.bot) return false;
  const content = message.content.trim();
  const lower = content.toLowerCase();
  if (!lower.startsWith("lowo ") && lower !== "lowo") return false;
  if (!isLowoEnabled()) return false;

  // ─── Mode 1/2 switch — owner-only, bypass all other guards ───────────────
  const OWNER_ID = process.env.LOWO_OWNER_ID ?? "";
  {
    const peek = lower.split(/\s+/);
    const sub2 = peek[1] ?? "";
    if (sub2 === "2" || sub2 === "1") {
      if (message.author.id !== OWNER_ID) {
        await message.reply("🚫 Only the Lowo owner can switch modes.").catch(() => {});
        return true;
      }
      if (sub2 === "2") {
        _lowoMode = 2;
        await message.reply(
          "**🔁 | Lowo Mode switched to OwO Mode (Mode 2).**\n" +
          "The Lowo system has been replaced with the OwO bot.\n" +
          "Use the `lowo` prefix for all commands (e.g. `lowo hunt`, `lowo daily`).\n" +
          "Type `lowo 1` to return to normal Lowo."
        ).catch(() => {});
      } else {
        _lowoMode = 1;
        await message.reply(
          "**🔁 | Lowo Mode restored to normal (Mode 1).**\n" +
          "The Lowo system is back. Use the `lowo` prefix as usual."
        ).catch(() => {});
      }
      return true;
    }
  }

  // ─── Mode 2 — OWO replacement: route `lowo <cmd>` straight to OWO handlers ─
  if (_lowoMode === 2) {
    const parts2 = content.split(/\s+/);
    parts2.shift(); // drop "lowo"
    const sub2owo = parts2.shift()?.toLowerCase() ?? "help";
    return dispatchOwoCommand(message, sub2owo, parts2);
  }

  // ─── Channel whitelist middleware ─────────────────────────────────────────
  // Peek at the sub-command before full parsing so we can apply bypass rules.
  {
    const peek = content.toLowerCase().split(/\s+/);
    peek.shift(); // drop "lowo"
    const peekSub = peek[0] ?? "";
    if (!CHANNEL_BYPASS.has(peekSub) && !isChannelAllowed(message.guildId, message.channelId)) {
      return true; // silently ignore — this channel is not on the whitelist
    }
  }

  // Banned users cannot use any lowo commands
  if (getUser(message.author.id).lowoBanned) {
    await message.reply("🚫 You have been banned from using Lowo commands.").catch(() => {});
    return true;
  }

  const parts = content.split(/\s+/);
  parts.shift(); // remove "lowo"
  const sub = parts.shift()?.toLowerCase();
  const args = parts;

  if (!sub || sub === "help" || sub === "?") {
    const cat = (args[0] ?? "").toLowerCase();
    const text = cat ? helpFor(cat) : HELP_INDEX;
    const MAX = 1950;
    if (text.length <= MAX) {
      await message.reply(text);
    } else {
      let cut = text.lastIndexOf("\n\n", MAX);
      if (cut < 1000) cut = MAX;
      await message.reply(text.slice(0, cut));
      const ch = message.channel;
      if ("send" in ch) await ch.send(text.slice(cut).trim().slice(0, 1950)).catch(() => {});
    }
    return true;
  }
  const handler = HANDLERS[sub];
  if (!handler) {
    // v6.2 — clean & compact "did-you-mean" line that auto-deletes.
    const known = Object.keys(HANDLERS);
    const matches = suggestClosest(sub, known, 3);
    const tail = matches.length
      ? ` — did you mean ${matches.map((m) => `\`lowo ${m}\``).join(" / ")}?`
      : ` — try \`lowo help\`.`;
    const dynTag = isDynamic(message.guildId) ? "  *(dynamic on)*" : "";
    const reply = await message.reply({
      content: `❓ Unknown command \`${sub}\`${tail}${dynTag}`,
      allowedMentions: { repliedUser: false, parse: [] },
    }).catch(() => null);
    if (reply) setTimeout(() => { reply.delete().catch(() => {}); }, 6000);
    return true;
  }
  try {
    await handler(message, args);
    // Track activity for the world-boss spawner (cooperative coop trigger).
    recordLowoActivity(message);
  } catch (err) {
    console.error("[LOWO]", sub, err);
    await message.reply("⚠️ Something went wrong.").catch(() => {});
  }
  return true;
}
