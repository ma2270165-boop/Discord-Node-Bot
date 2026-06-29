import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import {
  clearKillPinnedMessage,
  getKillPinnedMessage,
  getKillPlayers,
  KillPinnedMessage,
  KillPlayer,
  setKillPinnedMessage,
} from "./store.js";
import { generateLeaderboardCard, LeaderboardEntry } from "../leaderboardCard.js";

const MAX_PLAYER_CARDS = 10;
const ADMIN_PERMS = PermissionFlagsBits.ManageGuild;

export const setupKillLeaderboardData = new SlashCommandBuilder()
  .setName("setupkillleaderboard")
  .setDescription("Create the permanent kill leaderboard message in this channel. (Admin only)")
  .setDefaultMemberPermissions(ADMIN_PERMS);

function compactKills(kills: number): string {
  if (kills >= 1_000_000) return `${(kills / 1_000_000).toFixed(kills % 1_000_000 === 0 ? 0 : 1)}M`;
  if (kills >= 1_000) return `${(kills / 1_000).toFixed(kills % 1_000 === 0 ? 0 : 1)}K`;
  return kills.toLocaleString();
}

function isValidUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try { new URL(url); return true; } catch { return false; }
}

export async function buildKillLeaderboardImage(): Promise<Buffer> {
  const players = (await getKillPlayers()).slice(0, MAX_PLAYER_CARDS);

  if (players.length === 0) {
    return generateLeaderboardCard("Kill Leaderboard", []);
  }

  const entries: LeaderboardEntry[] = players.map((p: KillPlayer) => ({
    rank: p.rank,
    avatarURL: isValidUrl(p.avatarUrl) ? p.avatarUrl : null,
    username: p.displayName,
    col1Label: "Position",
    col1Value: p.position,
    col2Label: "Kills",
    col2Value: compactKills(p.killCount),
  }));

  return generateLeaderboardCard("Kill Leaderboard", entries);
}

export async function buildKillLeaderboardPayload(): Promise<{
  content: string;
  files: AttachmentBuilder[];
}> {
  const buf = await buildKillLeaderboardImage();
  const players = await getKillPlayers();
  const now = Math.floor(Date.now() / 1000);

  return {
    content: `**Kill Leaderboard**  ·  Updated <t:${now}:R>  ·  ${players.length} players`,
    files: [new AttachmentBuilder(buf, { name: "killboard.png" })],
  };
}

export async function refreshPinnedKillLeaderboard(client: Client): Promise<void> {
  const pinned = await getKillPinnedMessage();
  if (!pinned) return;

  const guild = await client.guilds.fetch(pinned.guildId).catch(() => null);
  if (!guild) {
    await clearKillPinnedMessage();
    return;
  }

  const channel = (await guild.channels.fetch(pinned.channelId).catch(() => null)) as TextChannel | null;
  if (!channel || !channel.isTextBased()) {
    await clearKillPinnedMessage();
    return;
  }

  const message = await channel.messages.fetch(pinned.messageId).catch(() => null);
  if (!message) {
    await clearKillPinnedMessage();
    return;
  }

  try {
    const payload = await buildKillLeaderboardPayload();
    await message.edit({
      content: payload.content,
      embeds: [],
      files: payload.files,
      attachments: [],
    });
  } catch (err) {
    console.error("[KILL LB] Failed to refresh pinned leaderboard:", err);
  }
}

export async function executeSetupKillLeaderboard(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({ content: "❌ Cannot post a kill leaderboard in this channel." });
    return;
  }

  const me = interaction.guild?.members.me;
  if (!me?.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply({ content: "❌ I do not have permission to send messages in this channel." });
    return;
  }

  const pinned = await getKillPinnedMessage();
  if (pinned && pinned.guildId === interaction.guildId && pinned.channelId === channel.id) {
    const existingChannel = (await interaction.guild?.channels.fetch(pinned.channelId).catch(() => null)) as TextChannel | null;
    const existingMessage = existingChannel
      ? await existingChannel.messages.fetch(pinned.messageId).catch(() => null)
      : null;

    if (existingMessage) {
      const payload = await buildKillLeaderboardPayload();
      await existingMessage.edit({ content: payload.content, embeds: [], files: payload.files, attachments: [] });
      await interaction.editReply({ content: `✅ Kill leaderboard refreshed:\n${existingMessage.url}` });
      return;
    }
  }

  const payload = await buildKillLeaderboardPayload();
  const message = await channel.send({ content: payload.content, files: payload.files });
  await message.pin().catch(() => {});

  const saved: KillPinnedMessage = {
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: message.id,
  };
  await setKillPinnedMessage(saved);

  await interaction.editReply({ content: `✅ Kill leaderboard created:\n${message.url}` });
}
