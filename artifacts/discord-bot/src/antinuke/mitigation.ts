import type { Client, Guild } from "discord.js";
import { EmbedBuilder, TextChannel } from "discord.js";
import { clearActions, getConfig } from "./store.js";
import type { ActionType } from "./store.js";

// Tracks guilds currently mid-quarantine to avoid re-entry
const quarantineActive = new Set<string>(); // `${guildId}:${executorId}`

export async function quarantine(
  client: Client,
  guild: Guild,
  executorId: string,
  action: ActionType,
  details: string,
): Promise<void> {
  const key = `${guild.id}:${executorId}`;
  if (quarantineActive.has(key)) return; // prevent re-entry
  quarantineActive.add(key);

  clearActions(guild.id, executorId);
  console.warn(
    `[ANTINUKE] 🚨 Quarantine | Guild: ${guild.name} (${guild.id}) | Executor: ${executorId} | Action: ${action}`,
  );

  const actionsTaken: string[] = [];

  // ── 1. Strip roles (human member) ────────────────────────────────────────
  try {
    const member = await guild.members.fetch(executorId);
    try {
      await member.roles.set([], "Anti-Nuke: automated quarantine");
      actionsTaken.push("• All roles stripped");
    } catch (e) {
      console.error("[ANTINUKE] Role strip failed:", (e as Error).message);
    }
  } catch {
    // Executor is a bot/app or already left — role strip skipped
    actionsTaken.push("• Executor is not a guild member (bot/app) — role strip skipped");
  }

  // ── 2. Webhook cleanup (when trigger was webhookCreate) ───────────────────
  if (action === "webhookCreate") {
    try {
      const guildWebhooks = await guild.fetchWebhooks();
      // Delete webhooks created in the last 2 minutes (the rogue burst)
      const cutoff = Date.now() - 120_000;
      const rogue = guildWebhooks.filter(wh => wh.createdTimestamp > cutoff);
      let deleted = 0;
      for (const wh of rogue.values()) {
        try {
          await wh.delete("Anti-Nuke: rogue webhook cleanup");
          deleted++;
        } catch { /* skip if already gone */ }
      }
      if (deleted > 0) {
        actionsTaken.push(`• Deleted **${deleted}** rogue webhook(s)`);
      }
    } catch (e) {
      console.error("[ANTINUKE] Webhook cleanup failed:", e);
    }
  }

  // ── 3. Build embed ───────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setAuthor({ name: "⚡ ANTI-NUKE SYSTEM — THREAT NEUTRALIZED" })
    .setTitle("🚨 Rogue Executor Quarantined")
    .setDescription(
      "An executor exceeded the action threshold and has been **immediately quarantined**.",
    )
    .addFields(
      { name: "👤 Threat Actor",  value: `<@${executorId}> (\`${executorId}\`)`, inline: true },
      { name: "⚡ Trigger",       value: `\`${action}\``,                        inline: true },
      { name: "📋 Details",       value: details,                                 inline: false },
      { name: "🔒 Actions Taken", value: actionsTaken.join("\n") || "*(none)*",   inline: false },
    )
    .setFooter({ text: `Last Stand Anti-Nuke • ${guild.name}` })
    .setTimestamp();

  // ── 4. Send to log channel ────────────────────────────────────────────────
  const config = await getConfig(guild.id);
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
      content: `🚨 **Anti-Nuke alert on \`${guild.name}\`!** Action: \`${action}\``,
      embeds: [embed],
    });
  } catch (e) {
    console.error("[ANTINUKE] Owner DM failed:", (e as Error).message);
  }

  // Allow re-entry after 60 seconds
  setTimeout(() => quarantineActive.delete(key), 60_000);
}
