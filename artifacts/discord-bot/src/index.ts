import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  Interaction,
  Routes,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  MessageFlags,
  REST,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import http from "http";
import { initPersistence, flushAll } from "./persistence.js";
import { handleMewoCommand } from "./mewo/router.js";

import { data as setupPanelData, execute as setupPanelExecute } from "./commands/setupChallengePanel.js";
import { handleEndCommand } from "./commands/endRaid.js";
import { handleKillCommand } from "./fun/killCommand.js";
import { handleNsfwCommand } from "./commands/nsfw.js";
import { handleCaptionCommand } from "./commands/caption.js";
import { handleCreateTicket } from "./tickets/ticketFlow.js";
import { handleCloseTicket, handleDeleteTicket } from "./tickets/ticketControls.js";
import {
  setupLeaderboardData,
  addPlayerData,
  removePlayerData,
  editPlayerData,
  executeAddPlayer,
  executeRemovePlayer,
  executeEditPlayer,
} from "./leaderboard/commands.js";
import { executeSetupLeaderboard } from "./leaderboard/display.js";
import {
  setupMobileLeaderboardData,
  addMobilePlayerData,
  removeMobilePlayerData,
  editMobilePlayerData,
  executeAddMobilePlayer,
  executeRemoveMobilePlayer,
  executeEditMobilePlayer,
} from "./leaderboard/mobileCommands.js";
import { executeSetupMobileLeaderboard } from "./leaderboard/mobileDisplay.js";
import {
  executeSetupKillLeaderboard,
  refreshPinnedKillLeaderboard,
  setupKillLeaderboardData,
} from "./killLeaderboard/display.js";
import {
  addKillPlayerData,
  editKillPlayerData,
  moveKillPlayerData,
  removeKillPlayerData,
  executeAddKillPlayer,
  executeEditKillPlayer,
  executeMoveKillPlayer,
  executeRemoveKillPlayer,
} from "./killLeaderboard/commands.js";

import { startRaidData, executeStartRaid, endRaidData, executeEndRaid } from "./raids/index.js";
import { raidAnnounceData, executeRaidAnnounce } from "./raids/announce.js";
import {
  rankData, executeRank,
  leaderboardLevelData, executeLeaderboard,
  weeklyLbData, executeWeeklyLb,
  addXpData, executeAddXp,
  removeXpData, executeRemoveXp,
  setXpData, executeSetXp,
  resetXpData, executeResetXp,
  exportDataData, executeExportData,
  setLevelRoleData, executeSetLevelRole,
  removeLevelRoleData, executeRemoveLevelRole,
  setXpCooldownData, executeSetXpCooldown,
  setXpRangeData, executeSetXpRange,
  setXpChannelData, executeSetXpChannel,
  setMultiplierData, executeSetMultiplier,
  blacklistChannelData, executeBlacklistChannel,
  whitelistChannelData, executeWhitelistChannel,
  xpConfigData, executeXpConfig,
  levelRolesData, executeLevelRoles,
  startLsXpSystemData, executeStartLsXpSystem,
  stopLsXpSystemData, executeStopLsXpSystem,
} from "./leveling/commands.js";
import { processMessage } from "./leveling/engine.js";
import {
  universalLeaderboardData,
  executeUniversalLeaderboard,
  handleUniversalLeaderboardSelect,
} from "./leveling/universalLeaderboard.js";
import { helpData, executeHelp } from "./commands/help.js";
import { handlePurgeCommand, purgeConfigData, executePurgeConfig } from "./moderation/purge.js";
import { handleLowoCommand } from "./lowo/router.js";
import { handleAssystCommand } from "./commands/assyst.js";
import { saveOverrides, catalogKeys } from "./lowo/emojis.js";
import { formatShopCategory } from "./lowo/shop.js";
import { SHOP_CATEGORIES, type ShopCategory } from "./lowo/data.js";
import { SHOP_BUTTON_PREFIX, ZOO_BUTTON_PREFIX } from "./lowo/embeds.js";
import { buildZooPage } from "./lowo/hunt.js";
import {
  lowoEnableData, lowoDisableData, executeLowoEnable, executeLowoDisable,
  lowoDynamicEnableData, lowoDynamicDisableData, executeLowoDynamicEnable, executeLowoDynamicDisable,
  lowoadminData, executeLowoadmin,
} from "./lowo/slashCommands.js";
import { isLowoEnabled } from "./lowo/toggle.js";
import { startLowoCron } from "./lowo/cron.js";
import { startWeeklyResetScheduler } from "./leveling/weekly.js";
import { trainingData, executeTraining } from "./training/index.js";
import {
  announceData, executeAnnounce,
  warnData, executeWarn,
  clearwarnsData, executeClearWarns,
  promoteData, executePromote,
  demoteData, executeDemote,
  attendanceData, executeAttendance,
  pollData, executePoll,
  mvpData, executeMvp,
  suggestionData, executeSuggestion,
} from "./utility/index.js";
import { backupDbData, executeBackupDb } from "./utility/backup.js";
import { setupRulesData, executeSetupRules } from "./rules/index.js";
import {
  dashboardData,
  executeDashboard,
  handleDashboardButton,
  handleDashboardSelect,
} from "./leveling/dashboard.js";
import {
  closeTournamentData,
  executeCloseTournament,
  executeTournament,
  tournamentData,
} from "./tournament/index.js";
import {
  censorData,
  executeCensor,
  stopcensorData,
  executeStopCensor,
} from "./moderation/commands.js";
import { handleModerationMessage } from "./moderation/monitor.js";
import { scan } from "./moderation/detector.js";
import {
  kickData, executeKick,
  banData, executeBan,
  tempbanData, executeTempban,
  muteData, executeMute,
  unmuteData, executeUnmute,
  timeoutData, executeTimeout,
  purgeData, executePurge,
  slowmodeData, executeSlowmode,
  lockData, executeLock,
  unlockData, executeUnlock,
  warningsData, executeWarnings,
} from "./moderation/modActions.js";
import {
  setupData, executeSetup,
  prefixData, executePrefix,
  setroleData, executeSetrole,
  adminBackupData, executeAdminBackup,
  embedData, executeEmbed,
} from "./admin/commands.js";
import {
  userinfoData, executeUserinfo,
  serverinfoData, executeServerinfo,
  avatarData, executeAvatar,
  roleinfoData, executeRoleinfo,
  reminderData, executeReminder,
  afkData, executeAfk,
  botinfoData, executeBotinfo,
  pingData, executePing,
  channelinfoData, executeChannelinfo,
  translateData, executeTranslate,
  timeData, executeTime,
  getAfkStatus, clearAfk,
} from "./utility/utilCommands.js";
import {
  playData, executePlay,
  pauseData, executePause,
  resumeData, executeResume,
  skipData, executeSkip,
  queueData, executeQueue,
  volumeData, executeVolume,
  nowplayingData, executeNowplaying,
  shuffleData, executeShuffle,
  loopData, executeLoop,
  stopData, executeStop,
} from "./music/commands.js";
import { upsertMessageActivity, upsertVoiceActivity } from "./activity/db.js";
import { handleOAuthCallback, handleOAuthConfirm, handleOAuthCancel } from "./verification/webCallback.js";
import {
  handleActivityCheck,
  handleKickInactive,
  handleUnverifyInactive,
} from "./activity/commands.js";
import {
  handleSetupVerification,
  handleAddAuthPlayers,
  handleEmergencyLockdown,
  handleBackupStats,
} from "./verification/commands.js";
import { handleHelp67 } from "./help67.js";
import { handleAddRoleToAllChannels } from "./admin/commands.js";
import { handleAdminPanel, handleAbcdAdmin, logAdminToken } from "./admin/panel.js";
import { handleDmCommand } from "./admin/dm.js";
import { handleRoleAllCandc } from "./admin/roleAllChannels.js";
import { registerAntiNukeEvents, handleAntiNukeCommand } from "./antinuke/index.js";

const token = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set. Exiting.");
  process.exit(1);
}

const BOT_DISPLAY_NAME = "Last Stand Management";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration, // required for GuildBanAdd event
  ],
});

// Pre-warmed REST client — same undici connection pool, no TLS cold-start per interaction
const rest = new REST({ version: "10" }).setToken(token);

const commands = [
  setupPanelData.toJSON(),
  setupLeaderboardData.toJSON(),
  addPlayerData.toJSON(),
  removePlayerData.toJSON(),
  editPlayerData.toJSON(),
  setupMobileLeaderboardData.toJSON(),
  addMobilePlayerData.toJSON(),
  removeMobilePlayerData.toJSON(),
  editMobilePlayerData.toJSON(),
  setupKillLeaderboardData.toJSON(),
  addKillPlayerData.toJSON(),
  editKillPlayerData.toJSON(),
  removeKillPlayerData.toJSON(),
  moveKillPlayerData.toJSON(),
  startRaidData.toJSON(),
  endRaidData.toJSON(),
  raidAnnounceData.toJSON(),
  trainingData.toJSON(),
  announceData.toJSON(),
  warnData.toJSON(),
  clearwarnsData.toJSON(),
  promoteData.toJSON(),
  demoteData.toJSON(),
  attendanceData.toJSON(),
  pollData.toJSON(),
  mvpData.toJSON(),
  suggestionData.toJSON(),
  setupRulesData.toJSON(),
  tournamentData.toJSON(),
  closeTournamentData.toJSON(),
  censorData.toJSON(),
  stopcensorData.toJSON(),
  rankData.toJSON(),
  leaderboardLevelData.toJSON(),
  weeklyLbData.toJSON(),
  addXpData.toJSON(),
  removeXpData.toJSON(),
  setXpData.toJSON(),
  resetXpData.toJSON(),
  exportDataData.toJSON(),
  backupDbData.toJSON(),
  setLevelRoleData.toJSON(),
  removeLevelRoleData.toJSON(),
  setXpCooldownData.toJSON(),
  setXpRangeData.toJSON(),
  setXpChannelData.toJSON(),
  setMultiplierData.toJSON(),
  blacklistChannelData.toJSON(),
  whitelistChannelData.toJSON(),
  xpConfigData.toJSON(),
  levelRolesData.toJSON(),
  startLsXpSystemData.toJSON(),
  stopLsXpSystemData.toJSON(),
  dashboardData.toJSON(),
  universalLeaderboardData.toJSON(),
  // Moderation actions
  kickData.toJSON(),
  banData.toJSON(),
  tempbanData.toJSON(),
  muteData.toJSON(),
  unmuteData.toJSON(),
  timeoutData.toJSON(),
  purgeData.toJSON(),
  slowmodeData.toJSON(),
  lockData.toJSON(),
  unlockData.toJSON(),
  warningsData.toJSON(),
  // Admin
  setupData.toJSON(),
  prefixData.toJSON(),
  setroleData.toJSON(),
  adminBackupData.toJSON(),
  embedData.toJSON(),
  // Utility
  userinfoData.toJSON(),
  serverinfoData.toJSON(),
  avatarData.toJSON(),
  roleinfoData.toJSON(),
  reminderData.toJSON(),
  afkData.toJSON(),
  botinfoData.toJSON(),
  pingData.toJSON(),
  channelinfoData.toJSON(),
  translateData.toJSON(),
  timeData.toJSON(),
  // Music
  playData.toJSON(),
  pauseData.toJSON(),
  resumeData.toJSON(),
  skipData.toJSON(),
  queueData.toJSON(),
  volumeData.toJSON(),
  nowplayingData.toJSON(),
  shuffleData.toJSON(),
  loopData.toJSON(),
  stopData.toJSON(),
];

const baseCommands = [
  ...commands,
  helpData.toJSON(),
  purgeConfigData.toJSON(),
  lowoEnableData.toJSON(),
  lowoDisableData.toJSON(),
  lowoDynamicEnableData.toJSON(),
  lowoDynamicDisableData.toJSON(),
  lowoadminData.toJSON(),
];

function buildCommandList(): unknown[] {
  return [...baseCommands];
}

// Defined once at startup — not recreated on every interaction
const slashHandlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
  setupchallengepanel: setupPanelExecute,
  setupleaderboard: (i) => executeSetupLeaderboard(i, client),
  addleaderboardplayer: (i) => executeAddPlayer(i, client),
  removeleaderboardplayer: (i) => executeRemovePlayer(i, client),
  editleaderboardplayer: (i) => executeEditPlayer(i, client),
  setupmobileleaderboard: (i) => executeSetupMobileLeaderboard(i, client),
  addmobileplayer: (i) => executeAddMobilePlayer(i, client),
  removemobileplayer: (i) => executeRemoveMobilePlayer(i, client),
  editmobileplayer: (i) => executeEditMobilePlayer(i, client),
  setupkillleaderboard: (i) => executeSetupKillLeaderboard(i, client),
  addkillplayer: (i) => executeAddKillPlayer(i, client),
  editkillplayer: (i) => executeEditKillPlayer(i, client),
  removekillplayer: (i) => executeRemoveKillPlayer(i, client),
  movek: (i) => executeMoveKillPlayer(i, client),
  startraid: executeStartRaid,
  endraid: executeEndRaid,
  raidannounce: executeRaidAnnounce,
  training: executeTraining,
  announce: executeAnnounce,
  warn: executeWarn,
  clearwarns: executeClearWarns,
  promote: executePromote,
  demote: executeDemote,
  attendance: executeAttendance,
  poll: executePoll,
  mvp: executeMvp,
  suggestion: executeSuggestion,
  setuprules: executeSetupRules,
  tournament: executeTournament,
  closetournamey: executeCloseTournament,
  censor: executeCensor,
  stopcensor: executeStopCensor,
  rank: executeRank,
  levellb: executeLeaderboard,
  weeklylb: executeWeeklyLb,
  addxp: executeAddXp,
  removexp: executeRemoveXp,
  setxp: executeSetXp,
  resetxp: executeResetXp,
  exportdata: executeExportData,
  backupdb: executeBackupDb,
  setlevelrole: executeSetLevelRole,
  removelevelrole: executeRemoveLevelRole,
  setxpcooldown: executeSetXpCooldown,
  setxprange: executeSetXpRange,
  setxpchannel: executeSetXpChannel,
  setmultiplier: executeSetMultiplier,
  blacklistchannel: executeBlacklistChannel,
  whitelistchannel: executeWhitelistChannel,
  xpconfig: executeXpConfig,
  levelroles: executeLevelRoles,
  startlsxpsystem: executeStartLsXpSystem,
  stoplsxpsystem: executeStopLsXpSystem,
  dashboard: executeDashboard,
  leaderboard: executeUniversalLeaderboard,
  // Moderation actions
  kick: executeKick,
  ban: executeBan,
  tempban: executeTempban,
  mute: executeMute,
  unmute: executeUnmute,
  timeout: executeTimeout,
  purge: executePurge,
  slowmode: executeSlowmode,
  lock: executeLock,
  unlock: executeUnlock,
  warnings: executeWarnings,
  // Admin
  setup: executeSetup,
  prefix: executePrefix,
  setrole: executeSetrole,
  backup: executeAdminBackup,
  embed: executeEmbed,
  // Utility
  userinfo: executeUserinfo,
  serverinfo: executeServerinfo,
  avatar: executeAvatar,
  roleinfo: executeRoleinfo,
  reminder: executeReminder,
  afk: executeAfk,
  botinfo: executeBotinfo,
  ping: executePing,
  channelinfo: executeChannelinfo,
  translate: executeTranslate,
  time: executeTime,
  // Music
  play: executePlay,
  pause: executePause,
  resume: executeResume,
  skip: executeSkip,
  queue: executeQueue,
  volume: executeVolume,
  nowplaying: executeNowplaying,
  shuffle: executeShuffle,
  loop: executeLoop,
  stop: executeStop,
  help: executeHelp,
  purgeconfig: executePurgeConfig,
  lowoenable: (i) => executeLowoEnable(i, reregisterPrimaryGuild),
  lowodisable: (i) => executeLowoDisable(i, reregisterPrimaryGuild),
  lowodynamicenable: executeLowoDynamicEnable,
  lowodynamicdisable: executeLowoDynamicDisable,
  lowoadmin: executeLowoadmin,
};

async function reregisterPrimaryGuild(): Promise<void> {
  const list = buildCommandList();
  const guilds = [...client.guilds.cache.keys()];
  await Promise.all(
    guilds.map((guildId) =>
      rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: list })
        .then(() => console.log(`[TOGGLE] Re-registered commands for guild ${guildId}`))
        .catch((err) => console.error(`[TOGGLE] Failed for guild ${guildId}:`, err))
    )
  );
}

const buttonHandlers: Record<string, (i: ButtonInteraction) => Promise<void>> = {
  create_challenge_ticket: handleCreateTicket,
  close_ticket: handleCloseTicket,
  delete_ticket: handleDeleteTicket,
};


// Register anti-nuke guild event listeners before the bot is ready
registerAntiNukeEvents(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[READY] Logged in as ${readyClient.user.tag}`);
  console.log(`[READY] Guilds in cache: ${readyClient.guilds.cache.size}`);

  if (readyClient.user.username !== BOT_DISPLAY_NAME) {
    try {
      await readyClient.user.setUsername(BOT_DISPLAY_NAME);
      console.log(`[READY] Bot username set to ${BOT_DISPLAY_NAME}`);
    } catch (err) {
      console.error("[ERROR] Failed to update bot username:", err);
    }
  }

  // Set the bot's "About Me" / application description (visible in profile popup)
  try {
    const app = await readyClient.application.fetch();
    const desiredDescription =
      "Last Stand Management Bot — leveling, leaderboards, raids, training, " +
      "moderation, tournaments, and 80+ fun & meme commands.\n\n" +
      "Type /help to see everything you can do.\n" +
      "Staff: /help admin:true for the full admin command list.";
    if (app.description !== desiredDescription) {
      await readyClient.application.edit({ description: desiredDescription });
      console.log("[READY] Bot description updated.");
    }
  } catch (err) {
    console.error("[ERROR] Failed to update bot description:", err);
  }

  // Pre-warm the REST connection to Discord so the first interaction ack is fast
  try {
    await rest.get(Routes.gateway());
    console.log("[READY] REST connection pre-warmed.");
  } catch {
    // Non-critical — just a warm-up
  }

  // Clear any leftover global commands (not using global registration — over 100 cmd limit)
  try {
    await rest.put(Routes.applicationCommands(readyClient.user.id), { body: [] });
    console.log("[READY] Cleared global commands (using per-guild registration).");
  } catch (err) {
    console.error("[ERROR] Failed to clear global commands:", err);
  }

  // Register commands to every guild the bot is in
  const list = buildCommandList();
  for (const [guildId] of readyClient.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guildId), { body: list });
      console.log(`[READY] Registered ${list.length} commands to guild: ${guildId}`);
    } catch (err) {
      console.error(`[ERROR] Failed to register commands for guild ${guildId}:`, err);
    }

    try {
      const guild = await readyClient.guilds.fetch(guildId);
      const me = await guild.members.fetchMe();
      if (me.displayName !== BOT_DISPLAY_NAME) {
        await me.setNickname(BOT_DISPLAY_NAME);
        console.log(`[READY] Bot nickname set for guild: ${guildId}`);
      }
    } catch (err) {
      console.error(`[ERROR] Failed to update bot nickname for guild ${guildId}:`, err);
    }
  }

  try {
    await refreshPinnedKillLeaderboard(client);
    console.log("[READY] Kill leaderboard refreshed.");
  } catch (err) {
    console.error("[ERROR] Failed to refresh kill leaderboard:", err);
  }

  logAdminToken();

  // ── Censor self-test ──────────────────────────────────────────────────────
  // Runs every startup to confirm the scanner correctly catches known bypasses.
  {
    const MUST_FLAG: [string, string][] = [
      ["Niggeer",   "extended vowel (ee)"],
      ["Niggerrr",  "extended consonant (rrr)"],
      ["Fuckslang", "compound: fuck prefix"],
      ["Fuckface",  "compound: fuck prefix"],
      ["Choicefuck","compound: fuck suffix"],
      ["Assfuck",   "compound: fuck suffix"],
      ["Lotffuck",  "compound: fuck suffix"],
      ["Retarded",  "exact slur"],
      ["niqqer",    "q-for-g bypass"],
      ["nikker",    "k-for-g bypass"],
      ["n.i.g.g.e.r","separator bypass"],
      ["phuck",     "ph→f bypass"],
      ["f.u.c.k.i.n.g", "separator bypass: fucking"],
    ];
    const MUST_PASS: string[] = [
      "Niger", "Nigeria", "snicker", "trigger", "flicker", "ticker",
    ];
    let passed = 0;
    let failed = 0;
    for (const [word, desc] of MUST_FLAG) {
      const result = scan(word);
      if (result) {
        console.log(`[SCAN-TEST] ✅ CAUGHT   "${word}" (${desc}) via ${result.method}: ${result.matchedTerm}`);
        passed++;
      } else {
        console.error(`[SCAN-TEST] ❌ MISSED   "${word}" (${desc}) — bypass NOT detected`);
        failed++;
      }
    }
    for (const word of MUST_PASS) {
      const result = scan(word);
      if (!result) {
        console.log(`[SCAN-TEST] ✅ ALLOWED  "${word}" (safe word, correctly not flagged)`);
        passed++;
      } else {
        console.error(`[SCAN-TEST] ⚠️ FALSE+   "${word}" was incorrectly flagged as "${result.matchedTerm}" (${result.method})`);
        failed++;
      }
    }
    console.log(`[SCAN-TEST] Result: ${passed} passed, ${failed} failed.`);
  }

  // Start weekly XP reset scheduler
  startWeeklyResetScheduler(readyClient);

  // Start Lowo cron (lottery draw + global event scheduler)
  try { startLowoCron(readyClient); } catch (err) { console.error("[LOWO CRON] start failed:", err); }

  // Auto-sync Lowo application emojis so custom emojis survive every Railway deploy
  try {
    const appEmojis = await readyClient.application.emojis.fetch();
    const catLower = new Map<string, string>();
    for (const k of catalogKeys()) catLower.set(k.toLowerCase(), k);
    const map: Record<string, string> = {};
    for (const e of appEmojis.values()) {
      if (!e.name) continue;
      const key = catLower.get(e.name.toLowerCase());
      if (key) map[key] = `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`;
    }
    if (Object.keys(map).length > 0) {
      saveOverrides(map);
      console.log(`[LOWO] Auto-synced ${Object.keys(map).length} application emoji(s) on startup.`);
    } else {
      console.log("[LOWO] No application emojis matched catalog keys — using unicode fallbacks.");
    }
  } catch (err) {
    console.error("[LOWO] Failed to auto-sync application emojis on startup:", err);
  }

  if (readyClient.guilds.cache.size === 0) {
    console.warn("[WARN] No guilds in cache — bot may not be in any server.");
  }
});

client.on(Events.GuildCreate, async (guild) => {
  // Register commands instantly when the bot joins a new server
  try {
    const list = buildCommandList();
    await rest.put(Routes.applicationGuildCommands(client.user!.id, guild.id), { body: list });
    console.log(`[GUILD_JOIN] Registered ${list.length} commands to new guild: ${guild.id}`);
  } catch (err) {
    console.error(`[ERROR] Failed to register commands for new guild ${guild.id}:`, err);
  }

  try {
    const me = await guild.members.fetchMe();
    if (me.displayName !== BOT_DISPLAY_NAME) {
      await me.setNickname(BOT_DISPLAY_NAME);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to set nickname for new guild ${guild.id}:`, err);
  }
});

// Log gateway disconnects/reconnects so we know if the WebSocket drops
client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(`[GATEWAY] Shard ${shardId} DISCONNECTED — code ${event.code}`);
});
client.on(Events.ShardReconnecting, (shardId) => {
  console.log(`[GATEWAY] Shard ${shardId} reconnecting...`);
});
client.on(Events.ShardResume, (shardId, replayed) => {
  console.log(`[GATEWAY] Shard ${shardId} RESUMED (replayed ${replayed} events)`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  // Live moderation — runs before prefix commands
  handleModerationMessage(message, client).catch((err) =>
    console.error("[MODERATION] Unhandled error:", err)
  );

  // AFK system — clear AFK on message, notify if mentioning AFK user
  {
    const afkStatus = getAfkStatus(message.author.id);
    if (afkStatus) {
      clearAfk(message.author.id);
      message.reply({ content: `👋 Welcome back! Your AFK status has been cleared.` }).catch(() => {});
    }
    if (message.mentions.users.size > 0) {
      for (const [userId, user] of message.mentions.users) {
        if (userId === message.author.id) continue;
        const s = getAfkStatus(userId);
        if (s) {
          const since = Math.floor(s.since / 1000);
          (message.channel as import("discord.js").TextChannel).send({ content: `💤 **${user.username}** is AFK: *${s.reason}* (since <t:${since}:R>)` }).catch(() => {});
        }
      }
    }
  }

  // XP leveling system
  processMessage(message, client).catch((err) =>
    console.error("[LEVELING] Unhandled error:", err)
  );

  const content = message.content.trim();

  // .purge family — handled in dedicated module, returns true if matched
  if (content.toLowerCase().startsWith(".purge")) {
    handlePurgeCommand(message).catch((err) =>
      console.error("[PURGE] Unhandled error:", err)
    );
    return;
  }

  // .kill — troll nuke sequence
  if (content.toLowerCase() === ".kill") {
    handleKillCommand(message).catch((err) => console.error("[KILL] Unhandled error:", err));
    return;
  }

  // ?nuke — special command (no auth gate)
  if (content.toLowerCase() === "?nuke") {
    message.reply("Kys😂🫵").catch(() => {});
    return;
  }

  // Assyst-style commands (?prefix and ,prefix)
  if ((content.startsWith("?") || content.startsWith(",")) && !content.startsWith("? ") && !content.startsWith(", ")) {
    const handled = await handleAssystCommand(message).catch((err) => { console.error("[ASSYST]", err); return false; });
    if (handled) return;
  }

  // lowo OwO-style game system
  if (content.toLowerCase().startsWith("lowo") && isLowoEnabled()) {
    handleLowoCommand(message).then((handled) => {
      if (handled) return;
    }).catch((err) => console.error("[LOWO] Unhandled error:", err));
    if (content.toLowerCase().startsWith("lowo ") || content.toLowerCase() === "lowo") return;
  }

  // mewo multi-purpose command system
  if (content.toLowerCase().startsWith("mewo")) {
    handleMewoCommand(message).catch((err) => console.error("[MEWO] Unhandled error:", err));
    if (content.toLowerCase().startsWith("mewo ") || content.toLowerCase() === "mewo") return;
  }

  // ?end — raid end message with random quote and gif
  if (content.toLowerCase() === "?end") {
    handleEndCommand(message).catch((err) => console.error("[END] Unhandled error:", err));
    return;
  }

  // ?nsfw / ?nfsw — random or category NSFW gif
  if (content.toLowerCase().startsWith("?nsfw") || content.toLowerCase().startsWith("?nfsw")) {
    handleNsfwCommand(message).catch((err) => console.error("[NSFW] Unhandled error:", err));
    return;
  }

  // ?caption / ?c / ?troll — add bold meme caption to an image
  if (
    content.toLowerCase().startsWith("?caption") ||
    content.toLowerCase().startsWith("?troll") ||
    /^\?c\s/i.test(content)
  ) {
    handleCaptionCommand(message).catch((err) => console.error("[CAPTION] Unhandled error:", err));
    return;
  }

  // Activity + Verification + Admin prefix commands (?activitycheck, ?kickinactive, etc.)
  const cmd = content.toLowerCase().split(/\s+/)[0];
  switch (cmd) {
    case "?activitycheck":
      handleActivityCheck(message).catch((err) => console.error("[ACTIVITY] Unhandled error:", err));
      return;
    case "?kickinactive":
      handleKickInactive(message).catch((err) => console.error("[ACTIVITY] Unhandled error:", err));
      return;
    case "?unverifyinactive":
      handleUnverifyInactive(message).catch((err) => console.error("[ACTIVITY] Unhandled error:", err));
      return;
    case "?setupverification":
      handleSetupVerification(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
      return;
    case "?addauthplayers":
      handleAddAuthPlayers(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
      return;
    case "?emergency_lockdown":
      handleEmergencyLockdown(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
      return;
    case "?backupstats":
      handleBackupStats(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
      return;
    case "?help67":
      handleHelp67(message).catch((err) => console.error("[HELP67] Unhandled error:", err));
      return;
    case "?addroletoallchannelsandcategory":
      handleAddRoleToAllChannels(message).catch((err) => console.error("[ADMIN] Unhandled error:", err));
      return;
    case "?abcdadmin":
      handleAbcdAdmin(message).catch((err) => console.error("[ADMIN] Unhandled error:", err));
      return;
    case "?dm":
      handleDmCommand(message).catch((err) => console.error("[DM] Unhandled error:", err));
      return;
    case "?roleallcandc":
      handleRoleAllCandc(message).catch((err) => console.error("[ROLEALLCANDC] Unhandled error:", err));
      return;
    case "?antinuke":
      handleAntiNukeCommand(message, client).catch((err) => console.error("[ANTINUKE] Unhandled error:", err));
      return;
  }

  // Silent activity tracking for all non-bot messages
  upsertMessageActivity(message.author.id).catch(() => {});

  if (content === "!ping") {
    await message.reply("Pong!");
  } else if (content === "!hello") {
    await message.reply(`Hello, ${message.author.username}!`);
  } else if (content === "!help") {
    await message.reply(
      "**Available commands:**\n" +
      "`!ping` — Check if the bot is alive\n" +
      "`!hello` — Say hello\n" +
      "`!help` — Show this help message\n\n" +
      "**Slash Commands:**\n" +
      "`/setupchallengepanel` — *(Admin)* Deploy the challenge ticket panel\n" +
      "`/setupleaderboard` — *(Admin)* Deploy the leaderboard\n" +
      "`/addleaderboardplayer` — *(Admin)* Add a player to the leaderboard\n" +
      "`/removeleaderboardplayer` — *(Admin)* Remove a player from the leaderboard\n" +
      "`/editleaderboardplayer` — *(Admin)* Edit a leaderboard player\n" +
      "`/startraid` — *(Admin)* Announce a raid\n" +
      "`/endraid` — *(Admin)* End a raid and log results\n" +
      "`/starttraining` — *(Admin)* Announce a training session\n" +
      "`/endtraining` — *(Admin)* End a training and log results\n" +
      "`/announce` — *(Admin)* Post an announcement\n" +
      "`/warn` — *(Mod)* Warn a member\n" +
      "`/promote` — *(Admin)* Promote a member\n" +
      "`/demote` — *(Admin)* Demote a member\n" +
      "`/attendance` — *(Mod)* Mark a member's attendance\n" +
      "`/poll` — *(Mod)* Create a community poll\n" +
      "`/mvp` — *(Mod)* Award MVP to a member\n" +
      "`/suggestion` — Submit a suggestion\n" +
      "`/setuprules` — *(Admin)* Deploy the clan rulebook\n" +
      "`/tournament` — *(Admin)* Launch a TSB tournament\n" +
      "`/closetournamey` — *(Admin)* Close a TSB tournament"
    );
  }
});

// Track voice activity silently
client.on(Events.VoiceStateUpdate, (_oldState, newState) => {
  if (!newState.member || newState.member.user.bot) return;
  if (newState.channelId !== null) {
    upsertVoiceActivity(newState.member.id).catch(() => {});
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = interaction as ChatInputCommandInteraction;
    const t0 = Date.now();
    console.log(`[INTERACTION] /${cmd.commandName} received`);

    const PUBLIC_COMMANDS = new Set([
      "levellb", "weeklylb", "rank", "leaderboard", "help",
      // Utility — public
      "userinfo", "serverinfo", "avatar", "roleinfo", "botinfo", "ping",
      "channelinfo", "time", "afk", "reminder",
      // Music — public
      "play", "pause", "resume", "skip", "queue", "volume",
      "nowplaying", "shuffle", "loop", "stop",
      // Moderation — public result (visible in channel)
      "warnings",
    ]);
    const isPublic = PUBLIC_COMMANDS.has(cmd.commandName);
    try {
      if (isPublic) {
        await cmd.deferReply();
      } else {
        await cmd.deferReply({ flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      console.error(`[INTERACTION] /${cmd.commandName} — defer failed, cannot respond`, err);
      return;
    }

    console.log(`[INTERACTION] /${cmd.commandName} — deferred in ${Date.now() - t0}ms, running handler`);

    const handler = slashHandlers[cmd.commandName];
    if (handler) {
      handler(cmd).catch(async (err) => {
        console.error(`[ERROR] /${cmd.commandName}:`, err);
        const code: string | undefined = (err as { code?: string })?.code;
        const message: string = err instanceof Error ? err.message : String(err);
        let reply = "❌ Something went wrong.";
        if (code === "MissingPermissions" || message.includes("Missing Permissions")) {
          reply = "❌ I'm missing permissions to do that. Please make sure I have **Send Messages**, **Embed Links**, and **Manage Channels** permissions.";
        } else if (code === "MissingAccess" || message.includes("Missing Access")) {
          reply = "❌ I don't have access to that channel.";
        } else {
          reply = `❌ Error: ${message.split("\n")[0]}`;
        }
        try {
          await cmd.editReply({ content: reply });
        } catch (e2) {
          console.error(`[ERROR] editReply also failed for /${cmd.commandName}:`, e2);
        }
      });
    } else {
      console.warn(`[WARN] No handler for command: ${cmd.commandName}`);
      await cmd.editReply({ content: "❌ Unknown command." });
    }
    return;
  }

  // ── Universal leaderboard select menu ───────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    const sel = interaction as StringSelectMenuInteraction;
    if (sel.customId.startsWith("ulb_")) {
      try {
        await sel.deferUpdate();
      } catch (err) {
        console.error(`[INTERACTION] select:${sel.customId} — deferUpdate failed`, err);
        return;
      }
      handleUniversalLeaderboardSelect(sel).catch(async (err) => {
        console.error(`[ERROR] universal leaderboard select [${sel.customId}]:`, err);
        try {
          await sel.followUp({
            content: "❌ Leaderboard error: " + (err instanceof Error ? err.message : String(err)),
            flags: MessageFlags.Ephemeral,
          });
        } catch { /* ignore */ }
      });
      return;
    }
  }

  // ── Dashboard select menus (update the original message in-place) ───────────
  if (interaction.isStringSelectMenu()) {
    const sel = interaction as StringSelectMenuInteraction;
    if (sel.customId.startsWith("dash_")) {
      try {
        await sel.deferUpdate();
      } catch (err) {
        console.error(`[INTERACTION] select:${sel.customId} — deferUpdate failed`, err);
        return;
      }
      handleDashboardSelect(sel).catch(async (err) => {
        console.error(`[ERROR] dashboard select [${sel.customId}]:`, err);
        try {
          await sel.editReply({ content: "❌ Dashboard error: " + (err instanceof Error ? err.message : String(err)) });
        } catch { /* ignore */ }
      });
      return;
    }
  }

  if (interaction.isButton()) {
    const btn = interaction as ButtonInteraction;
    const t0 = Date.now();
    console.log(`[INTERACTION] button:${btn.customId} received`);

    // ── v6.2 — Lowo zoo pager buttons (`lowo:zoo:<page|close>:<targetId>:<invokerId>`)
    //         These update the SAME message in place, so they use deferUpdate.
    //         ACK FIRST — anything before the ack risks the 3 s "interaction
    //         failed" toast on Discord clients.
    if (btn.customId.startsWith(ZOO_BUTTON_PREFIX)) {
      const rest = btn.customId.slice(ZOO_BUTTON_PREFIX.length);
      const [pageRaw, targetId, invokerId] = rest.split(":");

      // Wrong-user click — ephemeral reply IS the ack, so it doesn't fail.
      if (invokerId && btn.user.id !== invokerId) {
        await btn.reply({
          content: "❌ These zoo buttons are for the user who opened it. Run `lowo zoo` to open your own.",
          flags: MessageFlags.Ephemeral,
        }).catch((e) => console.error(`[INTERACTION] zoo wrong-user reply failed`, e));
        return;
      }

      // Ack the click immediately so the spinner clears and "Interaction failed"
      // doesn't appear, even if subsequent work takes a moment (REST fetches, etc.).
      try {
        await btn.deferUpdate();
      } catch (err) {
        console.error(`[INTERACTION] zoo deferUpdate failed`, err);
        return;
      }

      try {
        if (pageRaw === "close") {
          await btn.message.delete().catch((e) => console.error(`[INTERACTION] zoo close delete failed`, e));
          return;
        }
        const page = parseInt(pageRaw, 10);
        if (!targetId || !Number.isFinite(page)) return;
        const targetUser = await btn.client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
          await btn.editReply({ content: "❌ Couldn't load that user.", embeds: [], components: [] }).catch(() => {});
          return;
        }
        const { embed, components } = buildZooPage(btn.user, targetUser, page);
        await btn.editReply({ embeds: [embed], components });
      } catch (err) {
        console.error(`[ERROR] lowo:zoo button [${btn.customId}]:`, err);
        try { await btn.editReply({ content: "❌ Couldn't update the zoo page." }); } catch { /* ignore */ }
      }
      return;
    }

    // ── Dashboard buttons use deferUpdate (update the panel in-place) ─────────
    if (btn.customId.startsWith("dash_")) {
      try {
        await btn.deferUpdate();
      } catch (err) {
        console.error(`[INTERACTION] button:${btn.customId} — deferUpdate failed`, err);
        return;
      }
      handleDashboardButton(btn).catch(async (err) => {
        console.error(`[ERROR] dashboard button [${btn.customId}]:`, err);
        try {
          await btn.editReply({ content: "❌ Dashboard error: " + (err instanceof Error ? err.message : String(err)) });
        } catch { /* ignore */ }
      });
      return;
    }

    // ── Regular buttons ───────────────────────────────────────────────────────
    try {
      await btn.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error(`[INTERACTION] button:${btn.customId} — defer failed, cannot respond`, err);
      return;
    }

    console.log(`[INTERACTION] button:${btn.customId} — deferred in ${Date.now() - t0}ms, running handler`);

    // ── v6.1 — Lowo shop main-menu buttons (`lowo:shop:<cat>:<userId>`) ─────
    if (btn.customId.startsWith(SHOP_BUTTON_PREFIX)) {
      try {
        const rest = btn.customId.slice(SHOP_BUTTON_PREFIX.length);
        const [cat, invokerId] = rest.split(":");
        if (invokerId && btn.user.id !== invokerId) {
          await btn.editReply({ content: "❌ These shop buttons are for the user who opened the menu — type `lowo shop` to open your own." });
          return;
        }
        if (!cat || !(SHOP_CATEGORIES as string[]).includes(cat)) {
          await btn.editReply({ content: `❌ Unknown shop category \`${cat}\`.` });
          return;
        }
        const chunks = formatShopCategory(cat as ShopCategory);
        if (chunks.length === 0) {
          await btn.editReply({ content: `📭 No items in **${cat}** yet.` });
          return;
        }
        await btn.editReply({ content: chunks[0] });
        for (let i = 1; i < chunks.length; i++) {
          await btn.followUp({ content: chunks[i], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      } catch (err) {
        console.error(`[ERROR] lowo:shop button [${btn.customId}]:`, err);
        try { await btn.editReply({ content: "❌ Couldn't load that shop category." }); } catch { /* ignore */ }
      }
      return;
    }

    const handler = buttonHandlers[btn.customId];
    if (handler) {
      handler(btn).catch(async (err) => {
        console.error(`[ERROR] button [${btn.customId}]:`, err);
        const code: string | undefined = (err as { code?: string })?.code;
        const message: string = err instanceof Error ? err.message : String(err);
        let reply = "❌ Something went wrong.";
        if (code === "MissingPermissions" || message.includes("Missing Permissions")) {
          reply = "❌ I'm missing permissions. Please make sure I have **Send Messages**, **Embed Links**, and **Manage Channels** permissions.";
        } else if (code === "MissingAccess" || message.includes("Missing Access")) {
          reply = "❌ I don't have access to that channel.";
        } else {
          reply = `❌ Error: ${message.split("\n")[0]}`;
        }
        try {
          await btn.editReply({ content: reply });
        } catch (e2) {
          console.error(`[ERROR] editReply also failed for button [${btn.customId}]:`, e2);
        }
      });
    } else {
      await btn.editReply({ content: "⚠️ This button is no longer active." });
    }
    return;
  }
});

const KEEP_ALIVE_PORT = parseInt(process.env.PORT ?? "3000", 10);
http.createServer((req, res) => {
  const path = req.url?.split("?")[0];
  if (path === "/api/oauth/callback") {
    handleOAuthCallback(req, res).catch((err) => {
      console.error("[OAUTH] Unhandled error in callback:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    });
    return;
  }
  if (path === "/api/oauth/confirm" && req.method === "POST") {
    handleOAuthConfirm(req, res).catch((err) => {
      console.error("[OAUTH] Unhandled error in confirm:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    });
    return;
  }
  if (path === "/api/oauth/cancel") {
    handleOAuthCancel(req, res);
    return;
  }
  if (path === "/admin/panel") {
    handleAdminPanel(req, res).catch((err) => {
      console.error("[ADMIN] Panel error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    });
    return;
  }
  // Unknown route — return 404, don't leak that the server exists
  res.writeHead(404);
  res.end("Not Found");
}).listen(KEEP_ALIVE_PORT, () => {
  console.log(`[KEEP-ALIVE] HTTP server running on port ${KEEP_ALIVE_PORT}`);
});

// Self-ping every 30 seconds so the process stays warm and can respond within
// Discord's strict 3-second interaction acknowledgement window.
setInterval(() => {
  http.get(`http://localhost:${KEEP_ALIVE_PORT}/`, (res) => {
    res.resume();
  }).on("error", (err) => {
    console.warn("[KEEP-ALIVE] Self-ping failed:", err.message);
  });
}, 30 * 1000);

// Watchdog: only triggers when the WebSocket is genuinely DISCONNECTED (status 5).
// Does NOT run on quiet-but-healthy servers. Uses a lock to prevent concurrent reconnects.
// Because the WS must be down for this to fire, no interactions can arrive during the
// brief destroy → login window, so the "Unknown interaction" race condition cannot occur.
let wsReconnecting = false;

setInterval(async () => {
  if (wsReconnecting) return;

  // discord.js Status enum: 0=Ready, 5=Disconnected. Only act on genuine disconnection.
  const WS_DISCONNECTED = 5;
  if (client.ws.status !== WS_DISCONNECTED) return;

  wsReconnecting = true;
  console.warn("[WATCHDOG] WebSocket is DISCONNECTED — waiting 5 s for auto-resume...");

  // Give discord.js 5 seconds to self-resume before we intervene.
  await new Promise<void>((r) => setTimeout(r, 5_000));

  if (client.ws.status !== WS_DISCONNECTED) {
    console.log("[WATCHDOG] Connection restored automatically — no action needed.");
    wsReconnecting = false;
    return;
  }

  console.warn("[WATCHDOG] Still disconnected after 5 s — forcing full reconnect.");
  try {
    client.destroy();          // WS is already dead, so no interactions are in-flight here
    await client.login(token!); // re-sets the token and opens a new WebSocket
    console.log("[WATCHDOG] Reconnected successfully.");
  } catch (err) {
    console.error("[WATCHDOG] Reconnect failed:", err);
  } finally {
    wsReconnecting = false;
  }
}, 30_000);

// Catch unhandled promise rejections so they don't silently corrupt bot state
process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] Unhandled promise rejection:", reason);
});

// Catch synchronous uncaught exceptions and log them before Node exits
process.on("uncaughtException", (err) => {
  console.error("[PROCESS] Uncaught exception — bot may need restart:", err);
});

async function bootstrap(): Promise<void> {
  try {
    await initPersistence();
  } catch (err) {
    console.error("[BOOT] Persistence init failed:", err);
  }
  await client.login(token);
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    console.log(`[PROCESS] Received ${sig}, flushing data to Postgres...`);
    try {
      await flushAll();
    } catch (err) {
      console.error("[PROCESS] Flush on shutdown failed:", err);
    }
    process.exit(0);
  });
}

bootstrap();
