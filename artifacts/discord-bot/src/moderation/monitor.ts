import {
  Client,
  Message,
  EmbedBuilder,
  TextChannel,
  GuildMember,
} from "discord.js";
import { scan, DetectionMethod } from "./detector.js";
import {
  isCensorEnabled,
  getCensorConfig,
  getUserFlags,
  incrementFlag,
  resetFlags,
} from "./store.js";

const HR = "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯";

// ── Anti-spam tracker (in-memory) ─────────────────────────────────────────────
// Tracks timestamps of recent messages per user for spam detection.
const spamTracker = new Map<string, number[]>();
const SPAM_WINDOW_MS = 10_000;   // 10-second window
const SPAM_THRESHOLD = 7;        // messages in that window before flagging

function trackSpam(userId: string): boolean {
  const now = Date.now();
  const timestamps = (spamTracker.get(userId) ?? []).filter(
    (t) => now - t < SPAM_WINDOW_MS
  );
  timestamps.push(now);
  spamTracker.set(userId, timestamps);
  return timestamps.length >= SPAM_THRESHOLD;
}

// Clean spam tracker periodically to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - SPAM_WINDOW_MS * 2;
  for (const [key, timestamps] of spamTracker) {
    const fresh = timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) spamTracker.delete(key);
    else spamTracker.set(key, fresh);
  }
}, 60_000);

// ── Cooldown for warning embeds per user (avoid embed spam) ───────────────────
const warnCooldown = new Map<string, number>();
const WARN_COOLDOWN_MS = 8_000;

function isOnWarnCooldown(userId: string): boolean {
  const last = warnCooldown.get(userId);
  return last !== undefined && Date.now() - last < WARN_COOLDOWN_MS;
}
function setWarnCooldown(userId: string): void {
  warnCooldown.set(userId, Date.now());
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function handleModerationMessage(
  message: Message,
  client: Client
): Promise<void> {
  if (!message.guild || message.author.bot) return;
  if (!(await isCensorEnabled(message.guild.id))) return;

  const guildId = message.guild.id;
  const member  = message.member as GuildMember | null;

  // ── Anti-spam check ─────────────────────────────────────────────────────────
  const isSpamming = trackSpam(message.author.id);
  if (isSpamming) {
    try {
      await message.delete();
    } catch {
      /* message may already be gone */
    }
    if (!isOnWarnCooldown(message.author.id)) {
      setWarnCooldown(message.author.id);
      try {
        await (message.channel as TextChannel).send({
          content: `<@${message.author.id}> ⚠️ Please slow down — spam is not allowed.`,
        });
      } catch {
        /* channel may not be sendable */
      }
    }
    return;
  }

  // ── Hate-speech / slur detection ────────────────────────────────────────────
  const result = scan(message.content);
  if (!result) return;

  console.log(
    `[MODERATION] Detected "${result.matchedTerm}" (${result.method}) from ${message.author.tag} in #${(message.channel as TextChannel).name}: "${message.content.slice(0, 80)}"`
  );

  // Delete the offending message
  let messageDeleted = false;
  try {
    await message.delete();
    messageDeleted = true;
    console.log(`[MODERATION] Message deleted successfully.`);
  } catch (err: any) {
    console.error(`[MODERATION] ⚠️ Failed to delete message — bot may lack Manage Messages permission. Error: ${err?.message ?? err}`);
  }

  // Increment flag count
  const newCount = await incrementFlag(guildId, message.author.id);

  // ── Determine action ────────────────────────────────────────────────────────
  let action: "warn1" | "warn2" | "timeout";
  if (newCount >= 3) {
    action = "timeout";
  } else if (newCount === 2) {
    action = "warn2";
  } else {
    action = "warn1";
  }

  // ── Apply timeout on 3rd+ flag ──────────────────────────────────────────────
  let timedOut = false;
  if (action === "timeout" && member) {
    // ALWAYS reset flags on flag-3, regardless of whether timeout succeeds.
    // Without this, a failed timeout leaves flags at 3+ forever (infinite loop).
    await resetFlags(guildId, message.author.id);

    // Discord does not allow bots to timeout server owners — skip silently.
    if (message.guild.ownerId === message.author.id) {
      console.log(`[MODERATION] Cannot timeout server owner (Discord restriction). Message was deleted and logged.`);
    } else {
      try {
        await member.timeout(15 * 60 * 1000, "Repeated use of prohibited language (3 flags)");
        timedOut = true;
        console.log(`[MODERATION] Timeout applied to ${message.author.tag} for 15 minutes.`);
      } catch (err: any) {
        console.error(`[MODERATION] ⚠️ Timeout failed — ensure the bot has Moderate Members permission and its role is above the member's highest role. Error: ${err?.message ?? err}`);
      }
    }
  }

  // ── Public channel warning embed ────────────────────────────────────────────
  if (!isOnWarnCooldown(message.author.id)) {
    setWarnCooldown(message.author.id);
    const publicEmbed = buildPublicWarningEmbed(
      message.author.id,
      action,
      timedOut,
      newCount
    );
    try {
      await (message.channel as TextChannel).send({ embeds: [publicEmbed] });
    } catch {
      /* channel not available */
    }
  }

  // ── Mod-log embed ───────────────────────────────────────────────────────────
  const config = await getCensorConfig(guildId);
  const logChannelId =
    config.modLogChannelId ?? findModLogChannelId(message);

  if (logChannelId) {
    const logChannel = message.guild.channels.cache.get(logChannelId) as
      | TextChannel
      | undefined;
    if (logChannel) {
      const logEmbed = buildModLogEmbed(
        message.author.id,
        message.author.tag,
        message.channel as TextChannel,
        result.matchedTerm,
        result.method,
        result.normalizedForm,
        message.content,
        action,
        timedOut,
        newCount
      );
      try {
        await logChannel.send({ embeds: [logEmbed] });
      } catch (err) {
        console.error("[MODERATION] Failed to send mod-log:", err);
      }
    }
  }
}

// ── Embed builders ─────────────────────────────────────────────────────────────

function buildPublicWarningEmbed(
  userId: string,
  action: "warn1" | "warn2" | "timeout",
  timedOut: boolean,
  flagCount: number
): EmbedBuilder {
  const embed = new EmbedBuilder().setTimestamp();

  if (action === "warn1") {
    embed
      .setColor(0xf39c12)
      .setTitle("⚠️  Message Removed")
      .setDescription(
        `<@${userId}> — Your message was removed for containing **prohibited language**.\n${HR}\nPlease keep this server respectful and welcoming to everyone. This is your **first warning**.`
      )
      .setFooter({ text: "Last Stand Management · Moderation System" });
  } else if (action === "warn2") {
    embed
      .setColor(0xe67e22)
      .setTitle("🚨  Final Warning")
      .setDescription(
        `<@${userId}> — This is your **final warning**.\n${HR}\nAnother violation will result in a **15-minute timeout**. Continued offenses may lead to a permanent ban.`
      )
      .setFooter({ text: "Last Stand Management · Moderation System" });
  } else {
    embed
      .setColor(0xe74c3c)
      .setTitle(timedOut ? "🔇  User Timed Out" : "❌  Repeated Violations")
      .setDescription(
        timedOut
          ? `<@${userId}> has been **timed out for 15 minutes** due to repeated use of prohibited language.\n${HR}\nYou may appeal after the timeout expires.`
          : `<@${userId}> — Your message was removed. You have reached the maximum warning limit.`
      )
      .setFooter({ text: "Last Stand Management · Moderation System" });
  }

  embed.addFields({
    name: "🚩  Active Flags",
    value: `${flagCount >= 3 ? "Reset after timeout" : `${flagCount} / 3`}`,
    inline: true,
  });

  return embed;
}

function buildModLogEmbed(
  userId: string,
  userTag: string,
  channel: TextChannel,
  matchedTerm: string,
  method: DetectionMethod,
  normalizedForm: string | undefined,
  originalContent: string,
  action: "warn1" | "warn2" | "timeout",
  timedOut: boolean,
  flagCount: number
): EmbedBuilder {
  const actionLabel =
    action === "timeout"
      ? timedOut
        ? "🔇 Timeout (15 min)"
        : "⚠️ Limit reached (timeout failed)"
      : action === "warn2"
      ? "🚨 Final Warning"
      : "⚠️ Warning (1st)";

  const methodLabel =
    method === "regex"
      ? "🔍 Structural pattern match (symbol/separator bypass detected)"
      : method === "substring"
      ? "🔗 Collapsed substring match (spacing bypass detected)"
      : method === "phonetic-substring"
      ? "🎵 Phonetic+spacing bypass detected"
      : method === "phonetic"
      ? "🎵 Phonetic variation detected (leet/repeat/misspelling bypass)"
      : method === "compound"
      ? "🧩 Compound word match (flagged word embedded inside another word)"
      : "✅ Exact word match";

  const truncated =
    originalContent.length > 200
      ? originalContent.slice(0, 197) + "…"
      : originalContent;

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "👤  User", value: `<@${userId}> (${userTag})`, inline: true },
    { name: "📍  Channel", value: `<#${channel.id}>`, inline: true },
    { name: "⚡  Action", value: actionLabel, inline: true },
    { name: "🔍  Detection", value: methodLabel, inline: false },
    { name: "🚩  Active Flags", value: `${flagCount >= 3 ? "0 (reset after timeout)" : `${flagCount} / 3`}`, inline: true },
    { name: "🏷️  Matched Term", value: `\`${matchedTerm}\``, inline: true },
  ];

  if (normalizedForm && normalizedForm !== matchedTerm) {
    fields.push({
      name: "🧠  Normalized Form",
      value: `\`${normalizedForm.slice(0, 80)}\``,
      inline: false,
    });
  }

  fields.push({
    name: "💬  Original Message",
    value: `\`\`\`${truncated}\`\`\``,
    inline: false,
  });

  return new EmbedBuilder()
    .setColor(action === "timeout" ? 0xe74c3c : action === "warn2" ? 0xe67e22 : 0xf39c12)
    .setTitle("📋  Moderation Action Log")
    .setDescription(`${HR}`)
    .addFields(fields)
    .setFooter({ text: "Last Stand Management · Moderation System" })
    .setTimestamp();
}

function findModLogChannelId(message: Message): string | null {
  const guild = message.guild;
  if (!guild) return null;
  const keywords = ["mod-log", "modlog", "mod_log", "moderation-log", "mod-logs", "mod"];
  for (const kw of keywords) {
    const found = guild.channels.cache.find(
      (c) => c.isTextBased() && c.name.toLowerCase().includes(kw)
    );
    if (found) return found.id;
  }
  return null;
}
