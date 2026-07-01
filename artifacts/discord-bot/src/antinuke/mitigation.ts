import type { Client, Guild } from "discord.js";
import { EmbedBuilder, TextChannel } from "discord.js";
import { clearActions, getConfig } from "./store.js";
import type { ActionType } from "./store.js";

const quarantineActive = new Set<string>();

export async function quarantine(
  client: Client,
  guild: Guild,
  executorId: string,
  isBotExecutor: boolean,
  action: ActionType,
  details: string,
): Promise<boolean> {
  const key = `${guild.id}:${executorId}`;
  if (quarantineActive.has(key)) return false;
  quarantineActive.add(key);
  clearActions(guild.id, executorId);

  console.warn(
    `[ANTINUKE] Quarantine | Guild: ${guild.name} (${guild.id}) | Executor: ${executorId} | Bot: ${isBotExecutor} | Action: ${action}`,
  );

  const config = await getConfig(guild.id);
  const effectivePunish = isBotExecutor ? "ban" : config.punishAction;
  const actionsTaken: string[] = [];

  // ── Punish ────────────────────────────────────────────────────────────────
  if (effectivePunish === "ban") {
    // For bots: ban-only (managed roles can't be stripped by other bots).
    // For humans on ban mode: strip roles AND ban concurrently — roles gone
    // instantly while ban processes, stops damage as fast as possible.
    if (isBotExecutor) {
      try {
        await guild.bans.create(executorId, {
          reason: `Anti-Nuke: rogue bot — ${action}`,
          deleteMessageSeconds: 0,
        });
        actionsTaken.push("• Banned (bot — instant ban)");
      } catch (e) {
        console.error("[ANTINUKE] Bot ban failed:", (e as Error).message);
        actionsTaken.push("• Ban failed — check permissions / role hierarchy");
      }
    } else {
      const member = guild.members.cache.get(executorId)
        ?? await guild.members.fetch(executorId).catch(() => null);

      await Promise.all([
        member
          ? member.roles.set([], "Anti-Nuke: roles stripped").catch(() => {})
          : Promise.resolve(),
        guild.bans.create(executorId, {
          reason: `Anti-Nuke: threshold exceeded — ${action}`,
          deleteMessageSeconds: 0,
        }).catch((e) => {
          console.error("[ANTINUKE] Ban failed:", (e as Error).message);
        }),
      ]);
      actionsTaken.push("• Roles stripped + banned");
    }

  } else if (effectivePunish === "kick") {
    const member = guild.members.cache.get(executorId)
      ?? await guild.members.fetch(executorId).catch(() => null);

    if (member) {
      const stripped = member.roles.set([], "Anti-Nuke: instant strip before kick").catch(() => null);
      await stripped;
      await member.kick(`Anti-Nuke: threshold exceeded — ${action}`).catch(async () => {
        await member.roles.set([], "Anti-Nuke: kick failed, stripping as fallback").catch(() => {});
        actionsTaken.push("• Kick failed — stripped roles as fallback");
        return;
      });
      actionsTaken.push("• Roles stripped + kicked");
    } else {
      actionsTaken.push("• Member not found");
    }

  } else {
    // strip
    const member = guild.members.cache.get(executorId)
      ?? await guild.members.fetch(executorId).catch(() => null);

    if (member) {
      await member.roles.set([], "Anti-Nuke: automated quarantine — roles stripped").catch((e) => {
        console.error("[ANTINUKE] Strip failed:", (e as Error).message);
      });
      actionsTaken.push("• All roles stripped");
    } else {
      actionsTaken.push("• Member not found");
    }
  }

  // ── Webhook cleanup ───────────────────────────────────────────────────────
  if (action === "webhookCreate") {
    try {
      const all    = await guild.fetchWebhooks();
      const cutoff = Date.now() - 120_000;
      let deleted  = 0;
      for (const wh of all.values()) {
        if (wh.createdTimestamp > cutoff) {
          await wh.delete("Anti-Nuke: rogue webhook cleanup").catch(() => {});
          deleted++;
        }
      }
      if (deleted > 0) actionsTaken.push(`• Deleted ${deleted} rogue webhook(s)`);
    } catch (e) {
      console.error("[ANTINUKE] Webhook cleanup failed:", e);
    }
  }

  // ── Log + DM — fully async, never blocks punishment ──────────────────────
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle("A nigga tried nuking us😂")
    .addFields(
      { name: "Who",           value: `<@${executorId}> (\`${executorId}\`)`, inline: false },
      { name: "What they did", value: details,                                 inline: false },
      { name: "Punishment",    value: effectivePunish,                         inline: false },
    )
    .setFooter({ text: guild.name })
    .setTimestamp();

  void (async () => {
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

    try {
      const owner = await guild.fetchOwner();
      await owner.send({
        content: `some random ass nigga got caught in **${guild.name}**`,
        embeds: [embed],
      });
    } catch { /* DMs closed */ }
  })();

  setTimeout(() => quarantineActive.delete(key), 60_000);
  return true;
}
