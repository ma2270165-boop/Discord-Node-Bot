import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { saveTrainingLog, nextTrainingNumber } from "./store.js";

const ADMIN = PermissionFlagsBits.ManageGuild;

function shortDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPerformers(raw: string): string {
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return raw;
  return list
    .map((name, i) => `${String(i + 1).padStart(2, "0")}  ${name}`)
    .join("\n");
}

function findChannel(
  interaction: ChatInputCommandInteraction,
  ...keywords: string[]
): TextChannel | null {
  const guild = interaction.guild;
  if (!guild) return null;
  for (const kw of keywords) {
    const found = guild.channels.cache.find(
      (c) => c.isTextBased() && c.name.toLowerCase().includes(kw.toLowerCase())
    ) as TextChannel | undefined;
    if (found) return found;
  }
  return null;
}

export const trainingData = new SlashCommandBuilder()
  .setName("training")
  .setDescription("Manage training sessions.")
  .setDefaultMemberPermissions(ADMIN)
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Deploy a training session alert to the server.")
      .addStringOption((o) =>
        o.setName("training_type").setDescription("Type of training (e.g. Combat Training, PvP Drills)").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("game_link").setDescription("Roblox game link").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("host").setDescription("Session host username or @mention").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("duration").setDescription("Expected duration (e.g. 1h, 45 minutes)").setRequired(true)
      )
      .addRoleOption((o) =>
        o.setName("ping_role").setDescription("Role to ping").setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("attendance").setDescription("Attendance requirement (e.g. Mandatory, Optional)").setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("notes").setDescription("Session overview / notes (optional)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("end")
      .setDescription("Close a training session and log the results.")
      .addStringOption((o) =>
        o.setName("training_type").setDescription("Training type / session name").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("host").setDescription("Session host username or @mention").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("duration_completed").setDescription("Actual duration completed").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("mvp").setDescription("MVP(s) — comma-separated for multiple").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("notes").setDescription("Host notes — format: username — note (optional)").setRequired(false)
      )
  );

export async function executeTraining(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === "start") {
    await executeStartTraining(interaction);
  } else {
    await executeEndTraining(interaction);
  }
}

async function executeStartTraining(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const trainingType = interaction.options.getString("training_type", true);
  const gameLink     = interaction.options.getString("game_link", true);
  const host         = interaction.options.getString("host", true);
  const duration     = interaction.options.getString("duration", true);
  const pingRole     = interaction.options.getRole("ping_role");
  const attendance   = interaction.options.getString("attendance") || "Open to all";
  const notes        = interaction.options.getString("notes");

  const sessionNumber = await nextTrainingNumber();

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "◈  GAME LINK", value: `[▸ Join the Session](${gameLink})` },
  ];

  if (notes) {
    fields.push({ name: "◈  SESSION OVERVIEW", value: `*${notes}*` });
  }

  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setAuthor({ name: "◇  TRAINING STARTING", iconURL: interaction.guild?.iconURL() ?? undefined })
    .setTitle(trainingType)
    .setDescription(
      `> Host · ${host}\n` +
      `> Duration · ${duration}\n` +
      `> Attendance · ${attendance}\n` +
      `> Date · ${shortDate()}`
    )
    .addFields(fields)
    .setFooter({ text: `Session #${sessionNumber}  ·  Called by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
    .setTimestamp();

  const channel = interaction.channel as TextChannel | null;
  if (!channel) { await interaction.editReply({ content: "❌ Cannot post in this channel." }); return; }

  await channel.send({ content: pingRole ? `${pingRole}` : undefined, embeds: [embed] });
  await interaction.editReply({ content: `✅ Training Session #${sessionNumber} announced.` });
}

async function executeEndTraining(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const trainingType      = interaction.options.getString("training_type", true);
  const host              = interaction.options.getString("host", true);
  const durationCompleted = interaction.options.getString("duration_completed", true);
  const mvp               = interaction.options.getString("mvp", true);
  const notes             = interaction.options.getString("notes");

  const sessionNumber = await nextTrainingNumber();

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "SESSION MVP", value: formatPerformers(mvp) },
  ];

  if (notes) {
    fields.push({ name: "HOST NOTES", value: `*${notes}*` });
  }

  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setAuthor({ name: "◇  TRAINING ENDED", iconURL: interaction.guild?.iconURL() ?? undefined })
    .setTitle(trainingType)
    .setDescription(
      `> Host · ${host}\n` +
      `> Duration · ${durationCompleted}\n` +
      `> Date · ${shortDate()}`
    )
    .addFields(fields)
    .setFooter({ text: `Session #${sessionNumber}  ·  Logged by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
    .setTimestamp();

  await saveTrainingLog({
    id: `${Date.now()}`,
    host,
    durationCompleted,
    mvp,
    notes: notes ?? "—",
    endedBy: interaction.user.tag,
    endedById: interaction.user.id,
    timestamp: new Date().toISOString(),
    guildId: interaction.guildId ?? "",
    sessionNumber,
  });

  const resultsChannel = findChannel(interaction, "training-results", "training-log");

  if (resultsChannel) {
    await resultsChannel.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Session #${sessionNumber} results posted to ${resultsChannel}.` });
  } else {
    const ch = interaction.channel as TextChannel | null;
    if (ch) await ch.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Session #${sessionNumber} concluded and results logged.` });
  }
}
