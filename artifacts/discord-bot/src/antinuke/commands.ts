import type { Message, TextChannel, Client } from "discord.js";
import { EmbedBuilder, PermissionFlagsBits, ChannelType, OverwriteType } from "discord.js";
import {
  getConfig,
  saveConfig,
  getWhitelist,
  saveWhitelist,
  DEFAULT_THRESHOLDS,
} from "./store.js";
import { getSnap, clearSnap } from "./snapshot.js";

const COLOR_OK  = 0x00FFFF;
const COLOR_ERR = 0xFF4444;
const COLOR_INF = 0x2F3136;
const COLOR_WIN = 0x00FF99;

function requireManageGuild(message: Message): boolean {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLOR_ERR)
        .setDescription("❌ You need **Manage Server** permission to use anti-nuke commands."),
    ]}).catch(() => {});
    return false;
  }
  return true;
}

// ─── RESTORE ──────────────────────────────────────────────────────────────────
async function runRestore(message: Message, client: Client, offenderId: string): Promise<void> {
  const guild = message.guild!;

  // Owner-only gate
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

  // ── Counters ────────────────────────────────────────────────────────────
  let rolesOk = 0, rolesFail = 0;
  let chOk = 0, chFail = 0;
  let unbanOk = 0, unbanFail = 0, dmOk = 0;

  // ── 1. Recreate roles (sorted by position ascending to preserve hierarchy)
  const roleIdMap = new Map<string, string>(); // oldId → newId
  const sortedRoles = [...snap.roles].sort((a, b) => a.position - b.position);

  for (const r of sortedRoles) {
    try {
      // Attempt to download icon
      let icon: Buffer | undefined;
      if (r.iconURL) {
        try {
          const ir = await fetch(r.iconURL, { signal: AbortSignal.timeout(5_000) });
          if (ir.ok) icon = Buffer.from(await ir.arrayBuffer());
        } catch { /* icon optional */ }
      }

      const created = await guild.roles.create({
        name:          r.name,
        color:         r.color,
        hoist:         r.hoist,
        mentionable:   r.mentionable,
        permissions:   BigInt(r.permissions),
        ...(icon            ? { icon }            : {}),
        ...(r.unicodeEmoji  ? { unicodeEmoji: r.unicodeEmoji } : {}),
        reason: `Anti-Nuke restore — recreating role deleted by <@${offenderId}>`,
      });

      roleIdMap.set(r.id, created.id);
      rolesOk++;
    } catch (e) {
      console.error(`[RESTORE] Role "${r.name}" failed:`, e);
      rolesFail++;
    }
  }

  // ── 2. Recreate channels ───────────────────────────────────────────────
  // Categories must be created first so child channels can reference them.
  const categories = snap.channels.filter(c => c.type === ChannelType.GuildCategory);
  const others     = snap.channels.filter(c => c.type !== ChannelType.GuildCategory);
  const allOrdered = [
    ...categories.sort((a, b) => a.position - b.position),
    ...others.sort((a, b) => a.position - b.position),
  ];

  const channelIdMap = new Map<string, string>(); // oldId → newId (for category remapping)

  for (const ch of allOrdered) {
    try {
      // Remap overwrite IDs: translate old role IDs to newly created role IDs
      const permissionOverwrites = ch.overwrites.map((ow) => ({
        id:    roleIdMap.get(ow.id) ?? ow.id,
        type:  ow.type as OverwriteType,
        allow: BigInt(ow.allow),
        deny:  BigInt(ow.deny),
      }));

      // Remap parent category to new category ID
      const parent = ch.parentId ? (channelIdMap.get(ch.parentId) ?? null) : null;

      const opts: Parameters<typeof guild.channels.create>[0] = {
        name:               ch.name,
        type:               ch.type as ChannelType.GuildText,
        position:           ch.position,
        permissionOverwrites,
        reason: `Anti-Nuke restore — recreating channel deleted by <@${offenderId}>`,
        ...(parent                         ? { parent }                         : {}),
        ...(ch.topic                       ? { topic: ch.topic }               : {}),
        ...(ch.nsfw                        ? { nsfw: ch.nsfw }                 : {}),
        ...(ch.rateLimitPerUser            ? { rateLimitPerUser: ch.rateLimitPerUser } : {}),
        ...(ch.bitrate   !== null          ? { bitrate: ch.bitrate }           : {}),
        ...(ch.userLimit !== null && ch.userLimit > 0 ? { userLimit: ch.userLimit } : {}),
      };

      const created = await guild.channels.create(opts);
      channelIdMap.set(ch.id, created.id);
      chOk++;
    } catch (e) {
      console.error(`[RESTORE] Channel "${ch.name}" failed:`, e);
      chFail++;
    }
  }

  // ── 3. Unban members, create invite, DM each one ────────────────────────
  // Find a text channel to create invites from
  const inviteSource = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.viewable,
  ) as TextChannel | undefined;

  for (const ban of snap.bans) {
    try {
      await guild.members.unban(
        ban.userId,
        `Anti-Nuke restore — wrongfully banned by <@${offenderId}>`,
      );
      unbanOk++;

      // Create a single-use, never-expiring invite
      let inviteUrl = `https://discord.gg/${guild.id}`; // fallback
      if (inviteSource) {
        try {
          const inv = await inviteSource.createInvite({
            maxAge:  0,    // never expires
            maxUses: 1,    // single use
            unique:  true,
            reason:  "Anti-Nuke restore invite",
          });
          inviteUrl = inv.url;
        } catch { /* use fallback */ }
      }

      // DM the unbanned user
      try {
        const user = await client.users.fetch(ban.userId);
        const dmEmbed = new EmbedBuilder()
          .setColor(COLOR_WIN)
          .setTitle(`We sincerely apologise — ${guild.name}`)
          .setThumbnail(guild.iconURL({ size: 256 }))
          .setDescription(
            `Hey **${ban.username}**,\n\n` +
            `We are truly sorry for the experience you've had. A **rogue staff member** ` +
            `gained access to administrative tools and attempted to nuke our server — ` +
            `banning innocent members including you in the process.\n\n` +
            `This was **not intentional** on the part of the server, and we deeply ` +
            `apologise that you were caught in the middle of this. The offender has been ` +
            `identified, stripped of all permissions, and dealt with accordingly.\n\n` +
            `You have been **fully unbanned** and we would love to have you back. ` +
            `We've created a private invite link just for you below:\n\n` +
            `**[➡️ Click here to rejoin ${guild.name}](${inviteUrl})**\n` +
            `*(This link is single-use and never expires — made just for you)*\n\n` +
            `Once again, we are very sorry for this inconvenience. We hope to see you back soon. 💙`,
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

  // ── 4. Clear snapshot ────────────────────────────────────────────────────
  clearSnap(guild.id, offenderId);

  // ── 5. Report results ────────────────────────────────────────────────────
  const resultEmbed = new EmbedBuilder()
    .setColor(COLOR_WIN)
    .setTitle("✅ Anti-Nuke Restore Complete")
    .setDescription(`Offender: <@${offenderId}>`)
    .addFields(
      {
        name: "🎭 Roles",
        value: `✅ Recreated: **${rolesOk}**${rolesFail > 0 ? `\n❌ Failed: **${rolesFail}** (bot role too low or missing perm)` : ""}`,
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
    )
    .addFields({
      name: "ℹ️ Note",
      value:
        "Channels are recreated with the same permissions. " +
        "Role positions are approximate — you may need to re-order them manually. " +
        "If your server has membership screening, rejoining users will still need to complete it.",
    })
    .setTimestamp();

  await status.edit({ embeds: [resultEmbed] });
}

// ─── MAIN COMMAND ROUTER ──────────────────────────────────────────────────────

export async function handleAntiNukeCommand(message: Message, client: Client): Promise<void> {
  if (!message.guild) return;
  if (!requireManageGuild(message)) return;

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
            ? "✅ Anti-Nuke system **enabled**. The bot will now monitor this server."
            : "⛔ Anti-Nuke system **disabled**.",
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
          .setDescription("❌ Please mention a valid text channel. Example: `?antinuke log #security-logs`"),
      ]});
      return;
    }
    const cfg = await getConfig(guildId);
    cfg.logChannelId = channel.id;
    await saveConfig(guildId, cfg);
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ Anti-Nuke logs will be posted to <#${channel.id}>.\n\nUse \`?antinuke logs p add @user\` to add people to ping on every log.`),
    ]});
    return;
  }

  // ── ?antinuke logs p add/remove/list ─────────────────────────────────────
  if (sub === "logs") {
    const action = parts[2]?.toLowerCase(); // should be "p"
    const modifier = parts[3]?.toLowerCase(); // add / remove / list

    if (action !== "p") {
      await message.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription(
            "❌ Unknown logs sub-command.\n\n" +
            "**Usage:**\n" +
            "`?antinuke logs p add @user` — ping this person on every log\n" +
            "`?antinuke logs p remove @user` — stop pinging them\n" +
            "`?antinuke logs p list` — show everyone being pinged",
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
          .setDescription("❌ Mention a user to add. Example: `?antinuke logs p add @user`")] });
        return;
      }
      if (!cfg.logPingIds.includes(target.id)) {
        cfg.logPingIds.push(target.id);
        await saveConfig(guildId, cfg);
      }
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ <@${target.id}> will now be **pinged** on every anti-nuke log entry.`)] });
      return;
    }

    if (modifier === "remove") {
      const target = message.mentions.users.first() ?? (parts[4] ? { id: parts[4] } : null);
      if (!target) {
        await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Mention a user to remove. Example: `?antinuke logs p remove @user`")] });
        return;
      }
      cfg.logPingIds = cfg.logPingIds.filter(id => id !== target.id);
      await saveConfig(guildId, cfg);
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ <@${target.id}> will no longer be pinged on log entries.`)] });
      return;
    }

    // list (default)
    const ids = cfg.logPingIds;
    const logRef = cfg.logChannelId ? `<#${cfg.logChannelId}>` : "*not set — use `?antinuke log #channel` first*";
    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLOR_INF)
        .setTitle("📋 Anti-Nuke Log Pings")
        .addFields(
          { name: "Log Channel", value: logRef, inline: false },
          {
            name: "Pinged Users",
            value: ids.length === 0
              ? "*No one is being pinged. Add someone with `?antinuke logs p add @user`*"
              : ids.map(id => `<@${id}> (\`${id}\`)`).join("\n"),
            inline: false,
          },
        )
        .setFooter({ text: "These users are pinged on every ban, kick, channel delete, role delete, and more" }),
    ]});
    return;
  }

  // ── ?antinuke whitelist add/remove/list ───────────────────────────────────
  if (sub === "whitelist") {
    const action = parts[2]?.toLowerCase();
    const target = message.mentions.users.first() ?? (parts[3] ? { id: parts[3] } : null);
    const whitelist = await getWhitelist(guildId);

    if (action === "add") {
      if (!target) {
        await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription("❌ Please mention a user. Example: `?antinuke whitelist add @user`")] });
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
          .setDescription("❌ Please mention a user. Example: `?antinuke whitelist remove @user`")] });
        return;
      }
      whitelist.delete(target.id);
      await saveWhitelist(guildId, whitelist);
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_OK)
        .setDescription(`✅ <@${target.id}> removed from the Anti-Nuke whitelist.`)] });
      return;
    }

    if (action === "list" || !action) {
      const ids = [...whitelist];
      await message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLOR_INF)
          .setTitle("🛡️ Anti-Nuke Whitelist")
          .setDescription(
            ids.length === 0
              ? "*No users whitelisted. The guild owner and the bot are always exempt.*"
              : ids.map(id => `<@${id}> (\`${id}\`)`).join("\n"),
          )
          .setFooter({ text: "Guild owner + bot are always exempt — no need to add them" }),
      ]});
      return;
    }

    await message.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERR)
      .setDescription("❌ Unknown whitelist action. Use `add`, `remove`, or `list`.")]});
    return;
  }

  // ── ?antinuke status ──────────────────────────────────────────────────────
  if (sub === "status") {
    const cfg = await getConfig(guildId);
    const whitelist = await getWhitelist(guildId);
    const statusIcon = cfg.enabled ? "🟢" : "🔴";
    const logRef  = cfg.logChannelId ? `<#${cfg.logChannelId}>` : "*not set*";
    const pingIds = cfg.logPingIds ?? [];
    const pingsRef = pingIds.length > 0
      ? pingIds.map(id => `<@${id}>`).join(", ")
      : "*none — add with `?antinuke logs p add @user`*";

    const thresholdLines = (Object.entries(cfg.thresholds) as [string, { count: number; window: number }][])
      .map(([k, v]) => `• \`${k}\`: **${v.count}** actions in **${v.window / 1000}s**`)
      .join("\n");

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(cfg.enabled ? COLOR_OK : COLOR_ERR)
        .setTitle(`${statusIcon} Anti-Nuke Status — ${message.guild.name}`)
        .addFields(
          { name: "Status",        value: cfg.enabled ? "**Enabled**" : "**Disabled**", inline: true },
          { name: "Log Channel",   value: logRef,                                        inline: true },
          { name: "Whitelisted",   value: `${whitelist.size} user(s)`,                  inline: true },
          { name: "Log Pings",     value: pingsRef,                                      inline: false },
          { name: "Thresholds",    value: thresholdLines,                                inline: false },
        )
        .setFooter({ text: "?antinuke help — full command list" }),
    ]});
    return;
  }

  // ── ?antinuke thresholds ──────────────────────────────────────────────────
  if (sub === "thresholds") {
    const lines = (Object.entries(DEFAULT_THRESHOLDS) as [string, { count: number; window: number }][])
      .map(([k, v]) => `• \`${k}\` — **${v.count}** actions in **${v.window / 1000}s**`)
      .join("\n");
    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLOR_INF)
        .setTitle("⚡ Anti-Nuke Thresholds")
        .setDescription(lines)
        .setFooter({ text: "Thresholds are fixed. Contact the developer to adjust them." }),
    ]});
    return;
  }

  // ── ?antinuke restore @user ───────────────────────────────────────────────
  if (sub === "restore") {
    const target = message.mentions.users.first();
    if (!target) {
      await message.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR_ERR)
          .setDescription(
            "❌ Mention the offender whose damage you want to reverse.\n" +
            "Example: `?antinuke restore @badguy`",
          ),
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
    .setDescription("Protects the server against rogue staff mass-deleting channels, roles, or banning members.")
    .addFields(
      {
        name: "⚙️ Setup",
        value: [
          "`?antinuke enable` — Activate the system",
          "`?antinuke disable` — Deactivate the system",
          "`?antinuke log #channel` — Set the channel where logs are posted",
          "`?antinuke logs p add @user` — Ping this user on every log entry",
          "`?antinuke logs p remove @user` — Stop pinging them",
          "`?antinuke logs p list` — Show everyone being pinged",
        ].join("\n"),
      },
      {
        name: "🛡️ Whitelist & Info",
        value: [
          "`?antinuke whitelist add @user` — Trust a staff member (exempt from checks)",
          "`?antinuke whitelist remove @user` — Revoke trust",
          "`?antinuke whitelist list` — Show all trusted users",
          "`?antinuke status` — Full status, log pings, and thresholds",
          "`?antinuke restore @user` — ⚠️ Undo everything the offender destroyed (owner only)",
        ].join("\n"),
      },
      {
        name: "📋 What gets logged",
        value:
          "Every **ban**, **kick**, **channel delete**, **role delete**, **server update**, " +
          "**webhook create**, and **emoji delete** is posted to the log channel with a ping. " +
          "If a threshold is crossed the offender is quarantined and a 🚨 alert is posted.",
      },
    )
    .setFooter({ text: "Guild owner + bot are always exempt from anti-nuke checks" });
}
