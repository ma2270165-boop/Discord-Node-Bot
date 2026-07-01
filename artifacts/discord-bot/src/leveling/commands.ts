import { requireLowoOwnerInteraction } from "../utility/lowoOwner.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} from "discord.js";
import {
  getUser,
  getAllUsers,
  getGuildConfig,
  patchGuildConfig,
  getGuildLevelRoles,
  setLevelRole,
  removeLevelRole,
  modifyUserXp,
  resetUser,
} from "./db.js";
import { computeLevel, progressBar, xpForLevel, handleLevelUp } from "./engine.js";
import { generateLeaderboardCard, LeaderboardEntry } from "../leaderboardCard.js";

// ─── /rank ────────────────────────────────────────────────────────────────────

export const rankData = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("View your rank card or another member's.")
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to look up").setRequired(false)
  );

export async function executeRank(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser("user") ?? i.user;
  const guildId = i.guildId!;

  const userData = await getUser(guildId, target.id);
  const { level, currentXp, neededXp } = computeLevel(userData.totalXp);

  const all = (await getAllUsers(guildId)).sort((a, b) => b.totalXp - a.totalXp);
  const rank = all.findIndex((u) => u.userId === target.id) + 1;
  const bar = progressBar(currentXp, neededXp, 18);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: target.username,
      iconURL: target.displayAvatarURL(),
    })
    .setTitle(`◇  RANK CARD`)
    .addFields(
      { name: "Level", value: `**${level}**`, inline: true },
      { name: "Server Rank", value: `**#${rank === 0 ? "—" : rank}**`, inline: true },
      { name: "Weekly XP", value: `**${userData.weeklyXp.toLocaleString()}**`, inline: true },
      {
        name: `XP Progress  ·  ${currentXp.toLocaleString()} / ${neededXp.toLocaleString()}`,
        value: `\`${bar}\``,
      },
      { name: "Total XP", value: `${userData.totalXp.toLocaleString()} XP`, inline: true }
    )
    .setFooter({ text: `Last Stand Management  ·  Leveling System` })
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /leaderboard ─────────────────────────────────────────────────────────────

export const leaderboardLevelData = new SlashCommandBuilder()
  .setName("levellb")
  .setDescription("All-time XP leaderboard.")
  .addIntegerOption((o) =>
    o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false)
  );

export async function executeLeaderboard(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId!;
  const page = (i.options.getInteger("page") ?? 1) - 1;
  const PER_PAGE = 10;

  const all = (await getAllUsers(guildId))
    .filter((u) => u.totalXp > 0)
    .sort((a, b) => b.totalXp - a.totalXp);

  if (all.length === 0) {
    await i.editReply({ content: "No XP data yet. Start chatting!" });
    return;
  }

  const totalPages = Math.ceil(all.length / PER_PAGE);
  const safePage = Math.min(page, totalPages - 1);
  const slice = all.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  const entries: LeaderboardEntry[] = await Promise.all(
    slice.map(async (u, idx) => {
      const rank = safePage * PER_PAGE + idx + 1;
      let username = u.userId;
      let avatarURL: string | null = null;
      try {
        const member = await i.guild!.members.fetch(u.userId).catch(() => null);
        if (member) {
          username = member.user.username;
          avatarURL = member.user.displayAvatarURL({ extension: "png", size: 64 });
        }
      } catch { /* fallback */ }
      const { level } = computeLevel(u.totalXp);
      return {
        rank,
        avatarURL,
        username,
        col1Label: "LVL",
        col1Value: String(level),
        col2Label: "XP",
        col2Value: `+${u.totalXp.toLocaleString()}`,
      };
    })
  );

  const buf = await generateLeaderboardCard("XP Leaderboard", entries);
  const attachment = new AttachmentBuilder(buf, { name: "leaderboard.png" });

  await i.editReply({
    content: `Page ${safePage + 1} / ${totalPages}  ·  ${all.length} members`,
    files: [attachment],
  });
}

// ─── /weeklylb ────────────────────────────────────────────────────────────────

export const weeklyLbData = new SlashCommandBuilder()
  .setName("weeklylb")
  .setDescription("This week's XP leaderboard.");

export async function executeWeeklyLb(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId!;

  const all = (await getAllUsers(guildId))
    .filter((u) => u.weeklyXp > 0)
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .slice(0, 10);

  if (all.length === 0) {
    await i.editReply({ content: "No weekly XP yet. This week just started!" });
    return;
  }

  const entries: LeaderboardEntry[] = await Promise.all(
    all.map(async (u, idx) => {
      let username = u.userId;
      let avatarURL: string | null = null;
      try {
        const member = await i.guild!.members.fetch(u.userId).catch(() => null);
        if (member) {
          username = member.user.username;
          avatarURL = member.user.displayAvatarURL({ extension: "png", size: 64 });
        }
      } catch { /* ignore */ }

      const currentLevel = computeLevel(u.totalXp).level;
      const prevLevel = computeLevel(Math.max(0, u.totalXp - u.weeklyXp)).level;
      const levelGain = Math.max(0, currentLevel - prevLevel);

      return {
        rank: idx + 1,
        avatarURL,
        username,
        col1Label: "LVL",
        col1Value: `+${levelGain}`,
        col2Label: "XP",
        col2Value: `+${u.weeklyXp.toLocaleString()}`,
      };
    })
  );

  const buf = await generateLeaderboardCard("Weekly XP Highlights", entries);
  const attachment = new AttachmentBuilder(buf, { name: "weeklylb.png" });

  await i.editReply({ files: [attachment] });
}

// ─── /addxp ───────────────────────────────────────────────────────────────────

export const addXpData = new SlashCommandBuilder()
  .setName("addxp")
  .setDescription("Add XP to a member. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName("user").setDescription("Target member").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("XP to add").setMinValue(1).setRequired(true)
  );

export async function executeAddXp(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser("user", true);
  const amount = i.options.getInteger("amount", true);
  const guildId = i.guildId!;

  const before = await getUser(guildId, target.id);
  const oldLevel = computeLevel(before.totalXp).level;

  const updated = await modifyUserXp(guildId, target.id, amount, "add");
  updated.weeklyXp = (updated.weeklyXp || 0) + amount;
  const { level } = computeLevel(updated.totalXp);

  if (level > oldLevel) {
    try {
      const member = await i.guild!.members.fetch(target.id);
      const config = await getGuildConfig(guildId);
      await handleLevelUp(member, oldLevel, level, config, i.client, guildId, {
        tag: i.user.tag,
        command: "addxp",
      });
    } catch (err) {
      console.error("[ADDXP] Failed to trigger level-up handler:", err);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("◈  XP ADDED")
    .addFields(
      { name: "Member", value: `<@${target.id}>`, inline: true },
      { name: "Added", value: `+${amount.toLocaleString()} XP`, inline: true },
      { name: "Total XP", value: `${updated.totalXp.toLocaleString()} XP`, inline: true },
      { name: "Current Level", value: `${level}`, inline: true }
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /removexp ────────────────────────────────────────────────────────────────

export const removeXpData = new SlashCommandBuilder()
  .setName("removexp")
  .setDescription("Remove XP from a member. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName("user").setDescription("Target member").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("XP to remove").setMinValue(1).setRequired(true)
  );

export async function executeRemoveXp(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser("user", true);
  const amount = i.options.getInteger("amount", true);
  const guildId = i.guildId!;

  const updated = await modifyUserXp(guildId, target.id, amount, "remove");
  const { level } = computeLevel(updated.totalXp);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("◈  XP REMOVED")
    .addFields(
      { name: "Member", value: `<@${target.id}>`, inline: true },
      { name: "Removed", value: `-${amount.toLocaleString()} XP`, inline: true },
      { name: "Total XP", value: `${updated.totalXp.toLocaleString()} XP`, inline: true },
      { name: "Current Level", value: `${level}`, inline: true }
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /setxp ───────────────────────────────────────────────────────────────────

export const setXpData = new SlashCommandBuilder()
  .setName("setxp")
  .setDescription("Set a member's total XP to an exact value. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName("user").setDescription("Target member").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Exact XP to set").setMinValue(0).setRequired(true)
  );

export async function executeSetXp(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser("user", true);
  const amount = i.options.getInteger("amount", true);
  const guildId = i.guildId!;

  const before = await getUser(guildId, target.id);
  const oldLevel = computeLevel(before.totalXp).level;

  const updated = await modifyUserXp(guildId, target.id, amount, "set");
  const { level } = computeLevel(updated.totalXp);

  if (level > oldLevel) {
    try {
      const member = await i.guild!.members.fetch(target.id);
      const config = await getGuildConfig(guildId);
      await handleLevelUp(member, oldLevel, level, config, i.client, guildId, {
        tag: i.user.tag,
        command: "setxp",
      });
    } catch (err) {
      console.error("[SETXP] Failed to trigger level-up handler:", err);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("◈  XP SET")
    .addFields(
      { name: "Member", value: `<@${target.id}>`, inline: true },
      { name: "Total XP", value: `${updated.totalXp.toLocaleString()} XP`, inline: true },
      { name: "Level", value: `${level}`, inline: true }
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /exportdata ──────────────────────────────────────────────────────────────

export const exportDataData = new SlashCommandBuilder()
  .setName("exportdata")
  .setDescription("Export the bot's full leveling/censor data as files. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeExportData(i: ChatInputCommandInteraction): Promise<void> {
  if (!await requireLowoOwnerInteraction(i)) return;

  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataDir = path.join(__dirname, "../../data");

  const files: AttachmentBuilder[] = [];
  try {
    for (const name of fs.readdirSync(dataDir)) {
      const full = path.join(dataDir, name);
      if (fs.statSync(full).isFile()) {
        files.push(new AttachmentBuilder(full, { name }));
      }
    }
  } catch (err) {
    await i.editReply({ content: `Failed to read data directory: ${(err as Error).message}` });
    return;
  }

  if (files.length === 0) {
    await i.editReply({ content: "No data files found." });
    return;
  }

  await i.editReply({
    content: `Exported ${files.length} data file(s) — current container state.`,
    files,
  });
}

// ─── /resetxp ─────────────────────────────────────────────────────────────────

export const resetXpData = new SlashCommandBuilder()
  .setName("resetxp")
  .setDescription("Fully reset a member's XP and level. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName("user").setDescription("Target member").setRequired(true));

export async function executeResetXp(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser("user", true);
  await resetUser(i.guildId!, target.id);

  const embed = new EmbedBuilder()
    .setColor(0xfaa61a)
    .setTitle("◈  XP RESET")
    .setDescription(`<@${target.id}>'s XP and level have been wiped.`)
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /setlevelrole ────────────────────────────────────────────────────────────

export const setLevelRoleData = new SlashCommandBuilder()
  .setName("setlevelrole")
  .setDescription("Assign a role to be granted at a specific level. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption((o) =>
    o.setName("level").setDescription("Level threshold").setMinValue(1).setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("role_name").setDescription("Exact role name").setRequired(true)
  );

export async function executeSetLevelRole(i: ChatInputCommandInteraction): Promise<void> {
  const level = i.options.getInteger("level", true);
  const roleName = i.options.getString("role_name", true);
  const guildId = i.guildId!;

  const role = i.guild!.roles.cache.find(
    (r) => r.name.toLowerCase() === roleName.toLowerCase()
  );

  await setLevelRole(guildId, level, roleName);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("◈  LEVEL ROLE SET")
    .addFields(
      { name: "Level", value: `${level}`, inline: true },
      { name: "Role Name", value: roleName, inline: true },
      { name: "Role Found", value: role ? "✅ Yes" : "⚠️ Not found in server (will error on grant)", inline: true }
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /removelevelrole ─────────────────────────────────────────────────────────

export const removeLevelRoleData = new SlashCommandBuilder()
  .setName("removelevelrole")
  .setDescription("Remove the role assignment from a level. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption((o) =>
    o.setName("level").setDescription("Level to clear").setMinValue(1).setRequired(true)
  );

export async function executeRemoveLevelRole(i: ChatInputCommandInteraction): Promise<void> {
  const level = i.options.getInteger("level", true);
  const removed = await removeLevelRole(i.guildId!, level);

  await i.editReply({
    content: removed
      ? `✅ Role assignment for level ${level} removed.`
      : `⚠️ No role was set for level ${level}.`,
  });
}

// ─── /setxpcooldown ───────────────────────────────────────────────────────────

export const setXpCooldownData = new SlashCommandBuilder()
  .setName("setxpcooldown")
  .setDescription("Set XP gain cooldown in seconds. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption((o) =>
    o.setName("seconds").setDescription("Cooldown in seconds (default: 60)").setMinValue(5).setMaxValue(3600).setRequired(true)
  );

export async function executeSetXpCooldown(i: ChatInputCommandInteraction): Promise<void> {
  const seconds = i.options.getInteger("seconds", true);
  await patchGuildConfig(i.guildId!, { cooldown: seconds });
  await i.editReply({ content: `✅ XP cooldown set to **${seconds} seconds**.` });
}

// ─── /setxprange ──────────────────────────────────────────────────────────────

export const setXpRangeData = new SlashCommandBuilder()
  .setName("setxprange")
  .setDescription("Set the min/max XP awarded per message. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption((o) =>
    o.setName("min").setDescription("Minimum XP per message").setMinValue(1).setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName("max").setDescription("Maximum XP per message").setMinValue(1).setRequired(true)
  );

export async function executeSetXpRange(i: ChatInputCommandInteraction): Promise<void> {
  const min = i.options.getInteger("min", true);
  const max = i.options.getInteger("max", true);
  if (min > max) {
    await i.editReply({ content: "❌ Minimum XP cannot be greater than maximum." });
    return;
  }
  await patchGuildConfig(i.guildId!, { xpMin: min, xpMax: max });
  await i.editReply({ content: `✅ XP range set to **${min} – ${max}** per message.` });
}

// ─── /setxpchannel ────────────────────────────────────────────────────────────

export const setXpChannelData = new SlashCommandBuilder()
  .setName("setxpchannel")
  .setDescription("Configure the level-up notification channel and ping behaviour. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o.setName("channel").setDescription("Level-up channel (leave empty to auto-detect)").setRequired(false)
  )
  .addBooleanOption((o) =>
    o.setName("ping_user").setDescription("Ping the user when they level up? (default: true)").setRequired(false)
  );

export async function executeSetXpChannel(i: ChatInputCommandInteraction): Promise<void> {
  const channel = i.options.getChannel("channel");
  const pingUser = i.options.getBoolean("ping_user");
  const patch: Record<string, unknown> = {};

  if (channel !== undefined) patch.levelUpChannelId = channel?.id ?? null;
  if (pingUser !== null && pingUser !== undefined) patch.pingOnLevelUp = pingUser;

  await patchGuildConfig(i.guildId!, patch);

  const lines: string[] = [];
  if (channel !== undefined) {
    lines.push(channel ? `◈  Level-up channel → <#${channel.id}>` : `◈  Level-up channel → auto-detect`);
  }
  if (pingUser !== null && pingUser !== undefined) {
    lines.push(`◈  Ping on level-up → **${pingUser ? "Enabled" : "Disabled"}**`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("◈  LEVEL-UP SETTINGS UPDATED")
    .setDescription(lines.length ? lines.join("\n") : "No changes made.")
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /setmultiplier ───────────────────────────────────────────────────────────

export const setMultiplierData = new SlashCommandBuilder()
  .setName("setmultiplier")
  .setDescription("Set an XP multiplier. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("type")
      .setDescription("Multiplier type")
      .addChoices(
        { name: "Server-wide", value: "server" },
        { name: "Event (temporary)", value: "event" },
        { name: "Role-based", value: "role" }
      )
      .setRequired(true)
  )
  .addNumberOption((o) =>
    o.setName("value").setDescription("Multiplier value (e.g. 2.0 for 2x)").setMinValue(0.1).setMaxValue(10).setRequired(true)
  )
  .addRoleOption((o) =>
    o.setName("role").setDescription("Role to apply multiplier to (role type only)").setRequired(false)
  );

export async function executeSetMultiplier(i: ChatInputCommandInteraction): Promise<void> {
  const type = i.options.getString("type", true);
  const value = i.options.getNumber("value", true);
  const role = i.options.getRole("role");
  const guildId = i.guildId!;
  const config = await getGuildConfig(guildId);

  if (type === "server") {
    await patchGuildConfig(guildId, { serverMultiplier: value });
    await i.editReply({ content: `✅ Server-wide XP multiplier set to **${value}x**.` });
  } else if (type === "event") {
    await patchGuildConfig(guildId, { eventMultiplier: value });
    await i.editReply({ content: `✅ Event XP multiplier set to **${value}x**. Remember to reset it when the event ends!` });
  } else if (type === "role") {
    if (!role) {
      await i.editReply({ content: "❌ You must specify a role for role-based multipliers." });
      return;
    }
    const updated = { ...config.roleMultipliers, [role.id]: value };
    await patchGuildConfig(guildId, { roleMultipliers: updated });
    await i.editReply({ content: `✅ Members with **${role.name}** will receive **${value}x** XP.` });
  }
}

// ─── /blacklistchannel ────────────────────────────────────────────────────────

export const blacklistChannelData = new SlashCommandBuilder()
  .setName("blacklistchannel")
  .setDescription("Block XP gain in a channel. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o.setName("channel").setDescription("Channel to blacklist").setRequired(true)
  )
  .addBooleanOption((o) =>
    o.setName("remove").setDescription("Remove from blacklist instead").setRequired(false)
  );

export async function executeBlacklistChannel(i: ChatInputCommandInteraction): Promise<void> {
  const channel = i.options.getChannel("channel", true);
  const remove = i.options.getBoolean("remove") ?? false;
  const guildId = i.guildId!;
  const config = await getGuildConfig(guildId);

  let list = [...config.blacklistedChannels];
  if (remove) {
    list = list.filter((id) => id !== channel.id);
    await patchGuildConfig(guildId, { blacklistedChannels: list });
    await i.editReply({ content: `✅ <#${channel.id}> removed from XP blacklist.` });
  } else {
    if (!list.includes(channel.id)) list.push(channel.id);
    await patchGuildConfig(guildId, { blacklistedChannels: list });
    await i.editReply({ content: `✅ <#${channel.id}> added to XP blacklist — no XP will be earned there.` });
  }
}

// ─── /whitelistchannel ────────────────────────────────────────────────────────

export const whitelistChannelData = new SlashCommandBuilder()
  .setName("whitelistchannel")
  .setDescription("Restrict XP gain to specific channels only. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o.setName("channel").setDescription("Channel to whitelist").setRequired(true)
  )
  .addBooleanOption((o) =>
    o.setName("remove").setDescription("Remove from whitelist instead").setRequired(false)
  );

export async function executeWhitelistChannel(i: ChatInputCommandInteraction): Promise<void> {
  const channel = i.options.getChannel("channel", true);
  const remove = i.options.getBoolean("remove") ?? false;
  const guildId = i.guildId!;
  const config = await getGuildConfig(guildId);

  let list = [...config.whitelistedChannels];
  if (remove) {
    list = list.filter((id) => id !== channel.id);
    await patchGuildConfig(guildId, { whitelistedChannels: list });
    await i.editReply({
      content: list.length === 0
        ? `✅ <#${channel.id}> removed. Whitelist is now empty — XP allowed in all channels.`
        : `✅ <#${channel.id}> removed from whitelist.`,
    });
  } else {
    if (!list.includes(channel.id)) list.push(channel.id);
    await patchGuildConfig(guildId, { whitelistedChannels: list });
    await i.editReply({ content: `✅ <#${channel.id}> added to whitelist. XP will ONLY be earned in whitelisted channels.` });
  }
}

// ─── /xpconfig ────────────────────────────────────────────────────────────────

export const xpConfigData = new SlashCommandBuilder()
  .setName("xpconfig")
  .setDescription("View the current XP system configuration. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeXpConfig(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId!;
  const [config, levelRoles] = await Promise.all([
    getGuildConfig(guildId),
    getGuildLevelRoles(guildId),
  ]);

  const roleLines = Object.entries(levelRoles)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([lvl, name]) => `Lv.${lvl} → ${name}`)
    .join("\n") || "None configured";

  const blChans = config.blacklistedChannels.map((id) => `<#${id}>`).join(", ") || "None";
  const wlChans = config.whitelistedChannels.map((id) => `<#${id}>`).join(", ") || "None (all channels)";

  const roleMultLines = Object.entries(config.roleMultipliers)
    .map(([id, m]) => `<@&${id}> → ${m}x`)
    .join("\n") || "None";

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x5865f2 : 0xed4245)
    .setTitle(`◈  XP SYSTEM CONFIG  ·  ${config.enabled ? "🟢 ACTIVE" : "🔴 STOPPED"}`)
    .addFields(
      { name: "System Status", value: config.enabled ? "🟢 Running" : "🔴 Stopped", inline: true },
      { name: "XP Range", value: `${config.xpMin} – ${config.xpMax} per message`, inline: true },
      { name: "Cooldown", value: `${config.cooldown}s`, inline: true },
      { name: "Announcements", value: config.announcements ? "Enabled" : "Disabled", inline: true },
      { name: "Ping on Level-up", value: config.pingOnLevelUp ? "✅ Yes" : "❌ No", inline: true },
      { name: "Level-up Channel", value: config.levelUpChannelId ? `<#${config.levelUpChannelId}>` : "Auto-detect", inline: true },
      { name: "Keep Old Roles", value: config.keepOldRoles ? "Yes" : "No", inline: true },
      { name: "Server Multiplier", value: `${config.serverMultiplier}x`, inline: true },
      { name: "Event Multiplier", value: `${config.eventMultiplier}x`, inline: true },
      { name: "Blacklisted Channels", value: blChans },
      { name: "Whitelisted Channels", value: wlChans },
      { name: "Role Multipliers", value: roleMultLines },
      { name: "Level Roles", value: `\`\`\`\n${roleLines}\n\`\`\`` },
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /levelroles ──────────────────────────────────────────────────────────────

export const levelRolesData = new SlashCommandBuilder()
  .setName("levelroles")
  .setDescription("View all configured level-up roles.");

export async function executeLevelRoles(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId!;
  const levelRoles = await getGuildLevelRoles(guildId);

  const lines = Object.entries(levelRoles)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([lvl, name]) => {
      const role = i.guild!.roles.cache.find(
        (r) => r.name.toLowerCase() === name.toLowerCase()
      );
      const status = role ? "✅" : "⚠️";
      return `${status}  **Level ${lvl}**  →  ${name}`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("◈  LEVEL ROLES")
    .setDescription(lines || "No roles configured.")
    .setFooter({ text: "✅ = role found  ·  ⚠️ = role not found in server" })
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /startlsxpsystem ─────────────────────────────────────────────────────────

export const startLsXpSystemData = new SlashCommandBuilder()
  .setName("startlsxpsystem")
  .setDescription("Enable the XP leveling system. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeStartLsXpSystem(i: ChatInputCommandInteraction): Promise<void> {
  const config = await getGuildConfig(i.guildId!);
  if (config.enabled) {
    await i.editReply({ content: "⚠️ The XP system is already running." });
    return;
  }
  await patchGuildConfig(i.guildId!, { enabled: true });

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🟢  XP SYSTEM STARTED")
    .setDescription(
      "The XP leveling system is now **active**.\n" +
      "Members will earn XP for every message they send."
    )
    .addFields(
      { name: "XP Range", value: `${config.xpMin} – ${config.xpMax} per message`, inline: true },
      { name: "Cooldown", value: `${config.cooldown}s`, inline: true },
      { name: "Ping on Level-up", value: config.pingOnLevelUp ? "✅ Yes" : "❌ No", inline: true },
    )
    .setFooter({ text: `Started by ${i.user.username}` })
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

// ─── /stoplsxpsystem ──────────────────────────────────────────────────────────

export const stopLsXpSystemData = new SlashCommandBuilder()
  .setName("stoplsxpsystem")
  .setDescription("Disable the XP leveling system. (Admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeStopLsXpSystem(i: ChatInputCommandInteraction): Promise<void> {
  const config = await getGuildConfig(i.guildId!);
  if (!config.enabled) {
    await i.editReply({ content: "⚠️ The XP system is already stopped." });
    return;
  }
  await patchGuildConfig(i.guildId!, { enabled: false });

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🔴  XP SYSTEM STOPPED")
    .setDescription(
      "The XP leveling system is now **paused**.\n" +
      "No XP will be earned until restarted with `/startlsxpsystem`.\n\n" +
      "All existing XP data is preserved."
    )
    .setFooter({ text: `Stopped by ${i.user.username}` })
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}
