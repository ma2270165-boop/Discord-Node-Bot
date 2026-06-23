import type { Client, Guild } from "discord.js";
import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
import { getConfig, getWhitelist, recordAction } from "./store.js";
import type { ActionType } from "./store.js";
import { quarantine } from "./mitigation.js";
import { recordChannelSnap, recordRoleSnap, recordBanSnap } from "./snapshot.js";
import { postAntiNukeLog } from "./logger.js";

// Discord audit log takes ~1–2 seconds to populate after an action.
const AUDIT_DELAY_MS = 1_500;

// Fetch the most recent audit log entry of a given type within 8 seconds.
async function resolveExecutor(
  guild: Guild,
  auditEvent: AuditLogEvent,
): Promise<string | null> {
  await new Promise<void>(res => setTimeout(res, AUDIT_DELAY_MS));
  try {
    const logs  = await guild.fetchAuditLogs({ type: auditEvent, limit: 5 });
    const entry = logs.entries.find(e => Date.now() - e.createdTimestamp < 8_000);
    return entry?.executor?.id ?? null;
  } catch { return null; }
}

// Central handler: check whitelist + config, record action, trigger quarantine.
// Returns true if quarantine was triggered.
async function handleAction(
  client: Client,
  guild: Guild,
  executorId: string,
  action: ActionType,
  details: string,
): Promise<boolean> {
  const config = await getConfig(guild.id);
  if (!config.enabled) return false;

  const botId = client.user!.id;
  if (executorId === guild.ownerId || executorId === botId) return false;

  const whitelist = await getWhitelist(guild.id);
  if (whitelist.has(executorId)) return false;

  const triggered = recordAction(guild.id, executorId, action, config);
  if (triggered) {
    await quarantine(client, guild, executorId, action, details);

    // Post a quarantine alert to the log channel
    const alertEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle("🚨 ANTI-NUKE — OFFENDER QUARANTINED")
      .setDescription(
        `<@${executorId}> crossed the **${action}** threshold and has been quarantined.\n\n` +
        `**Last action:** ${details}\n\n` +
        `All their roles have been stripped. Use \`?antinuke restore <@${executorId}>\` to undo the damage.`,
      )
      .setTimestamp();
    await postAntiNukeLog(client, guild, alertEmbed);
    return true;
  }
  return false;
}

export function registerAntiNukeEvents(client: Client): void {

  // ── Channel Delete ────────────────────────────────────────────────────────
  client.on(Events.ChannelDelete, (channel) => {
    if (channel.isDMBased()) return;
    const guild = channel.guild;
    const chSnap = channel;
    void (async () => {
      const executorId = await resolveExecutor(guild, AuditLogEvent.ChannelDelete);
      if (!executorId) return;
      recordChannelSnap(guild.id, executorId, chSnap);
      const name = "name" in channel ? String(channel.name) : "unknown";

      const embed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle("🗑️ Channel Deleted")
        .addFields(
          { name: "Channel",  value: `**#${name}**`,        inline: true },
          { name: "By",       value: `<@${executorId}>`,    inline: true },
          { name: "Type",     value: `\`${channel.type}\``, inline: true },
        )
        .setFooter({ text: `Executor ID: ${executorId}` })
        .setTimestamp();
      await postAntiNukeLog(client, guild, embed);

      await handleAction(client, guild, executorId, "channelDelete", `Deleted channel: **#${name}**`);
    })().catch(err => console.error("[ANTINUKE] channelDelete handler:", err));
  });

  // ── Role Delete ───────────────────────────────────────────────────────────
  client.on(Events.GuildRoleDelete, (role) => {
    const guild = role.guild;
    void (async () => {
      const executorId = await resolveExecutor(guild, AuditLogEvent.RoleDelete);
      if (!executorId) return;
      recordRoleSnap(guild.id, executorId, role);

      const embed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle("🗑️ Role Deleted")
        .addFields(
          { name: "Role",     value: `**${role.name}**`,   inline: true },
          { name: "By",       value: `<@${executorId}>`,   inline: true },
          { name: "Color",    value: role.hexColor,         inline: true },
        )
        .setFooter({ text: `Executor ID: ${executorId}` })
        .setTimestamp();
      await postAntiNukeLog(client, guild, embed);

      await handleAction(client, guild, executorId, "roleDelete", `Deleted role: **${role.name}**`);
    })().catch(err => console.error("[ANTINUKE] roleDelete handler:", err));
  });

  // ── Ban Add ───────────────────────────────────────────────────────────────
  client.on(Events.GuildBanAdd, (ban) => {
    const guild = ban.guild;
    void (async () => {
      const executorId = await resolveExecutor(guild, AuditLogEvent.MemberBanAdd);
      if (!executorId) return;
      recordBanSnap(guild.id, executorId, ban);
      const tag = ban.user.tag ?? ban.user.id;

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle("🔨 Member Banned")
        .setThumbnail(ban.user.displayAvatarURL({ size: 64 }))
        .addFields(
          { name: "User",   value: `<@${ban.user.id}> (${tag})`, inline: true },
          { name: "By",     value: `<@${executorId}>`,           inline: true },
          { name: "Reason", value: ban.reason ?? "*No reason provided*", inline: false },
        )
        .setFooter({ text: `User ID: ${ban.user.id}` })
        .setTimestamp();
      await postAntiNukeLog(client, guild, embed);

      await handleAction(client, guild, executorId, "ban", `Banned user: **${tag}**`);
    })().catch(err => console.error("[ANTINUKE] guildBanAdd handler:", err));
  });

  // ── Kick ──────────────────────────────────────────────────────────────────
  client.on(Events.GuildMemberRemove, (member) => {
    const guild = member.guild;
    void (async () => {
      await new Promise<void>(res => setTimeout(res, AUDIT_DELAY_MS));
      try {
        const logs  = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 });
        const entry = logs.entries.find(
          e => e.target?.id === member.id && Date.now() - e.createdTimestamp < 8_000,
        );
        if (!entry?.executor) return; // was a leave, not a kick

        const executorId = entry.executor.id;
        const tag = member.user?.tag ?? member.id;

        const embed = new EmbedBuilder()
          .setColor(0xFF8C00)
          .setTitle("👢 Member Kicked")
          .setThumbnail(member.user?.displayAvatarURL({ size: 64 }) ?? null)
          .addFields(
            { name: "User",   value: `<@${member.id}> (${tag})`,    inline: true },
            { name: "By",     value: `<@${executorId}>`,             inline: true },
            { name: "Reason", value: entry.reason ?? "*No reason provided*", inline: false },
          )
          .setFooter({ text: `User ID: ${member.id}` })
          .setTimestamp();
        await postAntiNukeLog(client, guild, embed);

        await handleAction(client, guild, executorId, "kick", `Kicked user: **${tag}**`);
      } catch { /* ignore */ }
    })().catch(err => console.error("[ANTINUKE] kick handler:", err));
  });

  // ── Guild Update ──────────────────────────────────────────────────────────
  client.on(Events.GuildUpdate, (oldGuild, newGuild) => {
    void (async () => {
      const changes: string[] = [];
      if (oldGuild.name !== newGuild.name)
        changes.push(`Name: \`${oldGuild.name}\` → \`${newGuild.name}\``);
      if (oldGuild.mfaLevel !== newGuild.mfaLevel)
        changes.push("MFA requirement changed");
      if (oldGuild.verificationLevel !== newGuild.verificationLevel)
        changes.push("Verification level changed");
      if (changes.length === 0) return;

      const executorId = await resolveExecutor(newGuild, AuditLogEvent.GuildUpdate);
      if (!executorId) return;

      const embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle("⚠️ Server Settings Updated")
        .addFields(
          { name: "Changes",  value: changes.join("\n"), inline: false },
          { name: "By",       value: `<@${executorId}>`, inline: true  },
        )
        .setFooter({ text: `Executor ID: ${executorId}` })
        .setTimestamp();
      await postAntiNukeLog(client, newGuild, embed);

      await handleAction(client, newGuild, executorId, "guildUpdate", changes.join("\n"));
    })().catch(err => console.error("[ANTINUKE] guildUpdate handler:", err));
  });

  // ── Webhook Create ────────────────────────────────────────────────────────
  client.on(Events.WebhooksUpdate, (channel) => {
    if (channel.isDMBased()) return;
    const guild = channel.guild;
    void (async () => {
      const executorId = await resolveExecutor(guild, AuditLogEvent.WebhookCreate);
      if (!executorId) return;
      const name = "name" in channel ? String(channel.name) : "unknown";

      const embed = new EmbedBuilder()
        .setColor(0xAA44FF)
        .setTitle("🪝 Webhook Created")
        .addFields(
          { name: "Channel", value: `**#${name}**`,     inline: true },
          { name: "By",      value: `<@${executorId}>`, inline: true },
        )
        .setFooter({ text: `Executor ID: ${executorId}` })
        .setTimestamp();
      await postAntiNukeLog(client, guild, embed);

      await handleAction(client, guild, executorId, "webhookCreate", `Webhook created in **#${name}**`);
    })().catch(err => console.error("[ANTINUKE] webhookCreate handler:", err));
  });

  // ── Emoji Delete ──────────────────────────────────────────────────────────
  client.on(Events.GuildEmojiDelete, (emoji) => {
    const guild = emoji.guild;
    void (async () => {
      const executorId = await resolveExecutor(guild, AuditLogEvent.EmojiDelete);
      if (!executorId) return;

      const embed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle("🗑️ Emoji Deleted")
        .addFields(
          { name: "Emoji", value: `**:${emoji.name}:**`, inline: true },
          { name: "By",    value: `<@${executorId}>`,    inline: true },
        )
        .setFooter({ text: `Executor ID: ${executorId}` })
        .setTimestamp();
      await postAntiNukeLog(client, guild, embed);

      await handleAction(client, guild, executorId, "emojiDelete", `Deleted emoji: **:${emoji.name}:**`);
    })().catch(err => console.error("[ANTINUKE] emojiDelete handler:", err));
  });

  console.log("[ANTINUKE] Event listeners registered (channelDelete, roleDelete, ban, kick, guildUpdate, webhookCreate, emojiDelete)");
}
