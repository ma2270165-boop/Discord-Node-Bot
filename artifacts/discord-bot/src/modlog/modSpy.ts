import {
  Message,
  EmbedBuilder,
  TextChannel,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { getPool } from "../persistence.js";

// Carl Bot (and similar) mod commands to watch
const MOD_COMMANDS: { trigger: string; label: string; requiresBan: boolean }[] = [
  { trigger: "?ban",        label: "Ban",         requiresBan: true  },
  { trigger: "?softban",    label: "Softban",     requiresBan: true  },
  { trigger: "?unban",      label: "Unban",       requiresBan: true  },
  { trigger: "?hackban",    label: "Hackban",     requiresBan: true  },
  { trigger: "?massban",    label: "Massban",     requiresBan: true  },
  { trigger: "?kick",       label: "Kick",        requiresBan: false },
  { trigger: "?warn",       label: "Warn",        requiresBan: false },
  { trigger: "?mute",       label: "Mute",        requiresBan: false },
  { trigger: "?unmute",     label: "Unmute",      requiresBan: false },
  { trigger: "?timeout",    label: "Timeout",     requiresBan: false },
  { trigger: "?untimeout",  label: "Untimeout",   requiresBan: false },
  { trigger: "?note",       label: "Note",        requiresBan: false },
];

const KV_KEY = (guildId: string) => `modlog_channel:${guildId}`;

async function getModlogChannel(guildId: string): Promise<string | null> {
  const db = getPool();
  const res = await db.query<{ value: { channelId: string } }>(
    "SELECT value FROM bot_kv WHERE key = $1",
    [KV_KEY(guildId)]
  );
  return res.rows[0]?.value?.channelId ?? null;
}

async function setModlogChannel(guildId: string, channelId: string): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO bot_kv (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [KV_KEY(guildId), JSON.stringify({ channelId })]
  );
}

async function clearModlogChannel(guildId: string): Promise<void> {
  const db = getPool();
  await db.query("DELETE FROM bot_kv WHERE key = $1", [KV_KEY(guildId)]);
}

function hasModerationPerm(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers)
  );
}

// ACTION ICONS per label
const ICONS: Record<string, string> = {
  Ban: "🔨", Softban: "🪃", Unban: "✅", Hackban: "🔒",
  Massban: "💥", Kick: "👢", Warn: "⚠️", Mute: "🔇",
  Unmute: "🔊", Timeout: "⏱️", Untimeout: "▶️", Note: "📝",
};

export async function spyModCommand(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  const match = MOD_COMMANDS.find((m) => {
    if (!lower.startsWith(m.trigger)) return false;
    // Must be exactly the trigger or trigger followed by a space — avoids false matches like ?banner
    const after = lower.slice(m.trigger.length);
    return after === "" || after.startsWith(" ");
  });
  if (!match) return;

  // Only log real mods
  if (!hasModerationPerm(message.member as GuildMember)) return;

  const channelId = await getModlogChannel(message.guild.id).catch(() => null);
  if (!channelId) return;

  const logChannel = message.guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!logChannel || !("send" in logChannel)) return;

  const icon = ICONS[match.label] ?? "🛡️";
  const sourceChannel = "name" in message.channel
    ? `<#${message.channel.id}>`
    : "Unknown channel";

  const embed = new EmbedBuilder()
    .setColor(0x00ffff)
    .setTitle(`${icon} ${match.label} command used`)
    .addFields(
      { name: "Moderator", value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: "Channel", value: sourceChannel, inline: true },
      { name: "Command", value: `\`\`\`${content.slice(0, 1000)}\`\`\`` },
    )
    .setTimestamp()
    .setFooter({ text: `User ID: ${message.author.id}` });

  logChannel.send({ embeds: [embed] }).catch(() => {});
}

// ── ?modlog set #channel / ?modlog off ────────────────────────────────────

export async function handleModlogCommand(message: Message): Promise<void> {
  if (!message.guild) {
    await message.reply("This command can only be used in a server.").catch(() => {});
    return;
  }

  const member = message.member as GuildMember | null;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ You need **Administrator** permission to configure the mod log.").catch(() => {});
    return;
  }

  const parts = message.content.trim().split(/\s+/);
  const sub = parts[1]?.toLowerCase();

  if (sub === "set") {
    const mentioned = message.mentions.channels.first();
    if (!mentioned || !("send" in mentioned)) {
      await message.reply("❌ Please mention a valid text channel. Example: `?modlog set #mod-log`").catch(() => {});
      return;
    }
    await setModlogChannel(message.guild.id, mentioned.id);
    await message.reply(`✅ Mod log channel set to <#${mentioned.id}>. I'll log all mod commands used there.`).catch(() => {});
    return;
  }

  if (sub === "off") {
    await clearModlogChannel(message.guild.id);
    await message.reply("✅ Mod log disabled.").catch(() => {});
    return;
  }

  await message.reply(
    "**Mod Log — Usage:**\n" +
    "`?modlog set #channel` — Set the channel to log mod commands\n" +
    "`?modlog off` — Disable mod logging"
  ).catch(() => {});
}
