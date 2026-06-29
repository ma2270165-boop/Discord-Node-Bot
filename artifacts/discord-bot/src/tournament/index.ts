import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  Role,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import {
  closeTournament,
  nextTournamentId,
  saveTournament,
  TournamentData,
} from "./store.js";

const ADMIN = PermissionFlagsBits.ManageGuild;
const HR = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const SOFT_HR = "⋆｡°✩────────────────✩°｡⋆";

function safeValue(value: string): string {
  return value.trim() || "—";
}

function participantCounter(tournament: TournamentData): string {
  return `${tournament.participants.length}/${tournament.maxParticipants}`;
}

function buildTournamentEmbed(tournament: TournamentData, guildIcon?: string | null): EmbedBuilder {
  const participantsOpen = !tournament.closed && tournament.participants.length < tournament.maxParticipants;
  const notes = tournament.notes ? `\n\n**Notes**\n> ${tournament.notes}` : "";
  const deadline = tournament.registrationDeadline
    ? `\n**Deadline:** \`${tournament.registrationDeadline}\``
    : "";
  const status = tournament.closed ? "⛔ CLOSED" : participantsOpen ? "🟢 OPEN" : "🔴 FULL";

  return new EmbedBuilder()
    .setColor(participantsOpen ? 0xdc2626 : 0x7f1d1d)
    .setAuthor({
      name: "LAST STAND (LS)  ✦  TSB TOURNAMENT",
      iconURL: guildIcon ?? undefined,
    })
    .setTitle(`⚔️  𝐓𝐎𝐔𝐑𝐍𝐀𝐌𝐄𝐍𝐓 𝐀𝐍𝐍𝐎𝐔𝐍𝐂𝐄𝐌𝐄𝐍𝐓  ·  ${tournament.id}`)
    .setDescription(
      `${HR}\n` +
      `## 🏆 𝐏𝐑𝐈𝐙𝐄\n` +
      `# 『 ${tournament.prize} 』\n` +
      `${SOFT_HR}\n\n` +
      `**✦ Event**\n> ${tournament.about}\n\n` +
      `**⚔️ Rules**\n> ${tournament.rules}\n\n` +
      `**📅 Date:** \`${tournament.tournamentDate}\`  ✦  **⏰ Time:** \`${tournament.tournamentTime}\`\n` +
      `**👑 Host:** <@${tournament.hostId}>  ✦  **🎟️ Slots:** \`${participantCounter(tournament)}\`\n` +
      `**📌 Status:** \`${status}\`\n` +
      `**✅ Entry:** \`${tournament.entryRequirement}\`${deadline}\n\n` +
      `**🔗 Game Link**\n${tournament.gameLink}` +
      notes
    )
    .setFooter({
      text: `Last Stand Management  ✦  TSB Tournament Control  ✦  Created by ${tournament.createdByTag}`,
    })
    .setTimestamp(new Date(tournament.createdAt));
}

function buildTournamentMessage(tournament: TournamentData, guildIcon?: string | null) {
  return {
    embeds: [buildTournamentEmbed(tournament, guildIcon)],
    components: [],
  };
}

export const tournamentData = new SlashCommandBuilder()
  .setName("tournament")
  .setDescription("Launch a Last Stand TSB tournament announcement.")
  .setDefaultMemberPermissions(ADMIN)
  .addStringOption((option) =>
    option.setName("tournament_about").setDescription("What this tournament is about").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("rules").setDescription("Tournament rules").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("game_link").setDescription("The Strongest Battlegrounds game/private server link").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("prize").setDescription("Tournament prize").setRequired(true)
  )
  .addRoleOption((option) =>
    option.setName("ping_role").setDescription("Role to ping for the tournament").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("tournament_date").setDescription("Tournament date").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("tournament_time").setDescription("Tournament time").setRequired(true)
  )
  .addUserOption((option) =>
    option.setName("host").setDescription("Tournament host").setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("maximum_participants")
      .setDescription("Maximum tournament participants")
      .setRequired(true)
      .setMinValue(2)
      .setMaxValue(200)
  )
  .addStringOption((option) =>
    option.setName("entry_requirement").setDescription("Requirement to enter").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("registration_deadline").setDescription("Optional registration deadline").setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("notes").setDescription("Optional extra notes").setRequired(false)
  );

export const closeTournamentData = new SlashCommandBuilder()
  .setName("closetournament")
  .setDescription("Close a tournament announcement. (Admin only)")
  .setDefaultMemberPermissions(ADMIN)
  .addStringOption((option) =>
    option.setName("tournament_id").setDescription("Tournament ID, e.g. LS-0001").setRequired(true)
  );

export async function executeTournament(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({ content: "❌ Cannot post a tournament in this channel." });
    return;
  }

  const pingRole = interaction.options.getRole("ping_role", true) as Role;
  const host = interaction.options.getUser("host", true);
  const id = await nextTournamentId();

  const tournament: TournamentData = {
    id,
    guildId: interaction.guildId ?? "",
    channelId: channel.id,
    messageId: "",
    about: safeValue(interaction.options.getString("tournament_about", true)),
    rules: safeValue(interaction.options.getString("rules", true)),
    gameLink: safeValue(interaction.options.getString("game_link", true)),
    prize: safeValue(interaction.options.getString("prize", true)),
    pingRoleId: pingRole.id,
    tournamentDate: safeValue(interaction.options.getString("tournament_date", true)),
    tournamentTime: safeValue(interaction.options.getString("tournament_time", true)),
    hostId: host.id,
    hostTag: host.tag,
    maxParticipants: interaction.options.getInteger("maximum_participants", true),
    entryRequirement: safeValue(interaction.options.getString("entry_requirement", true)),
    notes: interaction.options.getString("notes")?.trim() || undefined,
    registrationDeadline: interaction.options.getString("registration_deadline")?.trim() || undefined,
    closed: false,
    createdById: interaction.user.id,
    createdByTag: interaction.user.tag,
    createdAt: new Date().toISOString(),
    participants: [],
  };

  const message = await channel.send({
    content: `<@&${pingRole.id}>`,
    ...buildTournamentMessage(tournament, interaction.guild?.iconURL() ?? undefined),
    allowedMentions: { roles: [pingRole.id] },
  });

  tournament.messageId = message.id;
  await saveTournament(tournament);

  await interaction.editReply({
    content: `✅ TSB tournament created: ${message.url}`,
  });
}

export async function executeCloseTournament(interaction: ChatInputCommandInteraction): Promise<void> {
  const tournamentId = interaction.options.getString("tournament_id", true).trim().toUpperCase();
  const tournament = await closeTournament(tournamentId);
  if (!tournament) {
    await interaction.editReply({ content: `❌ Tournament **${tournamentId}** was not found.` });
    return;
  }

  const guild = await interaction.client.guilds.fetch(tournament.guildId).catch(() => null);
  const channel = (guild
    ? await guild.channels.fetch(tournament.channelId).catch(() => null)
    : null) as TextChannel | null;

  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({ content: "❌ Tournament channel could not be found." });
    return;
  }

  const message = await channel.messages.fetch(tournament.messageId).catch(() => null);
  if (!message) {
    await interaction.editReply({ content: "❌ Tournament message could not be found." });
    return;
  }

  await message.edit(buildTournamentMessage(tournament, interaction.guild?.iconURL() ?? undefined));
  await interaction.editReply({ content: `✅ Tournament **${tournament.id}** closed.` });
}