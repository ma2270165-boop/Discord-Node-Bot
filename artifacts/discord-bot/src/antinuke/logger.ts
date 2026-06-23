import type { Client, Guild, EmbedBuilder } from "discord.js";
import { ChannelType } from "discord.js";
import { getConfig } from "./store.js";

/**
 * Post an embed to the configured anti-nuke log channel.
 * Prepends a content string that pings every user in logPingIds.
 */
export async function postAntiNukeLog(
  client: Client,
  guild: Guild,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const config = await getConfig(guild.id);
    if (!config.logChannelId) return;

    const ch = guild.channels.cache.get(config.logChannelId);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    const pingIds = config.logPingIds ?? [];
    const content = pingIds.length > 0
      ? pingIds.map(id => `<@${id}>`).join(" ")
      : undefined;

    await ch.send({ content, embeds: [embed] });
  } catch (e) {
    console.error("[ANTINUKE] Failed to post log:", e);
  }
}
