import { requireLowoOwnerInteraction } from "../utility/lowoOwner.js";
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  Message,
  GuildMember,
  OverwriteType,
  type PermissionOverwriteOptions,
} from "discord.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_DIR   = resolve(__dirname, "../../data");
const CFG_FILE   = join(DATA_DIR, "admin_config.json");

const ADMIN = PermissionFlagsBits.ManageGuild;
const HR    = "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯";
const FOOT  = "Last Stand (LS)  ·  Admin System";

interface GuildConfig {
  prefix?: string;
  modLogChannelId?: string;
  welcomeChannelId?: string;
  welcomeMessage?: string;
  antispamEnabled?: boolean;
  automodEnabled?: boolean;
  modRoleId?: string;
  adminRoleId?: string;
}

type ConfigStore = Record<string, GuildConfig>;

let _store: ConfigStore | null = null;
function loadCfg(): ConfigStore {
  if (_store) return _store;
  try {
    if (existsSync(CFG_FILE)) {
      _store = JSON.parse(readFileSync(CFG_FILE, "utf-8")) as ConfigStore;
      return _store;
    }
  } catch { /**/ }
  _store = {};
  return _store;
}
function saveCfg(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CFG_FILE, JSON.stringify(_store ?? {}, null, 2), "utf-8");
}
function getGuildCfg(guildId: string): GuildConfig {
  const store = loadCfg();
  if (!store[guildId]) store[guildId] = {};
  return store[guildId];
}

function adminEmbed(color: number, title: string, desc: string) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: "LAST STAND  ·  ADMIN PANEL" })
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: FOOT })
    .setTimestamp();
}

// ── /setup ────────────────────────────────────────────────────────────────────
export const setupData = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Run the bot setup wizard to configure channels, roles, and features.")
  .setDefaultMemberPermissions(ADMIN);

export async function executeSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!await requireLowoOwnerInteraction(interaction)) return;

  const guild = interaction.guild!;
  const cfg   = getGuildCfg(guild.id);

  const textChannels = guild.channels.cache.filter((c) => c.isTextBased()).size;
  const roles        = guild.roles.cache.size;
  const members      = guild.memberCount;

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({ name: "LAST STAND  ·  SETUP WIZARD" })
    .setTitle("🧙  BOT SETUP WIZARD")
    .setDescription(
      `${HR}\nWelcome to the **Last Stand Management** setup wizard.\n` +
      `Use the commands below to configure the bot for **${guild.name}**.\n${HR}`
    )
    .addFields(
      { name: "📊  Server Stats", value: `**${members}** members · **${textChannels}** text channels · **${roles}** roles`, inline: false },
      { name: "⚙️  Current Config", value: [
        `**Prefix:** \`${cfg.prefix ?? "/"}\``,
        `**Mod Log:** ${cfg.modLogChannelId ? `<#${cfg.modLogChannelId}>` : "Not set"}`,
        `**Welcome:** ${cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : "Not set"}`,
        `**Anti-Spam:** ${cfg.antispamEnabled ? "✅ On" : "❌ Off"}`,
        `**Auto-Mod:** ${cfg.automodEnabled ? "✅ On" : "❌ Off"}`,
      ].join("\n"), inline: false },
      { name: "📋  Quick-Start Commands", value: [
        "`/setlog` — Set mod log channel",
        "`/welcome` — Set welcome channel & message",
        "`/setrole` — Assign mod/admin roles",
        "`/antispam` — Toggle anti-spam protection",
        "`/automod` — Toggle automod rules",
        "`/censor` — Enable live moderation scanner",
      ].join("\n"), inline: false },
    )
    .setThumbnail(guild.iconURL() ?? null)
    .setFooter({ text: FOOT })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── /prefix ───────────────────────────────────────────────────────────────────
export const prefixData = new SlashCommandBuilder()
  .setName("prefix")
  .setDescription("View or change the bot prefix for legacy text commands.")
  .setDefaultMemberPermissions(ADMIN)
  .addStringOption((o) => o.setName("new_prefix").setDescription("New prefix (leave empty to view current)").setRequired(false));

export async function executePrefix(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId    = interaction.guildId!;
  const cfg        = getGuildCfg(guildId);
  const newPrefix  = interaction.options.getString("new_prefix");

  if (!newPrefix) {
    await interaction.editReply({ embeds: [adminEmbed(0x3b82f6, "⚙️  PREFIX CONFIG", `${HR}\n▸  **Current Prefix** — \`${cfg.prefix ?? "/"}\`\n▸  **Slash Commands** — always \`/\`\n${HR}\n\nUse \`/prefix new_prefix:<symbol>\` to change it.`)] });
    return;
  }
  if (newPrefix.length > 5) { await interaction.editReply({ content: "❌ Prefix must be 5 characters or less." }); return; }
  cfg.prefix = newPrefix;
  saveCfg();
  await interaction.editReply({ embeds: [adminEmbed(0x2ecc71, "✅  PREFIX UPDATED", `${HR}\n▸  **New Prefix** — \`${newPrefix}\`\n${HR}`)] });
}

// ── /setrole ──────────────────────────────────────────────────────────────────
export const setroleData = new SlashCommandBuilder()
  .setName("setrole")
  .setDescription("Assign the mod or admin role for bot permission checks.")
  .setDefaultMemberPermissions(ADMIN)
  .addStringOption((o) => o.setName("type").setDescription("Which role type").setRequired(true)
    .addChoices({ name: "Moderator", value: "mod" }, { name: "Admin", value: "admin" }))
  .addRoleOption((o) => o.setName("role").setDescription("Role to assign").setRequired(true));

export async function executeSetrole(interaction: ChatInputCommandInteraction): Promise<void> {
  const type    = interaction.options.getString("type", true);
  const role    = interaction.options.getRole("role", true);
  const guildId = interaction.guildId!;
  const cfg     = getGuildCfg(guildId);
  if (type === "mod")   cfg.modRoleId   = role.id;
  else                  cfg.adminRoleId  = role.id;
  saveCfg();
  const label = type === "mod" ? "Moderator" : "Admin";
  await interaction.editReply({ embeds: [adminEmbed(0x2ecc71, "✅  ROLE ASSIGNED", `${HR}\n▸  **Type** — \`${label}\`\n▸  **Role** — <@&${role.id}>\n${HR}`)] });
}

// ── /setlog ───────────────────────────────────────────────────────────────────
export const setlogData = new SlashCommandBuilder()
  .setName("setlog")
  .setDescription("Set the moderation log channel for this server.")
  .setDefaultMemberPermissions(ADMIN)
  .addChannelOption((o) => o.setName("channel").setDescription("Mod log channel").setRequired(true));

export async function executeSetlog(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel("channel", true) as TextChannel;
  const cfg     = getGuildCfg(interaction.guildId!);
  cfg.modLogChannelId = channel.id;
  saveCfg();
  await interaction.editReply({ embeds: [adminEmbed(0x2ecc71, "📋  MOD LOG SET", `${HR}\n▸  **Channel** — <#${channel.id}>\n${HR}\nAll moderation actions will be logged there.`)] });
}

// ── /antispam ─────────────────────────────────────────────────────────────────
export const antispamData = new SlashCommandBuilder()
  .setName("antispam")
  .setDescription("Toggle the anti-spam shield for this server.")
  .setDefaultMemberPermissions(ADMIN)
  .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable anti-spam").setRequired(true));

export async function executeAntispam(interaction: ChatInputCommandInteraction): Promise<void> {
  const enabled = interaction.options.getBoolean("enabled", true);
  const cfg     = getGuildCfg(interaction.guildId!);
  cfg.antispamEnabled = enabled;
  saveCfg();
  const status = enabled ? "✅ **ACTIVE**" : "❌ **INACTIVE**";
  await interaction.editReply({ embeds: [adminEmbed(enabled ? 0x2ecc71 : 0xe74c3c, `🛡️  ANTI-SPAM ${enabled ? "ENABLED" : "DISABLED"}`,
    `${HR}\n▸  **Status** — ${status}\n${HR}\n${enabled ? "The anti-spam shield is now protecting your server from message floods, mention spam, and link spam." : "Anti-spam protection has been disabled."}`)] });
}

// ── /automod ──────────────────────────────────────────────────────────────────
export const automodData = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("Toggle Discord's native AutoMod rules (fast join, mention spam, etc.).")
  .setDefaultMemberPermissions(ADMIN)
  .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable automod").setRequired(true));

export async function executeAutomod(interaction: ChatInputCommandInteraction): Promise<void> {
  const enabled = interaction.options.getBoolean("enabled", true);
  const cfg     = getGuildCfg(interaction.guildId!);
  cfg.automodEnabled = enabled;
  saveCfg();
  await interaction.editReply({ embeds: [adminEmbed(enabled ? 0x2ecc71 : 0xe74c3c, `🤖  AUTOMOD ${enabled ? "ENABLED" : "DISABLED"}`,
    `${HR}\n▸  **Status** — ${enabled ? "✅ **ACTIVE**" : "❌ **INACTIVE**"}\n${HR}\n${enabled ? "AutoMod rules are enabled. Discord's native filters will block harmful content automatically." : "AutoMod has been disabled. Configure rules via Server Settings → AutoMod."}`)] });
}

// ── /backup ───────────────────────────────────────────────────────────────────
export const adminBackupData = new SlashCommandBuilder()
  .setName("backup")
  .setDescription("Create a snapshot of this server's configuration.")
  .setDefaultMemberPermissions(ADMIN);

export async function executeAdminBackup(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const roles  = guild.roles.cache.filter((r) => r.id !== guild.id).map((r) => `• **${r.name}** — ${r.members.size} members`).slice(0, 15).join("\n") || "None";
  const channels = guild.channels.cache.size;

  const snapshot = {
    guildId:   guild.id,
    guildName: guild.name,
    memberCount: guild.memberCount,
    channelCount: channels,
    roleCount: guild.roles.cache.size,
    createdAt: guild.createdAt.toISOString(),
    snapshotAt: new Date().toISOString(),
    config: getGuildCfg(guild.id),
  };

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({ name: "LAST STAND  ·  SERVER SNAPSHOT" })
    .setTitle("📸  SERVER BACKUP CREATED")
    .setDescription(`${HR}\n▸  **Server** — ${guild.name}\n▸  **Members** — ${guild.memberCount}\n▸  **Channels** — ${channels}\n▸  **Roles** — ${guild.roles.cache.size}\n${HR}`)
    .addFields({ name: "🔑  Roles (top 15)", value: roles, inline: false })
    .setThumbnail(guild.iconURL() ?? null)
    .setFooter({ text: FOOT })
    .setTimestamp();

  const buf = Buffer.from(JSON.stringify(snapshot, null, 2), "utf-8");
  const { AttachmentBuilder } = await import("discord.js");
  const file = new AttachmentBuilder(buf, { name: `backup-${guild.id}-${Date.now()}.json` });

  await interaction.editReply({ embeds: [embed], files: [file] });
}

// ── /auditlog ─────────────────────────────────────────────────────────────────
export const auditlogData = new SlashCommandBuilder()
  .setName("auditlog")
  .setDescription("View recent Discord audit log entries for this server.")
  .setDefaultMemberPermissions(ADMIN)
  .addIntegerOption((o) => o.setName("limit").setDescription("Number of entries to show (1–15)").setMinValue(1).setMaxValue(15).setRequired(false));

export async function executeAuditlog(interaction: ChatInputCommandInteraction): Promise<void> {
  const limit = interaction.options.getInteger("limit") ?? 10;
  if (!interaction.guild) { await interaction.editReply({ content: "❌ Not in a guild." }); return; }
  const logs  = await interaction.guild.fetchAuditLogs({ limit }).catch(() => null);
  if (!logs) { await interaction.editReply({ content: "❌ Could not fetch audit logs. Make sure I have **View Audit Log** permission." }); return; }
  const lines = [...logs.entries.values()].map((e) => {
    const time = `<t:${Math.floor(e.createdTimestamp / 1000)}:t>`;
    const by   = e.executor ? `<@${e.executor.id}>` : "Unknown";
    const tgt  = e.target && "id" in e.target ? `<@${(e.target as { id: string }).id}>` : "—";
    return `${time} · **${e.action}** · by ${by} → ${tgt}`;
  }).join("\n") || "No entries found.";

  await interaction.editReply({ embeds: [adminEmbed(0x6366f1, "📜  AUDIT LOG HISTORY", `${HR}\n${lines}\n${HR}`)] });
}

// ── /config ───────────────────────────────────────────────────────────────────
export const configData = new SlashCommandBuilder()
  .setName("config")
  .setDescription("View the current bot configuration for this server.")
  .setDefaultMemberPermissions(ADMIN);

export async function executeConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const cfg = getGuildCfg(interaction.guildId!);
  const lines = [
    `**Prefix:** \`${cfg.prefix ?? "/"}\``,
    `**Mod Log:** ${cfg.modLogChannelId ? `<#${cfg.modLogChannelId}>` : "Not set"}`,
    `**Welcome Channel:** ${cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : "Not set"}`,
    `**Welcome Message:** ${cfg.welcomeMessage ? `\`${cfg.welcomeMessage.slice(0, 60)}${cfg.welcomeMessage.length > 60 ? "…" : ""}\`` : "Default"}`,
    `**Mod Role:** ${cfg.modRoleId ? `<@&${cfg.modRoleId}>` : "Not set"}`,
    `**Admin Role:** ${cfg.adminRoleId ? `<@&${cfg.adminRoleId}>` : "Not set"}`,
    `**Anti-Spam:** ${cfg.antispamEnabled ? "✅ On" : "❌ Off"}`,
    `**AutoMod:** ${cfg.automodEnabled ? "✅ On" : "❌ Off"}`,
  ].join("\n");

  await interaction.editReply({ embeds: [adminEmbed(0x3b82f6, "⚙️  BOT SETTINGS", `${HR}\n${lines}\n${HR}`)] });
}

// ── /permission ───────────────────────────────────────────────────────────────
export const permissionData = new SlashCommandBuilder()
  .setName("permission")
  .setDescription("Check or view this bot's permissions in the server.")
  .setDefaultMemberPermissions(ADMIN);

export async function executePermission(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild  = interaction.guild!;
  const me     = guild.members.me;
  if (!me) { await interaction.editReply({ content: "❌ Could not fetch bot member." }); return; }
  const perms  = me.permissions;
  const checks: [string, bigint][] = [
    ["Send Messages",     PermissionFlagsBits.SendMessages],
    ["Embed Links",       PermissionFlagsBits.EmbedLinks],
    ["Manage Messages",   PermissionFlagsBits.ManageMessages],
    ["Kick Members",      PermissionFlagsBits.KickMembers],
    ["Ban Members",       PermissionFlagsBits.BanMembers],
    ["Moderate Members",  PermissionFlagsBits.ModerateMembers],
    ["View Audit Log",    PermissionFlagsBits.ViewAuditLog],
    ["Manage Channels",   PermissionFlagsBits.ManageChannels],
    ["Manage Roles",      PermissionFlagsBits.ManageRoles],
    ["Attach Files",      PermissionFlagsBits.AttachFiles],
  ];
  const lines = checks.map(([name, flag]) => `${perms.has(flag) ? "✅" : "❌"} **${name}**`).join("\n");
  await interaction.editReply({ embeds: [adminEmbed(0x6366f1, "🔑  BOT PERMISSIONS", `${HR}\n${lines}\n${HR}`)] });
}

// ── /welcome ──────────────────────────────────────────────────────────────────
export const welcomeData = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Set the welcome channel and greeting message for new members.")
  .setDefaultMemberPermissions(ADMIN)
  .addChannelOption((o) => o.setName("channel").setDescription("Welcome channel").setRequired(true))
  .addStringOption((o) => o.setName("message").setDescription("Welcome message ({user} = mention, {server} = server name)").setRequired(false));

export async function executeWelcome(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel("channel", true) as TextChannel;
  const message = interaction.options.getString("message") ?? "Welcome to **{server}**, {user}! 🎉";
  const cfg     = getGuildCfg(interaction.guildId!);
  cfg.welcomeChannelId = channel.id;
  cfg.welcomeMessage   = message;
  saveCfg();

  const preview = message.replace("{user}", `@${interaction.user.username}`).replace("{server}", interaction.guild?.name ?? "Server");
  await interaction.editReply({ embeds: [adminEmbed(0x2ecc71, "🎉  WELCOME CONFIGURED", `${HR}\n▸  **Channel** — <#${channel.id}>\n▸  **Preview** — ${preview}\n${HR}`)] });
}

// ── /embed ────────────────────────────────────────────────────────────────────
export const embedData = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Send a custom embed message to a channel.")
  .setDefaultMemberPermissions(ADMIN)
  .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(true))
  .addStringOption((o) => o.setName("description").setDescription("Embed body text").setRequired(true))
  .addStringOption((o) => o.setName("color").setDescription("Hex color e.g. #FF5733 (default: blurple)").setRequired(false))
  .addChannelOption((o) => o.setName("channel").setDescription("Target channel (default: current)").setRequired(false));

export async function executeEmbed(interaction: ChatInputCommandInteraction): Promise<void> {
  const title   = interaction.options.getString("title", true);
  const desc    = interaction.options.getString("description", true);
  const colorStr = interaction.options.getString("color") ?? "#5865F2";
  const channel = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel | null;

  if (!channel || !("send" in channel)) { await interaction.editReply({ content: "❌ Cannot send to that channel." }); return; }

  let color = 0x5865f2;
  try { color = parseInt(colorStr.replace("#", ""), 16); } catch { /**/ }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: `Posted by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ Embed sent to <#${channel.id}>.` });
}

// ── ?addroletoallchannelsandcategory ─────────────────────────────────────────
export async function handleAddRoleToAllChannels(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!(message.member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ content: "You need **Manage Server** permission to use this command." });
    return;
  }

  const guild = message.guild;
  const unverifiedRole = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === "unverified",
  );

  if (!unverifiedRole) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("Role Not Found")
      .setDescription(
        "No role named **unverified** found in this server.\n\n" +
        "Create a role called `unverified` first, then run this command again.",
      );
    await (message.channel as TextChannel).send({ embeds: [embed] });
    return;
  }

  const progressEmbed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("⚙️ Updating Channel Permissions...")
    .setDescription(
      `Adding **@${unverifiedRole.name}** to all channels and categories with **View Channel → Denied**.\nThis may take a moment...`,
    );
  const progressMsg = await (message.channel as TextChannel).send({ embeds: [progressEmbed] });

  const channels = await guild.channels.fetch();
  const deny: PermissionOverwriteOptions = { ViewChannel: false };

  let success = 0;
  let failed = 0;
  const failedNames: string[] = [];

  for (const [, channel] of channels) {
    if (!channel) continue;
    try {
      await channel.permissionOverwrites.edit(
        unverifiedRole,
        deny,
        { reason: `?addroletoallchannelsandcategory by ${message.author.tag}`, type: OverwriteType.Role },
      );
      success++;
    } catch {
      failed++;
      if (failedNames.length < 10) failedNames.push(`#${channel.name}`);
    }
  }

  const lines: string[] = [
    `✅ Updated **${success}** channel${success !== 1 ? "s" : ""} and categor${success !== 1 ? "ies" : "y"}`,
  ];
  if (failed > 0) {
    lines.push(
      `⚠️ Skipped **${failed}** — bot lacks permission there`,
    );
    if (failedNames.length > 0) {
      lines.push(
        `\`${failedNames.join("`, `")}${failed > 10 ? `\` + ${failed - 10} more` : "`"}`,
      );
    }
  }

  const doneEmbed = new EmbedBuilder()
    .setColor(failed > 0 ? 0xffaa00 : 0x00ffff)
    .setTitle(failed > 0 ? "Done (partial)" : "Done")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `@${unverifiedRole.name} · View Channel → Denied on all channels & categories` })
    .setTimestamp();

  await progressMsg.edit({ embeds: [doneEmbed] });
}
