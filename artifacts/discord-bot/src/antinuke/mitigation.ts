import type { Client, Guild } from "discord.js";
import { EmbedBuilder, TextChannel } from "discord.js";
import { clearActions, getConfig } from "./store.js";
import type { ActionType } from "./store.js";

// Tracks guilds currently mid-quarantine to avoid re-entry
const quarantineActive = new Set<string>(); // `${guildId}:${executorId}`

/**
 * Quarantine an offender.
 *
 * @param isBotExecutor  When true the executor is another bot — managed/integration
 *   roles cannot be stripped by other bots, so we always ban regardless of the
 *   guild's punishAction setting.
 */
export async function quarantine(
  client: Client,
  guild: Guild,
  executorId: string,
  isBotExecutor: boolean,
  action: ActionType,
  details: string,
): Promise<void> {
  const key = `${guild.id}:${executorId}`;
  if (quarantineActive.has(key)) return;
  quarantineActive.add(key);

  clearActions(guild.id, executorId);
  console.warn(
    `[ANTINUKE] 🚨 Quarantine | Guild: ${guild.name} (${guild.id}) | Executor: ${executorId} | Bot: ${isBotExecutor} | Action: ${action}`,
  );

  const config = await getConfig(guild.id);

  // Bots are always banned — their permissions come from managed/integration
  // roles which cannot be removed by another bot.
  const effectivePunish = isBotExecutor ? "ban" : config.punishAction;

  const actionsTaken: string[] = [];

  // ── 1. Punish the executor ────────────────────────────────────────────────
  if (effectivePunish === "ban") {
    try {
      await guild.bans.create(executorId, {
        reason: `Anti-Nuke: ${isBotExecutor ? "rogue bot" : "threshold exceeded"} — ${action}`,
        deleteMessageSeconds: 0,
      });
      actionsTaken.push(`• **Banned** from server${isBotExecutor ? " (bot — always banned)" : ""}`);
    } catch (e) {
      console.error("[ANTINUKE] Ban failed:", (e as Error).message);
      actionsTaken.push("• Ban failed — missing permissions or higher role");
    }

  } else if (effectivePunish === "kick") {
    try {
      const member = await guild.members.fetch(executorId);
      await member.kick(`Anti-Nuke: threshold exceeded — ${action}`);
      actionsTaken.push("• **Kicked** from server");
    } catch (e) {
      console.error("[ANTINUKE] Kick failed:", (e as Error).message);
      // Fallback: strip roles if kick fails (e.g. hierarchy)
      try {
        const member = await guild.members.fetch(executorId);
        await member.roles.set([], "Anti-Nuke: kick failed, stripping roles as fallback");
        actionsTaken.push("• Kick failed — stripped all roles as fallback");
      } catch {
        actionsTaken.push("• Kick + strip both failed — missing permissions");
      }
    }

  } else {
    // strip (default)
    try {
      const member = await guild.members.fetch(executorId);
      await member.roles.set([], "Anti-Nuke: automated quarantine — roles stripped");
      actionsTaken.push("• All **roles stripped**");
    } catch (e) {
      console.error("[ANTINUKE] Role strip failed:", (e as Error).message);
      actionsTaken.push("• Role strip failed — executor may be a bot or have higher hierarchy");
    }
  }

  // ── 2. Webhook cleanup (when trigger was webhookCreate) ───────────────────
  if (action === "webhookCreate") {
    try {
      const guildWebhooks = await guild.fetchWebhooks();
      const cutoff = Date.now() - 120_000;
      const rogue  = guildWebhooks.filter(wh => wh.createdTimestamp > cutoff);
      let deleted  = 0;
      for (const wh of rogue.values()) {
        try {
          await wh.delete("Anti-Nuke: rogue webhook cleanup");
          deleted++;
        } catch { /* skip if already gone */ }
      }
      if (deleted > 0) actionsTaken.push(`• Deleted **${deleted}** rogue webhook(s)`);
    } catch (e) {
      console.error("[ANTINUKE] Webhook cleanup failed:", e);
    }
  }

  // ── 3. Build embed ────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setAuthor({ name: "⚡ ANTI-NUKE SYSTEM — THREAT NEUTRALIZED" })
    .setTitle("🚨 Rogue Executor Quarantined")
    .setDescription(
      "An executor exceeded the action threshold and has been **immediately quarantined**.",
    )
    .addFields(
      { name: "👤 Threat Actor",   value: `<@${executorId}> (\`${executorId}\`)`, inline: true },
      { name: "🤖 Is Bot",         value: isBotExecutor ? "**Yes** (always banned)" : "No", inline: true },
      { name: "⚡ Trigger",        value: `\`${action}\``,                        inline: true },
      { name: "📋 Details",        value: details,                                  inline: false },
      { name: "⚖️ Punishment",     value: `\`${effectivePunish}\``,               inline: true },
      { name: "🔒 Actions Taken",  value: actionsTaken.join("\n") || "*(none)*",    inline: false },
    )
    .setFooter({ text: `Last Stand Anti-Nuke • ${guild.name}` })
    .setTimestamp();

  // ── 4. Send to log channel ────────────────────────────────────────────────
  if (config.logChannelId) {
    try {
      const ch = await client.channels.fetch(config.logChannelId);
      if (ch && !ch.isDMBased() && ch.isTextBased()) {
        const pingIds = config.logPingIds ?? [];
        const content = pingIds.length > 0 ? pingIds.map(id => `<@${id}>`).join(" ") : undefined;
        await (ch as TextChannel).send({ content, embeds: [embed] });
      }
    } catch (e) {
      console.error("[ANTINUKE] Log channel send failed:", (e as Error).message);
    }
  }

  // ── 5. DM server owner ────────────────────────────────────────────────────
  try {
    const owner = await guild.fetchOwner();
    await owner.send({
      content: `🚨 **Anti-Nuke alert on \`${guild.name}\`!** Action: \`${action}\` | Punishment: \`${effectivePunish}\``,
      embeds: [embed],
    });
  } catch (e) {
    console.error("[ANTINUKE] Owner DM failed:", (e as Error).message);
  }

  // Allow re-entry after 60 seconds
  setTimeout(() => quarantineActive.delete(key), 60_000);
}
