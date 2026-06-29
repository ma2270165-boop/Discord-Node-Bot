import {
  EmbedBuilder,
  ChatInputCommandInteraction,
  Client,
  TextChannel,
  PermissionFlagsBits,
  AttachmentBuilder,
} from "discord.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getPlayers,
  LeaderboardPlayer,
  getPinnedMessage,
  setPinnedMessage,
  PinnedMessage,
} from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHIMMER_GIF = readFileSync(resolve(__dirname, "shimmer.gif"));

const MAX_CARDS = 10;

function isValidUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function buildPlayerEmbed(player: LeaderboardPlayer): EmbedBuilder {
  const description = [
    `| ${player.robloxUsername} |`,
    `<<<| • ${player.discordUsername} • |>>>`,
    `Country : ${player.country}`,
    `Stage : ${player.stageRank}`,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`${player.position} - ${player.displayName}`)
    .setDescription(description)
    .setImage("attachment://shimmer.gif");

  if (isValidUrl(player.avatarUrl)) {
    embed.setThumbnail(player.avatarUrl);
  }

  return embed;
}

function makeShimmerAttachment(): AttachmentBuilder {
  return new AttachmentBuilder(SHIMMER_GIF, { name: "shimmer.gif" });
}

export async function buildPermanentPayload(): Promise<{
  content: string;
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
}> {
  const allPlayers = await getPlayers();
  const displayPlayers = allPlayers.slice(0, MAX_CARDS);
  const extra = allPlayers.length - displayPlayers.length;

  const now = Math.floor(Date.now() / 1000);

  let content = `**⚔️ TSB Top ${Math.min(allPlayers.length, MAX_CARDS)} Leaderboard**  •  Updated <t:${now}:R>`;

  if (extra > 0) {
    content += `\n*Showing top ${MAX_CARDS} of ${allPlayers.length} players.*`;
  }

  if (displayPlayers.length === 0) {
    content += "\n*No players have been added yet.*";
  }

  return {
    content,
    embeds: displayPlayers.map(buildPlayerEmbed),
    files: [makeShimmerAttachment()],
  };
}

export async function refreshPinnedLeaderboard(client: Client): Promise<void> {
  const pinned = await getPinnedMessage();
  if (!pinned) return;

  try {
    const guild = await client.guilds.fetch(pinned.guildId).catch(() => null);
    if (!guild) return;

    const channel = (await guild.channels
      .fetch(pinned.channelId)
      .catch(() => null)) as TextChannel | null;
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages
      .fetch(pinned.messageId)
      .catch(() => null);
    if (!message) return;

    const payload = await buildPermanentPayload();
    await message.edit({
      content: payload.content,
      embeds: payload.embeds,
      files: payload.files,
      attachments: [],
    });
  } catch (err) {
    console.error("Failed to refresh pinned leaderboard:", err);
  }
}

export async function executeSetupLeaderboard(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) {
    await interaction.editReply({ content: "❌ Could not find the channel." });
    return;
  }

  const me = interaction.guild?.members.me;
  if (!me?.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply({
      content: "❌ I don't have permission to send messages in this channel.",
    });
    return;
  }

  const existing = await getPinnedMessage();
  if (existing && existing.channelId === channel.id) {
    const old = await channel.messages
      .fetch(existing.messageId)
      .catch(() => null);
    if (old) {
      await interaction.editReply({
        content:
          `✅ A leaderboard is already pinned in this channel.\n` +
          `Use \`/addleaderboardplayer\`, \`/editleaderboardplayer\`, or \`/removeleaderboardplayer\` to update it automatically.`,
      });
      return;
    }
  }

  try {
    const payload = await buildPermanentPayload();
    const msg = await channel.send({
      content: payload.content,
      embeds: payload.embeds,
      files: payload.files,
    });

    await msg.pin().catch(() => {});

    const pinned: PinnedMessage = {
      guildId: interaction.guildId!,
      channelId: channel.id,
      messageId: msg.id,
    };
    await setPinnedMessage(pinned);

    await interaction.editReply({
      content: `✅ Leaderboard deployed: ${msg.url}\n\nIt will auto-update whenever you add, edit, or remove players.`,
    });
  } catch (err) {
    console.error("Error setting up leaderboard:", err);
    await interaction.editReply({
      content: "❌ Something went wrong while setting up the leaderboard.",
    }).catch(() => {});
  }
}
