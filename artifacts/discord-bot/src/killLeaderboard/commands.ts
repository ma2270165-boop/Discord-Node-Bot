import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { refreshPinnedKillLeaderboard } from "./display.js";
import {
  addKillPlayer,
  editKillPlayer,
  killPlayerExistsAtRank,
  KillPlayer,
  KillStage,
  KILL_STAGES,
  moveKillPlayerRank,
  removeKillPlayerByRank,
} from "./store.js";

const ADMIN_PERMS = PermissionFlagsBits.ManageGuild;

function stageChoices() {
  return KILL_STAGES.map((stage) => ({ name: stage, value: stage }));
}

function isValidAvatarUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function parseKillCountInput(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([kKmM]?)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;

  const suffix = match[2].toLowerCase();
  const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.round(value * multiplier);
}

function successEmbed(title: string, description: string, color = 0x22c55e): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

export const addKillPlayerData = new SlashCommandBuilder()
  .setName("addkillplayer")
  .setDescription("Add a player to the kill leaderboard. (Admin only)")
  .setDefaultMemberPermissions(ADMIN_PERMS)
  .addIntegerOption((o) =>
    o.setName("rank").setDescription("Leaderboard rank number").setRequired(true).setMinValue(1)
  )
  .addStringOption((o) =>
    o.setName("display_name").setDescription("Display name shown on the card").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("roblox_username").setDescription("Roblox username").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("discord_username").setDescription("Discord username/tag").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("position").setDescription("Position, e.g. Head Moderator or Clan Member").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("kill_count").setDescription("Player kill count, e.g. 20K, 70k, 80000").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("stage").setDescription("Player stage").setRequired(true).addChoices(...stageChoices())
  )
  .addStringOption((o) =>
    o.setName("avatar_url").setDescription("Optional direct image URL for the right-side avatar").setRequired(false)
  );

export const editKillPlayerData = new SlashCommandBuilder()
  .setName("editkillplayer")
  .setDescription("Edit a kill leaderboard player. (Admin only)")
  .setDefaultMemberPermissions(ADMIN_PERMS)
  .addIntegerOption((o) =>
    o.setName("rank").setDescription("Current rank number to edit").setRequired(true).setMinValue(1)
  )
  .addIntegerOption((o) =>
    o.setName("new_rank").setDescription("New rank number").setRequired(false).setMinValue(1)
  )
  .addStringOption((o) =>
    o.setName("display_name").setDescription("New display name").setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("roblox_username").setDescription("New Roblox username").setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("discord_username").setDescription("New Discord username/tag").setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("position").setDescription("New position, e.g. Head Moderator or Clan Member").setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("kill_count").setDescription("New kill count, e.g. 20K, 70k, 80000").setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("stage").setDescription("New stage").setRequired(false).addChoices(...stageChoices())
  )
  .addStringOption((o) =>
    o.setName("avatar_url").setDescription("New direct avatar/image URL").setRequired(false)
  );

export const removeKillPlayerData = new SlashCommandBuilder()
  .setName("removekillplayer")
  .setDescription("Remove a player from the kill leaderboard. (Admin only)")
  .setDefaultMemberPermissions(ADMIN_PERMS)
  .addIntegerOption((o) =>
    o.setName("rank").setDescription("Rank number to remove").setRequired(true).setMinValue(1)
  );

export const moveKillPlayerData = new SlashCommandBuilder()
  .setName("movek")
  .setDescription("Move a kill leaderboard player to a new rank. (Admin only)")
  .setDefaultMemberPermissions(ADMIN_PERMS)
  .addIntegerOption((o) =>
    o.setName("rank").setDescription("Current rank number").setRequired(true).setMinValue(1)
  )
  .addIntegerOption((o) =>
    o.setName("new_rank").setDescription("New rank number").setRequired(true).setMinValue(1)
  );

export async function executeAddKillPlayer(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const rank = interaction.options.getInteger("rank", true);
  if (await killPlayerExistsAtRank(rank)) {
    await interaction.editReply({
      embeds: [
        successEmbed(
          "❌ Rank Already Filled",
          `There is already a player at rank **#${rank}**.\nUse \`/editkillplayer\` to update that card or choose a new rank.`,
          0xef4444
        ),
      ],
    });
    return;
  }

  const avatarUrl = interaction.options.getString("avatar_url") ?? "";
  if (avatarUrl && !isValidAvatarUrl(avatarUrl)) {
    await interaction.editReply({ content: "❌ Please provide a valid direct avatar/image URL." });
    return;
  }

  const killCount = parseKillCountInput(interaction.options.getString("kill_count", true));
  if (killCount === null) {
    await interaction.editReply({ content: "❌ Please enter kills like `20K`, `70k`, `80k`, or `80000`." });
    return;
  }

  const player: KillPlayer = {
    rank,
    displayName: interaction.options.getString("display_name", true),
    robloxUsername: interaction.options.getString("roblox_username", true),
    discordUsername: interaction.options.getString("discord_username", true),
    position: interaction.options.getString("position", true),
    killCount,
    stage: interaction.options.getString("stage", true) as KillStage,
    avatarUrl,
  };

  addKillPlayer(player);
  await refreshPinnedKillLeaderboard(client);

  const embed = successEmbed(
    "✅ Kill Player Added",
    `**${player.displayName}** was added to rank **#${player.rank}**.\nThe kill leaderboard has been updated.`
  );

  if (player.avatarUrl) {
    embed.setThumbnail(player.avatarUrl);
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function executeEditKillPlayer(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const rank = interaction.options.getInteger("rank", true);
  if (!killPlayerExistsAtRank(rank)) {
    await interaction.editReply({
      embeds: [successEmbed("❌ Player Not Found", `No kill leaderboard player exists at rank **#${rank}**.`, 0xef4444)],
    });
    return;
  }

  const updates: Partial<KillPlayer> = {};
  const newRank = interaction.options.getInteger("new_rank");
  const displayName = interaction.options.getString("display_name");
  const robloxUsername = interaction.options.getString("roblox_username");
  const discordUsername = interaction.options.getString("discord_username");
  const position = interaction.options.getString("position");
  const killCountInput = interaction.options.getString("kill_count");
  const stage = interaction.options.getString("stage") as KillStage | null;
  const avatarUrl = interaction.options.getString("avatar_url");

  if (newRank !== null) {
    if (newRank !== rank && await killPlayerExistsAtRank(newRank)) {
      await interaction.editReply({
        embeds: [
          successEmbed(
            "❌ Rank Already Filled",
            `Rank **#${newRank}** already belongs to another player. Choose a free rank or edit that player instead.`,
            0xef4444
          ),
        ],
      });
      return;
    }
    updates.rank = newRank;
  }
  if (displayName) updates.displayName = displayName;
  if (robloxUsername) updates.robloxUsername = robloxUsername;
  if (discordUsername) updates.discordUsername = discordUsername;
  if (position) updates.position = position;
  if (killCountInput) {
    const killCount = parseKillCountInput(killCountInput);
    if (killCount === null) {
      await interaction.editReply({ content: "❌ Please enter kills like `20K`, `70k`, `80k`, or `80000`." });
      return;
    }
    updates.killCount = killCount;
  }
  if (stage) updates.stage = stage;
  if (avatarUrl) {
    if (!isValidAvatarUrl(avatarUrl)) {
      await interaction.editReply({ content: "❌ Please provide a valid direct avatar/image URL." });
      return;
    }
    updates.avatarUrl = avatarUrl;
  }

  if (Object.keys(updates).length === 0) {
    await interaction.editReply({ content: "⚠️ No changes provided. Fill in at least one edit field." });
    return;
  }

  editKillPlayer(rank, updates);
  await refreshPinnedKillLeaderboard(client);

  await interaction.editReply({
    embeds: [
      successEmbed(
        "✅ Kill Player Updated",
        `Rank **#${rank}** was updated and the kill leaderboard has been refreshed.\n\n` +
          Object.entries(updates)
            .map(([key, value]) => `**${key}:** ${value}`)
            .join("\n")
      ),
    ],
  });
}

export async function executeRemoveKillPlayer(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const rank = interaction.options.getInteger("rank", true);
  const removed = removeKillPlayerByRank(rank);

  if (!removed) {
    await interaction.editReply({
      embeds: [successEmbed("❌ Player Not Found", `No kill leaderboard player exists at rank **#${rank}**.`, 0xef4444)],
    });
    return;
  }

  await refreshPinnedKillLeaderboard(client);

  await interaction.editReply({
    embeds: [
      successEmbed(
        "🗑️ Kill Player Removed",
        `Rank **#${rank}** was removed and the kill leaderboard has been updated.`
      ),
    ],
  });
}

export async function executeMoveKillPlayer(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const rank = interaction.options.getInteger("rank", true);
  const newRank = interaction.options.getInteger("new_rank", true);

  if (!await killPlayerExistsAtRank(rank)) {
    await interaction.editReply({
      embeds: [successEmbed("❌ Player Not Found", `No kill leaderboard player exists at rank **#${rank}**.`, 0xef4444)],
    });
    return;
  }

  if (newRank !== rank && await killPlayerExistsAtRank(newRank)) {
    await interaction.editReply({
      embeds: [successEmbed("❌ Rank Already Filled", `Rank **#${newRank}** already belongs to another player.`, 0xef4444)],
    });
    return;
  }

  await moveKillPlayerRank(rank, newRank);
  await refreshPinnedKillLeaderboard(client);

  await interaction.editReply({
    embeds: [successEmbed("✅ Kill Player Moved", `Rank **#${rank}** was moved to **#${newRank}**.`)],
  });
}