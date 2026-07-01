import type { Message, TextChannel, Client } from "discord.js";
import { EmbedBuilder, ChannelType, OverwriteType } from "discord.js";
import {
  getConfig,
  saveConfig,
  getWhitelist,
  saveWhitelist,
} from "./store.js";
import type { PunishAction } from "./store.js";
import { getSnap, clearSnap } from "./snapshot.js";

const COLOR_OK  = 0x00FFFF;
const COLOR_ERR = 0xFF4444;
const COLOR_INF = 0x2F3136;
const COLOR_WIN = 0x00FF99;

const LOWO_OWNER_ID = process.env.LOWO_OWNER_ID ?? "";

function requireLowoOwner(message: Message): boolean {
  if (!LOWO_OWNER_ID || message.author.id !== LOWO_OWNER_ID) return false;
  return true;
}

// ─── RESTORE ──────────────────────────────────────────────────────────────────
async function runRestore(message: Message, client: Client, offenderId: string): Promise<void> {
  const guild = message.guild!;

  if (message.author.id !== guild.ownerId) {
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(COLOR_ERR)
        .setDescription("❌ Only the **server owner** can run a restore."),
    ]});
    return;
  }

  const snap = getSnap(guild.id, offenderId);
  if (!snap) {
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(COLOR_ERR)
        .setDescription(
          "❌ No snapshot found for that user.\n" +
          "Snapshots are captured when the anti-nuke fires and cleared after a restore.\n" +
          "They are also lost if the bot restarts.",
        ),
    ]});
    return;
  }

  const status = await message.reply({ embeds: [
    new EmbedBuilder().setColor(0xFFAA00)
      .setTitle("🔄 Restore in progress…")
      .setDescription(
        `Restoring **${snap.roles.length}** role(s), **${snap.channels.length}** channel(s), ` +
        `and unbanning **${snap.bans.length}** member(s).\nThis may take a moment…`,
      ),
  ]});

  let rolesOk = 0, rolesFail = 0;
  let chOk = 0, chFail = 0;
  let unbanOk = 0, unbanFail = 0, dmOk = 0;

  // ── 1. Recreate roles ─────────────────────────────────────────────────────
  const roleIdMap   = new Map<string, string>();
  const sortedRoles = [...snap.roles].sort((a, b) => a.position - b.position);

  for (const r of sortedRoles) {
    try {
      let icon: Buffer | undefined;
      if (r.iconURL) {
        try {
          const ir = await fetch(r.iconURL, { signal: AbortSignal.timeout(5_000) });
          if (ir.ok) icon = Buffer.from(await ir.arrayBuffer());
        } catch { /* icon optional */ }
      }
      const created = await guild.roles.create({
        name:        r.name,
        color:       r.color,
        hoist:       r.hoist,
        mentionable: r.mentionable,
        permissions: BigInt(r.permissions),
        ...(icon           ? { icon }                         : {}),
        ...(r.unicodeEmoji ? { unicodeEmoji: r.unicodeEmoji } : {}),
        reason: `Anti-Nuke restore — role deleted by <@${offenderId}>`,
      });
      roleIdMap.set(r.id, created.id);
      rolesOk++;
    } catch (e) {
      console.error(`[RESTORE] Role "${r.name}" failed:`, e);
      rolesFail++;
    }
  }

  // ── 2. Recreate channels ──────────────────────────────────────────────────
  const categories  = snap.channels.filter(c => c.type === ChannelType.GuildCategory);
  const others      = snap.channels.filter(c => c.type !== ChannelType.GuildCategory);
  const allOrdered  = [
    ...categories.sort((a, b) => a.position - b.position),
    ...others.sort((a, b) => a.position - b.position),
  ];
  const channelIdMap = new Map<string, string>();

  for (const ch of allOrdered) {
    try {
      const permissionOverwrites = ch.overwrites.map((ow) => ({
        id:    roleIdMap.get(ow.id) ?? ow.id,
        type:  ow.type as OverwriteType,
        allow: BigInt(ow.allow),
        deny:  BigInt(ow.deny),
      }));
      const parent = ch.parentId ? (channelIdMap.get(ch.parentId) ?? null) : null;
      const opts: Parameters<typeof guild.channels.create>[0] = {
        name:               ch.name,
        type:               ch.type as ChannelType.GuildText,
        position:           ch.position,
        permissionOverwrites,
        reason: `Anti-Nuke restore — channel deleted by <@${offenderId}>`,
        ...(parent                              ? { parent }                               : {}),
        ...(ch.topic                            ? { topic: ch.topic }                      : {}),
        ...(ch.nsfw                             ? { nsfw: ch.nsfw }                        : {}),
        ...(ch.rateLimitPerUser                 ? { rateLimitPerUser: ch.rateLimitPerUser } : {}),
        ...(ch.bitrate !== null                 ? { bitrate: ch.bitrate }                  : {}),
        ...(ch.userLimit !== null && ch.userLimit > 0 ? { userLimit: ch.userLimit }       : {}),
      };
      const created = await guild.channels.create(opts);
      channelIdMap.set(ch.id, created.id);
      chOk++;
    } catch (e) {
      console.error(`[RESTORE] Channel "${ch.name}" failed:`, e);
      chFail++;
    }
  }

  // ── 3. Unban members ──────────────────────────────────────────────────────
  const inviteSource = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.viewable,
  ) as TextChannel | undefined;

  for (const ban of snap.bans) {
    try {
      await guild.members.unban(ban.userId, `Anti-Nuke restore — wrongfully banned by <@${offenderId}>`);
      unbanOk++;

      let inviteUrl = `https://discord.gg/${guild.id}`;
      if (inviteSource) {
        try {
          const inv = await inviteSource.createInvite({
            maxAge: 0, maxUses: 1, unique: true, reason: "Anti-Nuke restore",
          });
          inviteUrl = inv.url;
        } catch { /* use fallback */ }
      }

      try {
        const user    = await client.users.fetch(ban.userId);
        const dmEmbed = new EmbedBuilder()
          .setColor(COLOR_WIN)
          .setTitle(`We sincerely apologise — ${guild.name}`)
          .setThumbnail(guild.iconURL({ size: 256 }))
          .setDescription(
            `Hey **${ban.username}**,\n\n` +
            `A **rogue actor** gained access and attempted to nuke our server — ` +
            `banning innocent members including you in the process.\n\n` +
            `You have been **fully unbanned**. We'd love to have you back:\n\n` +
            `**[➡️ Click here to rejoin ${guild.name}](${inviteUrl})**\n` +
            `*(Single-use link, made just for you)*`,
          )
          .setFooter({ text: `${guild.name} • Anti-Nuke Protection System` })
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
        dmOk++;
      } catch { /* DMs closed — unban still happened */ }
    } catch (e) {
      console.error(`[RESTORE] Unban ${ban.userId} failed:`, e);
      unbanFail++;
    }
  }

  clearSnap(guild.id, offenderId);

  await status.edit({ embeds: [
    new EmbedBuilder()
      .setColor(COLOR_WIN)
      .setTitle("✅ Anti-Nuke Restore Complete")
      .setDescription(`Offender: <@${offenderId}>`)
      .addFields(
        {
          name: "🎭 Roles",
          value: `✅ Recreated: **${rolesOk}**${rolesFail > 0 ? `\n❌ Failed: **${rolesFail}**` : ""}`,
          inline: true,
        },
        {
          name: "📁 Channels",
          value: `✅ Recreated: **${chOk}**${chFail > 0 ? `\n❌ Failed: **${chFail}**` : ""}`,
          inline: true,
        },
        {
          name: "🔓 Unbans",
          value: `✅ Unbanned: **${unbanOk}**\n📬 DM'd: **${dmOk}**${unbanFail > 0 ? `\n❌ Failed: **${unbanFail}**` : ""}`,
          inline: true,
        },
        {
          name: "ℹ️ Note",
          value: "Role positions are approximate — re-order manually if needed. Restore only works if punishment was `strip`.",
        },
      )
      .setTimestamp(),
  ]});
}

// ─── MAIN COMMAND ROUTER ──────────────────────────────────────────────────────

export async function handleAntiNukeCommand(message: Message, client: Client): Promise<void> {
  if (!message.guild) return;
  if (!requireLowoOwner(message)) return;

  const parts = message.content.trim().split(/\s+/);
  const sub   = parts[1]?.toLowerCase();

  if (!sub || sub === "help") {
    await message.reply({ embeds: [buildHelpEmbed()] });
    return;
  }

  const guildId = message.guild.id;

  // ── ?antinuke enable / disable ────────────────────────────────────────────
  if (sub === "enable" || sub === "disable") {
    const cfg = await getConfig(guildId);
    cfg.enabled = sub === "enable";
    await saveConfig(guildId, cfg);
    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(cfg.enabled ? COLOR_OK : COLOR_ERR)
        .setDescription(
          cfg.enabled
            ? "✅ Anti-Nuke **enabled**. Monitoring is active."
            : "⛔ Anti-Nuke **disabled**.",
        ),
    ]});
    return;
  }

  // ── ?antinuke setpunish ban|kick|strip ────────────────────────────────────
  if (sub === "setpunish") {
    const choice = parts[2]?.toLowerCase();
    const valid: PunishAction[] = ["ban", "kick", "strip"];
    if (!choice || !valid.includes(choice as PunishAction)) {
      await message.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR_ERR).setDescription(
          "❌ Choose a punishment:\n" +
          "`?antinuke setpunish ban` — permanently ban the offender\n" +
          "`?antinuke setpunish kick` — kick (they can rejoin, but lose admin access immediately)\n" +
          "`?antinuke setpunish strip` — remove all roles *(default, reversible via restore)*\n\n" +
          "⚠️ **Bots are always banned regardless of this setting.**",
        ),
      ]});
      return;
    }
    const cfg = await getConfig(guildId);
    cfg.punishAction = choice as PunishAction;
    await saveConfig(guildId, cfg);
    const icons: Record<PunishAction, string> = { ban: "🔨", kick: "👢", strip: "🎭" };
    const desc: Record<PunishAction, string> = {
      ban:   "Offenders will be **permanently banned** when a threshold is crossed.",
      kick:  "Offenders will be **kicked** from the server.",
      strip: "Offenders will have **all roles removed**. Use `?antinuke restore @user` to undo.",
    };
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(COLOR_OK).setDescription(
        `${icons[cfg.punishAction]} Punishment set to **\`${cfg.punishAction}\`**.\n\n${desc[cfg.punishAction]}`,
      ),
    ]});
    return;
  }

  // ── ?antinuke log #channel ────────────────────────────────────────────────
  if (sub === "log") {
    const channel = message.mentions.channels.first()
                 ?? (parts[2] ? message.guild.channels.cache.get(parts[2]) : undefined);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await message.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Mention a valid text channel. Example: `?antinuke log #security-logs`"),
      ]});
      return;
    }
    const cfg = await getConfig(guildId);
    cfg.logChannelId = channel.id;
    await saveConfig(guildId, cfg);
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ Anti-Nuke logs → <#${channel.id}>`),
    ]});
    return;
  }

  // ── ?antinuke logs p add/remove/list ─────────────────────────────────────
  if (sub === "logs") {
    const action   = parts[2]?.toLowerCase();
    const modifier = parts[3]?.toLowerCase();

    if (action !== "p") {
      await message.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR_ERR).setDescription(
          "❌ Unknown sub-command.\n\n" +
          "`?antinuke logs p add @user`\n`?antinuke logs p remove @user`\n`?antinuke logs p list`",
        ),
      ]});
      return;
    }

    const cfg = await getConfig(guildId);
    cfg.logPingIds ??= [];

    if (modifier === "add") {
      const target = message.mentions.users.first() ?? (parts[4] ? { id: parts[4] } : null);
      if (!target) {
        await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Mention a user: `?antinuke logs p add @user`")] });
        return;
      }
      if (!cfg.logPingIds.includes(target.id)) {
        cfg.logPingIds.push(target.id);
        await saveConfig(guildId, cfg);
      }
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ <@${target.id}> will be pinged on every anti-nuke log.`)] });
      return;
    }

    if (modifier === "remove") {
      const target = message.mentions.users.first() ?? (parts[4] ? { id: parts[4] } : null);
      if (!target) {
        await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Mention a user: `?antinuke logs p remove @user`")] });
        return;
      }
      cfg.logPingIds = cfg.logPingIds.filter(id => id !== target.id);
      await saveConfig(guildId, cfg);
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ <@${target.id}> removed from log pings.`)] });
      return;
    }

    const ids    = cfg.logPingIds;
    const logRef = cfg.logChannelId ? `<#${cfg.logChannelId}>` : "*not set*";
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(COLOR_INF).setTitle("📋 Anti-Nuke Log Pings")
        .addFields(
          { name: "Log Channel", value: logRef, inline: false },
          {
            name: "Pinged Users",
            value: ids.length === 0
              ? "*None — add with `?antinuke logs p add @user`*"
              : ids.map(id => `<@${id}> (\`${id}\`)`).join("\n"),
            inline: false,
          },
        ),
    ]});
    return;
  }

  // ── ?antinuke whitelist add/remove/list ───────────────────────────────────
  if (sub === "whitelist") {
    const action    = parts[2]?.toLowerCase();
    const target    = message.mentions.users.first() ?? (parts[3] ? { id: parts[3] } : null);
    const whitelist = await getWhitelist(guildId);

    if (action === "add") {
      if (!target) {
        await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Mention a user: `?antinuke whitelist add @user`")] });
        return;
      }
      whitelist.add(target.id);
      await saveWhitelist(guildId, whitelist);
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ <@${target.id}> added to the Anti-Nuke whitelist.`)] });
      return;
    }

    if (action === "remove") {
      if (!target) {
        await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Mention a user: `?antinuke whitelist remove @user`")] });
        return;
      }
      whitelist.delete(target.id);
      await saveWhitelist(guildId, whitelist);
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ <@${target.id}> removed from the whitelist.`)] });
      return;
    }

    const ids = [...whitelist];
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(COLOR_INF).setTitle("🛡️ Anti-Nuke Whitelist")
        .setDescription(
          ids.length === 0
            ? "*No users whitelisted. Guild owner + bot are always exempt.*"
            : ids.map(id => `<@${id}> (\`${id}\`)`).join("\n"),
        )
        .setFooter({ text: "Guild owner + bot are always exempt — no need to add them" }),
    ]});
    return;
  }

  // ── ?antinuke status ──────────────────────────────────────────────────────
  if (sub === "status") {
    const cfg        = await getConfig(guildId);
    const whitelist  = await getWhitelist(guildId);
    const statusIcon = cfg.enabled ? "🟢" : "🔴";
    const logRef     = cfg.logChannelId ? `<#${cfg.logChannelId}>` : "*not set*";
    const pingIds    = cfg.logPingIds ?? [];
    const pingsRef   = pingIds.length > 0 ? pingIds.map(id => `<@${id}>`).join(", ") : "*none*";
    const punishLabels: Record<PunishAction, string> = {
      ban: "🔨 ban (permanent)", kick: "👢 kick", strip: "🎭 strip (reversible)",
    };

    const thresholdLines = (Object.entries(cfg.thresholds) as [string, { count: number; window: number }][])
      .map(([k, v]) => `• \`${k}\`: **${v.count}** in **${v.window / 1000}s**`)
      .join("\n");

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(cfg.enabled ? COLOR_OK : COLOR_ERR)
        .setTitle(`${statusIcon} Anti-Nuke Status — ${message.guild.name}`)
        .addFields(
          { name: "Status",       value: cfg.enabled ? "**Enabled**" : "**Disabled**",    inline: true },
          { name: "Punishment",   value: punishLabels[cfg.punishAction],                   inline: true },
          { name: "Log Channel",  value: logRef,                                            inline: true },
          { name: "Whitelisted",  value: `${whitelist.size} user(s)`,                      inline: true },
          { name: "Log Pings",    value: pingsRef,                                          inline: false },
          { name: "Thresholds",   value: thresholdLines,                                    inline: false },
        )
        .setFooter({ text: "Bots are always banned regardless of punishment setting" }),
    ]});
    return;
  }

  // ── ?antinuke restore @user ───────────────────────────────────────────────
  if (sub === "restore") {
    const target = message.mentions.users.first();
    if (!target) {
      await message.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Mention the offender: `?antinuke restore @badguy`"),
      ]});
      return;
    }
    await runRestore(message, client, target.id);
    return;
  }

  await message.reply({ embeds: [buildHelpEmbed()] });
}

function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2F3136)
    .setTitle("🛡️ Anti-Nuke — Command Reference")
    .setDescription(
      "Uses `GuildAuditLogEntryCreate` for **zero-delay** instant detection.\n" +
      "Bots are **banned on first destructive action** — no threshold needed.",
    )
    .addFields(
      {
        name: "⚙️ Setup",
        value: [
          "`?antinuke enable` — Activate monitoring",
          "`?antinuke disable` — Deactivate",
          "`?antinuke log #channel` — Set log channel",
          "`?antinuke logs p add @user` — Ping user on every log",
          "`?antinuke logs p remove @user` — Stop pinging",
          "`?antinuke logs p list` — Show pinged users",
        ].join("\n"),
      },
      {
        name: "⚖️ Punishment",
        value: [
          "`?antinuke setpunish strip` — Remove all roles *(default, reversible)*",
          "`?antinuke setpunish kick` — Kick from server",
          "`?antinuke setpunish ban` — Permanent ban",
          "*Bots are always banned regardless of this setting.*",
        ].join("\n"),
      },
      {
        name: "🛡️ Whitelist & Info",
        value: [
          "`?antinuke whitelist add @user` — Trust a staff member",
          "`?antinuke whitelist remove @user` — Revoke trust",
          "`?antinuke whitelist list` — Show trusted users",
          "`?antinuke status` — Full status + thresholds",
          "`?antinuke restore @user` — ⚠️ Undo damage (owner only, `strip` mode only)",
        ].join("\n"),
      },
      {
        name: "🔍 What is monitored",
        value:
          "`channelDelete/Create` `roleDelete/Create` `ban` `kick` " +
          "`guildUpdate` `webhookCreate` `emojiDelete` + webhook message spam",
      },
    )
    .setFooter({ text: "Guild owner + bot are always exempt • Bots = instant ban on first action" });
}
