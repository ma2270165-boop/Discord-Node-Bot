import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  GuildMember,
} from "discord.js";

const MOD   = PermissionFlagsBits.ModerateMembers;
const ADMIN = PermissionFlagsBits.ManageGuild;
const MSGS  = PermissionFlagsBits.ManageMessages;

const HR  = "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯";
const DOT = " · · · · · · · · · · · · · · · ";
const FOOT = "Last Stand (LS)  ·  Moderation";

function modEmbed(color: number, title: string, desc: string) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: "LAST STAND  ·  MODERATION" })
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: FOOT })
    .setTimestamp();
}

// ── /kick ─────────────────────────────────────────────────────────────────────
export const kickData = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false));

export async function executeKick(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
  if (!member) { await interaction.editReply({ content: "❌ Member not found." }); return; }
  if (!member.kickable) { await interaction.editReply({ content: "❌ I cannot kick this member." }); return; }
  try { await target.send({ embeds: [modEmbed(0xe74c3c, "👢  YOU WERE KICKED", `**Server:** ${interaction.guild?.name}\n**Reason:** ${reason}`)] }); } catch { /**/ }
  await member.kick(reason);
  await interaction.editReply({ embeds: [modEmbed(0xe74c3c, "👢  MEMBER KICKED", `${HR}\n▸  **MEMBER** ${DOT} <@${target.id}>\n▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n${HR}\n**REASON**\n> ${reason}`).setThumbnail(target.displayAvatarURL())] });
}

// ── /ban ──────────────────────────────────────────────────────────────────────
export const banData = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Permanently ban a member from the server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName("user").setDescription("Member to ban").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
  .addIntegerOption((o) => o.setName("delete_days").setDescription("Days of messages to delete (0–7)").setMinValue(0).setMaxValue(7).setRequired(false));

export async function executeBan(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
  if (!interaction.guild) { await interaction.editReply({ content: "❌ Not in a guild." }); return; }
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member && !member.bannable) { await interaction.editReply({ content: "❌ I cannot ban this member." }); return; }
  try { await target.send({ embeds: [modEmbed(0x8b0000, "🔨  YOU WERE BANNED", `**Server:** ${interaction.guild?.name}\n**Reason:** ${reason}`)] }); } catch { /**/ }
  await interaction.guild.bans.create(target.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
  await interaction.editReply({ embeds: [modEmbed(0x8b0000, "🔨  MEMBER BANNED", `${HR}\n▸  **MEMBER** ${DOT} <@${target.id}>\n▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n${HR}\n**REASON**\n> ${reason}`).setThumbnail(target.displayAvatarURL())] });
}

// ── /tempban ──────────────────────────────────────────────────────────────────
export const tempbanData = new SlashCommandBuilder()
  .setName("tempban")
  .setDescription("Temporarily ban a member (unban is manual via Discord).")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName("user").setDescription("Member to temp-ban").setRequired(true))
  .addIntegerOption((o) => o.setName("hours").setDescription("Duration in hours").setMinValue(1).setMaxValue(720).setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false));

export async function executeTempban(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const hours  = interaction.options.getInteger("hours", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  if (!interaction.guild) { await interaction.editReply({ content: "❌ Not in a guild." }); return; }
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member && !member.bannable) { await interaction.editReply({ content: "❌ I cannot ban this member." }); return; }
  const unbanAt = new Date(Date.now() + hours * 3600 * 1000);
  const label = hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
  try { await target.send({ embeds: [modEmbed(0xc0392b, "⏳  TEMP-BAN ISSUED", `**Server:** ${interaction.guild?.name}\n**Duration:** ${label}\n**Reason:** ${reason}\n**Unban:** <t:${Math.floor(unbanAt.getTime() / 1000)}:F>`)] }); } catch { /**/ }
  await interaction.guild.bans.create(target.id, { reason: `[TEMPBAN ${label}] ${reason}` });
  await interaction.editReply({ embeds: [modEmbed(0xc0392b, `⏳  TEMP-BAN (${label})`, `${HR}\n▸  **MEMBER** ${DOT} <@${target.id}>\n▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n▸  **DURATION** ${DOT} \`${label}\`\n▸  **UNBAN AT** ${DOT} <t:${Math.floor(unbanAt.getTime() / 1000)}:F>\n${HR}\n**REASON**\n> ${reason}`).setThumbnail(target.displayAvatarURL())] });
}

// ── /mute ──────────────────────────────────────────────────────────────────────
export const muteData = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Timeout (mute) a member for a duration.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) => o.setName("user").setDescription("Member to mute").setRequired(true))
  .addIntegerOption((o) => o.setName("minutes").setDescription("Duration in minutes (1–40320)").setMinValue(1).setMaxValue(40320).setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false));

export async function executeMute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target  = interaction.options.getUser("user", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const reason  = interaction.options.getString("reason") ?? "No reason provided";
  const member  = await interaction.guild?.members.fetch(target.id).catch(() => null);
  if (!member) { await interaction.editReply({ content: "❌ Member not found." }); return; }
  if (!member.moderatable) { await interaction.editReply({ content: "❌ I cannot mute this member." }); return; }
  const ms = minutes * 60 * 1000;
  await member.timeout(ms, reason);
  const label = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  await interaction.editReply({ embeds: [modEmbed(0xf39c12, "🔇  MEMBER MUTED", `${HR}\n▸  **MEMBER** ${DOT} <@${target.id}>\n▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n▸  **DURATION** ${DOT} \`${label}\`\n${HR}\n**REASON**\n> ${reason}`).setThumbnail(target.displayAvatarURL())] });
}

// ── /unmute ────────────────────────────────────────────────────────────────────
export const unmuteData = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove a timeout (unmute) from a member.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) => o.setName("user").setDescription("Member to unmute").setRequired(true));

export async function executeUnmute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
  if (!member) { await interaction.editReply({ content: "❌ Member not found." }); return; }
  if (!member.isCommunicationDisabled()) { await interaction.editReply({ content: "ℹ️ That member is not currently muted." }); return; }
  await member.timeout(null);
  await interaction.editReply({ embeds: [modEmbed(0x2ecc71, "🔊  MEMBER UNMUTED", `${HR}\n▸  **MEMBER** ${DOT} <@${target.id}>\n▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n${HR}`).setThumbnail(target.displayAvatarURL())] });
}

// ── /timeout ───────────────────────────────────────────────────────────────────
export const timeoutData = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Apply or remove a Discord timeout from a member.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) => o.setName("user").setDescription("Member to timeout").setRequired(true))
  .addIntegerOption((o) => o.setName("minutes").setDescription("Duration in minutes (0 = remove timeout)").setMinValue(0).setMaxValue(40320).setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false));

export async function executeTimeout(interaction: ChatInputCommandInteraction): Promise<void> {
  const target  = interaction.options.getUser("user", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const reason  = interaction.options.getString("reason") ?? "No reason provided";
  const member  = await interaction.guild?.members.fetch(target.id).catch(() => null);
  if (!member) { await interaction.editReply({ content: "❌ Member not found." }); return; }
  if (!member.moderatable) { await interaction.editReply({ content: "❌ I cannot timeout this member." }); return; }
  if (minutes === 0) {
    await member.timeout(null);
    await interaction.editReply({ embeds: [modEmbed(0x2ecc71, "⏰  TIMEOUT REMOVED", `${HR}\n▸  **MEMBER** ${DOT} <@${target.id}>\n▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n${HR}`)] });
    return;
  }
  await member.timeout(minutes * 60 * 1000, reason);
  const label = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  await interaction.editReply({ embeds: [modEmbed(0xf39c12, `⏰  TIMEOUT (${label})`, `${HR}\n▸  **MEMBER** ${DOT} <@${target.id}>\n▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n▸  **DURATION** ${DOT} \`${label}\`\n${HR}\n**REASON**\n> ${reason}`).setThumbnail(target.displayAvatarURL())] });
}

// ── /purge ─────────────────────────────────────────────────────────────────────
export const purgeData = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("Bulk-delete messages from this channel.")
  .setDefaultMemberPermissions(MSGS)
  .addIntegerOption((o) => o.setName("amount").setDescription("Number of messages to delete (1–100)").setMinValue(1).setMaxValue(100).setRequired(true))
  .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user (optional)").setRequired(false));

export async function executePurge(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount = interaction.options.getInteger("amount", true);
  const filter = interaction.options.getUser("user");
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !("bulkDelete" in channel)) { await interaction.editReply({ content: "❌ Cannot bulk-delete in this channel." }); return; }
  let msgs = await channel.messages.fetch({ limit: 100 });
  if (filter) msgs = msgs.filter((m) => m.author.id === filter.id);
  const toDelete = [...msgs.values()].slice(0, amount);
  if (toDelete.length === 0) { await interaction.editReply({ content: "ℹ️ No messages found to delete." }); return; }
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  const recent = toDelete.filter((m) => Date.now() - m.createdTimestamp < fourteenDays);
  let deleted = 0;
  if (recent.length > 1) {
    const res = await channel.bulkDelete(recent, true);
    deleted += res.size;
  } else if (recent.length === 1) {
    await recent[0].delete().catch(() => {});
    deleted += 1;
  }
  await interaction.editReply({ content: `🧹 Deleted **${deleted}** message(s)${filter ? ` from <@${filter.id}>` : ""}.` });
}

// ── /slowmode ─────────────────────────────────────────────────────────────────
export const slowmodeData = new SlashCommandBuilder()
  .setName("slowmode")
  .setDescription("Set the slowmode delay for this channel.")
  .setDefaultMemberPermissions(ADMIN)
  .addIntegerOption((o) => o.setName("seconds").setDescription("Slowmode in seconds (0 = off)").setMinValue(0).setMaxValue(21600).setRequired(true));

export async function executeSlowmode(interaction: ChatInputCommandInteraction): Promise<void> {
  const seconds = interaction.options.getInteger("seconds", true);
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !("setRateLimitPerUser" in channel)) { await interaction.editReply({ content: "❌ Cannot set slowmode in this channel." }); return; }
  await channel.setRateLimitPerUser(seconds);
  const label = seconds === 0 ? "**off**" : seconds < 60 ? `**${seconds}s**` : `**${Math.floor(seconds / 60)}m ${seconds % 60}s**`;
  await interaction.editReply({ embeds: [modEmbed(0x3498db, "🐢  SLOWMODE UPDATED", `${HR}\n▸  **CHANNEL** ${DOT} <#${channel.id}>\n▸  **DELAY** ${DOT} ${label}\n▸  **SET BY** ${DOT} <@${interaction.user.id}>\n${HR}`)] });
}

// ── /lock ──────────────────────────────────────────────────────────────────────
export const lockData = new SlashCommandBuilder()
  .setName("lock")
  .setDescription("Lock a channel so @everyone cannot send messages.")
  .setDefaultMemberPermissions(ADMIN)
  .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false));

export async function executeLock(interaction: ChatInputCommandInteraction): Promise<void> {
  const reason  = interaction.options.getString("reason") ?? "No reason provided";
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !("permissionOverwrites" in channel)) { await interaction.editReply({ content: "❌ Cannot lock this channel." }); return; }
  await channel.permissionOverwrites.edit(interaction.guild!.id, { SendMessages: false });
  await interaction.editReply({ embeds: [modEmbed(0xe74c3c, "🔒  CHANNEL LOCKED", `${HR}\n▸  **CHANNEL** ${DOT} <#${channel.id}>\n▸  **LOCKED BY** ${DOT} <@${interaction.user.id}>\n${HR}\n**REASON**\n> ${reason}`)] });
}

// ── /unlock ────────────────────────────────────────────────────────────────────
export const unlockData = new SlashCommandBuilder()
  .setName("unlock")
  .setDescription("Unlock a channel so @everyone can send messages again.")
  .setDefaultMemberPermissions(ADMIN);

export async function executeUnlock(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !("permissionOverwrites" in channel)) { await interaction.editReply({ content: "❌ Cannot unlock this channel." }); return; }
  await channel.permissionOverwrites.edit(interaction.guild!.id, { SendMessages: null });
  await interaction.editReply({ embeds: [modEmbed(0x2ecc71, "🔓  CHANNEL UNLOCKED", `${HR}\n▸  **CHANNEL** ${DOT} <#${channel.id}>\n▸  **UNLOCKED BY** ${DOT} <@${interaction.user.id}>\n${HR}`)] });
}

// ── /warnings ─────────────────────────────────────────────────────────────────
import { getWarns, WarnEntry } from "../utility/store.js";

export const warningsData = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("View the warning history for a member.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) => o.setName("user").setDescription("Member to look up").setRequired(false));

export async function executeWarnings(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const warns  = await getWarns(target.id, interaction.guildId ?? "");

  if (warns.length === 0) {
    await interaction.editReply({ content: `✅ **${target.tag}** has no warnings on record.` });
    return;
  }

  const lines = warns.slice(-10).map((w: WarnEntry, i: number) =>
    `**${i + 1}.** <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:d> — ${w.reason} *(by <@${w.moderatorId}>)*`
  ).join("\n");

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setAuthor({ name: "LAST STAND  ·  MODERATION" })
    .setTitle(`📋  WARNING HISTORY — ${target.tag}`)
    .setDescription(`${HR}\n${lines}\n${HR}\n▸  **TOTAL** ${DOT} \`${warns.length}\``)
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: FOOT })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
