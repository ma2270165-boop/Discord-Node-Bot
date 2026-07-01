import type { Client, Guild, Message, GuildAuditLogsEntry } from "discord.js";
import { Events, AuditLogEvent, EmbedBuilder } from "discord.js";
import { getConfig, getWhitelist, recordAction } from "./store.js";
import type { ActionType } from "./store.js";
import { quarantine } from "./mitigation.js";
import { recordChannelSnap, recordRoleSnap, recordBanSnap } from "./snapshot.js";
import { postAntiNukeLog } from "./logger.js";

// ── Webhook message spam tracking (per webhookId) ──────────────────────────────
// Separate from audit-log detection — message spam doesn't appear in audit logs.
// Two-layer detector:
//   Layer 1 — volume: 3+ messages from the same webhook in 8s (fast spam)
//   Layer 2 — duplicate content: same webhook sends identical text twice in 60s
const webhookMsgTimestamps = new Map<string, number[]>();
const WEBHOOK_MSG_LIMIT   = 3;
const WEBHOOK_MSG_WINDOW  = 8_000;

const webhookContentSeen  = new Map<string, Map<string, number>>();
const WEBHOOK_DUPE_WINDOW = 60_000;

// ── Audit-event → ActionType map ───────────────────────────────────────────────
// Used by the GuildAuditLogEntryCreate handler (zero-delay, instant detection).
const AUDIT_TO_ACTION = new Map<AuditLogEvent, ActionType>([
  [AuditLogEvent.ChannelDelete,  "channelDelete"],
  [AuditLogEvent.ChannelCreate,  "channelCreate"],
  [AuditLogEvent.RoleDelete,     "roleDelete"],
  [AuditLogEvent.RoleCreate,     "roleCreate"],
  [AuditLogEvent.MemberBanAdd,   "ban"],
  [AuditLogEvent.MemberKick,     "kick"],
  [AuditLogEvent.GuildUpdate,    "guildUpdate"],
  [AuditLogEvent.WebhookCreate,  "webhookCreate"],
  [AuditLogEvent.EmojiDelete,    "emojiDelete"],
]);

// ── Build a readable detail string from an audit entry ────────────────────────
function buildDetails(entry: GuildAuditLogsEntry): string {
  const tid = entry.targetId ?? "unknown";
  switch (entry.action) {
    case AuditLogEvent.ChannelDelete: return `Deleted channel \`${tid}\``;
    case AuditLogEvent.ChannelCreate: return `Created channel \`${tid}\``;
    case AuditLogEvent.RoleDelete:    return `Deleted role \`${tid}\``;
    case AuditLogEvent.RoleCreate:    return `Created role \`${tid}\``;
    case AuditLogEvent.MemberBanAdd:  return `Banned user <@${tid}>`;
    case AuditLogEvent.MemberKick:    return `Kicked user <@${tid}>`;
    case AuditLogEvent.GuildUpdate:   return `Modified server settings`;
    case AuditLogEvent.WebhookCreate: return `Created webhook \`${tid}\``;
    case AuditLogEvent.EmojiDelete:   return `Deleted emoji \`${tid}\``;
    default:                          return `Audit action \`${entry.action}\``;
  }
}

// ── Central detection & punishment pipeline ────────────────────────────────────
//
// KEY ARCHITECTURE:
//   GuildAuditLogEntryCreate fires INSTANTLY when Discord creates an audit log
//   entry — the executor is already attached to the entry, so we never need to
//   wait or re-fetch. This eliminates the old 1.5 s delay entirely.
//
//   Bots operating at machine speed bypass the sliding-window threshold; they
//   are quarantined on the very first destructive action.
//
async function handleAction(
  client: Client,
  guild: Guild,
  executorId: string,
  isBotExecutor: boolean,
  action: ActionType,
  details: string,
): Promise<boolean> {
  const config = await getConfig(guild.id);
  if (!config.enabled) return false;

  // Always exempt: server owner + this bot
  if (executorId === guild.ownerId || executorId === client.user!.id) return false;

  // Whitelist check (human trusted staff)
  const whitelist = await getWhitelist(guild.id);
  if (whitelist.has(executorId)) return false;

  // Bots operate at machine speed — threshold is meaningless; quarantine immediately.
  // Humans: use sliding-window counter.
  const triggered = isBotExecutor || recordAction(guild.id, executorId, action, config);

  if (!triggered) return false;

  await quarantine(client, guild, executorId, isBotExecutor, action, details);

  const alertEmbed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle("🚨 ANTI-NUKE — OFFENDER QUARANTINED")
    .setDescription(
      `<@${executorId}> ${
        isBotExecutor
          ? "is a **rogue bot** and was **immediately quarantined + banned**."
          : `crossed the **${action}** threshold and has been quarantined.`
      }\n\n` +
      `**Last action:** ${details}\n\n` +
      (isBotExecutor
        ? "The bot has been permanently **banned** from the server."
        : `Punishment: \`${config.punishAction}\`. Use \`?antinuke restore <@${executorId}>\` if strip was applied.`
      ),
    )
    .setTimestamp();
  await postAntiNukeLog(client, guild, alertEmbed);
  return true;
}

// ── Shared webhook spam action ─────────────────────────────────────────────────
async function triggerWebhookSpamAction(
  client: Client,
  guild: Guild,
  channel: Message["channel"],
  webhookId: string,
  reason: string,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0xFF6B35)
    .setTitle("⚠️ Webhook Spam Detected")
    .addFields(
      { name: "Webhook ID", value: `\`${webhookId}\``, inline: true },
      { name: "Channel",    value: channel.isDMBased() ? "DM" : `<#${channel.id}>`, inline: true },
      { name: "Reason",     value: reason, inline: false },
    )
    .setTimestamp();
  await postAntiNukeLog(client, guild, embed);

  // Delete all webhooks created in the last 2 minutes
  try {
    const all    = await guild.fetchWebhooks();
    const cutoff = Date.now() - 120_000;
    let deleted  = 0;
    for (const wh of all.values()) {
      if (wh.id === webhookId || wh.createdTimestamp > cutoff) {
        try { await wh.delete("Anti-Nuke: webhook spam cleanup"); deleted++; } catch { /* skip */ }
      }
    }
    if (deleted > 0) {
      const cleanupEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle("🗑️ Rogue Webhooks Deleted")
        .setDescription(`Deleted **${deleted}** webhook(s) created in the past 2 minutes.`)
        .setTimestamp();
      await postAntiNukeLog(client, guild, cleanupEmbed);
    }
  } catch (e) {
    console.error("[ANTINUKE] Webhook spam cleanup failed:", e);
  }
}

// ── Event registration ─────────────────────────────────────────────────────────

export function registerAntiNukeEvents(client: Client): void {

  // ════════════════════════════════════════════════════════════════════════════
  // PRIMARY DETECTOR — GuildAuditLogEntryCreate
  // ════════════════════════════════════════════════════════════════════════════
  //
  // This event fires the moment Discord creates an audit log entry, delivering
  // the entry (including the executor) with ZERO delay. This is the approach
  // used by production-grade security bots (e.g. Secure-bot / Python's
  // on_audit_log_entry_create). No sleep, no re-fetch, no race condition.
  //
  // Requires: GatewayIntentBits.GuildModeration (already in client intents)
  //           and the bot must have VIEW_AUDIT_LOG permission.
  //
  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    const action = AUDIT_TO_ACTION.get(entry.action as AuditLogEvent);
    if (!action) return;

    const executor = entry.executor;
    if (!executor) return; // no executor — nothing to act on

    const details       = buildDetails(entry as GuildAuditLogsEntry);
    const isBotExecutor = executor.bot;

    void handleAction(client, guild, executor.id, isBotExecutor, action, details)
      .catch(err => console.error(`[ANTINUKE] handleAction(${action}):`, err));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SNAPSHOT RECORDERS — individual events
  // ════════════════════════════════════════════════════════════════════════════
  //
  // These fire with the full Discord object (GuildChannel, Role, GuildBan)
  // which we need to store enough detail for ?antinuke restore.
  // Detection is handled above; these ONLY record snapshots.
  //
  // We still need to resolve the executor here because the snapshot must be
  // keyed to the executor, not the channel/role itself.  We use a short
  // audit-log lookup (800 ms delay — faster than the old 1.5 s).
  //

  const SNAP_DELAY_MS   = 800;
  const SNAP_AUDIT_LIMIT = 10; // fetch more entries to survive audit log floods

  async function resolveExecutorForSnap(
    guild: Guild,
    auditEvent: AuditLogEvent,
    targetId?: string,
  ): Promise<string | null> {
    await new Promise<void>(res => setTimeout(res, SNAP_DELAY_MS));
    try {
      const logs  = await guild.fetchAuditLogs({ type: auditEvent, limit: SNAP_AUDIT_LIMIT });
      const entry = targetId
        ? logs.entries.find(e => e.target && "id" in e.target && (e.target as { id: string }).id === targetId)
        : logs.entries.find(e => Date.now() - e.createdTimestamp < 5_000);
      return entry?.executor?.id ?? null;
    } catch { return null; }
  }

  // ── Channel Delete → snapshot ──────────────────────────────────────────────
  client.on(Events.ChannelDelete, (channel) => {
    if (channel.isDMBased()) return;
    const guild = channel.guild;
    const snap  = channel; // capture before GC

    void (async () => {
      // Log the deletion for informational purposes
      const name = "name" in channel ? String(channel.name) : "unknown";
      const infoEmbed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle("🗑️ Channel Deleted")
        .addFields(
          { name: "Channel", value: `**#${name}**`,        inline: true },
          { name: "Type",    value: `\`${channel.type}\``, inline: true },
        )
        .setTimestamp();
      await postAntiNukeLog(client, guild, infoEmbed);

      // Record snapshot (for restore) — need executor ID
      const executorId = await resolveExecutorForSnap(guild, AuditLogEvent.ChannelDelete, snap.id);
      if (executorId) recordChannelSnap(guild.id, executorId, snap);
    })().catch(err => console.error("[ANTINUKE] channelDelete snap:", err));
  });

  // ── Role Delete → snapshot ─────────────────────────────────────────────────
  client.on(Events.GuildRoleDelete, (role) => {
    const guild = role.guild;
    const snap  = role;

    void (async () => {
      const infoEmbed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle("🗑️ Role Deleted")
        .addFields(
          { name: "Role",  value: `**${role.name}**`, inline: true },
          { name: "Color", value: role.hexColor,       inline: true },
        )
        .setTimestamp();
      await postAntiNukeLog(client, guild, infoEmbed);

      const executorId = await resolveExecutorForSnap(guild, AuditLogEvent.RoleDelete, snap.id);
      if (executorId) recordRoleSnap(guild.id, executorId, snap);
    })().catch(err => console.error("[ANTINUKE] roleDelete snap:", err));
  });

  // ── Ban Add → snapshot ─────────────────────────────────────────────────────
  client.on(Events.GuildBanAdd, (ban) => {
    const guild = ban.guild;
    const snap  = ban;

    void (async () => {
      const tag = ban.user.tag ?? ban.user.id;
      const infoEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle("🔨 Member Banned")
        .setThumbnail(ban.user.displayAvatarURL({ size: 64 }))
        .addFields(
          { name: "User",   value: `<@${ban.user.id}> (${tag})`,       inline: true },
          { name: "Reason", value: ban.reason ?? "*No reason provided*", inline: false },
        )
        .setTimestamp();
      await postAntiNukeLog(client, guild, infoEmbed);

      const executorId = await resolveExecutorForSnap(guild, AuditLogEvent.MemberBanAdd, snap.user.id);
      if (executorId) recordBanSnap(guild.id, executorId, snap);
    })().catch(err => console.error("[ANTINUKE] guildBanAdd snap:", err));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // WEBHOOK MESSAGE SPAM DETECTOR
  // ════════════════════════════════════════════════════════════════════════════
  //
  // Webhook messages don't appear in audit logs, so this stays as a
  // separate messageCreate handler.
  //
  client.on(Events.MessageCreate, async (message) => {
    if (!message.webhookId || !message.guild) return;
    const guild     = message.guild;
    const webhookId = message.webhookId;
    const config    = await getConfig(guild.id);
    if (!config.enabled) return;

    const now = Date.now();

    // ── Layer 1: Volume (3+ in 8 s) ──────────────────────────────────────
    const times = webhookMsgTimestamps.get(webhookId) ?? [];
    const fresh = times.filter(t => now - t < WEBHOOK_MSG_WINDOW);
    fresh.push(now);
    webhookMsgTimestamps.set(webhookId, fresh);

    if (fresh.length >= WEBHOOK_MSG_LIMIT) {
      webhookMsgTimestamps.delete(webhookId);
      await triggerWebhookSpamAction(
        client, guild, message.channel, webhookId,
        `Volume: **${fresh.length}** messages in ${WEBHOOK_MSG_WINDOW / 1000}s`,
      );
      return;
    }

    // ── Layer 2: Duplicate content (same text twice in 60 s) ─────────────
    const normalised = message.content.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalised) return;

    if (!webhookContentSeen.has(webhookId)) webhookContentSeen.set(webhookId, new Map());
    const seen      = webhookContentSeen.get(webhookId)!;
    const firstSeen = seen.get(normalised);

    if (firstSeen !== undefined && now - firstSeen < WEBHOOK_DUPE_WINDOW) {
      webhookContentSeen.delete(webhookId);
      await triggerWebhookSpamAction(
        client, guild, message.channel, webhookId,
        `Duplicate: identical message sent twice within ${WEBHOOK_DUPE_WINDOW / 1000}s`,
      );
    } else {
      seen.set(normalised, now);
      // Clean up old entries
      for (const [k, ts] of seen) {
        if (now - ts > WEBHOOK_DUPE_WINDOW) seen.delete(k);
      }
    }
  });

  console.log("[ANTINUKE] Events registered (GuildAuditLogEntryCreate + snapshot + webhook-spam).");
}
