import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { getCensorConfig, setCensorConfig } from "./store.js";

const ADMIN = PermissionFlagsBits.ManageGuild;

const HR  = "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯";

// ── /censor ───────────────────────────────────────────────────────────────────

export const censorData = new SlashCommandBuilder()
  .setName("censor")
  .setDescription("Enable the live AI-grade moderation & censorship system.")
  .setDefaultMemberPermissions(ADMIN)
  .addChannelOption((o) =>
    o
      .setName("modlog_channel")
      .setDescription("Channel to send moderation logs (optional — auto-detects mod-log)")
      .setRequired(false)
  );

export async function executeCensor(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const current = await getCensorConfig(guildId);

  const logChannel =
    (interaction.options.getChannel("modlog_channel") as TextChannel | null) ??
    findModLogChannel(interaction);

  const logChannelId = logChannel?.id ?? current.modLogChannelId ?? null;

  await setCensorConfig(guildId, { enabled: true, modLogChannelId: logChannelId });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🛡️  Moderation System — ACTIVATED")
    .setDescription(
      `The **Advanced Live Censor** is now **active** across this server.\n${HR}`
    )
    .addFields(
      {
        name: "📡  Coverage",
        value:
          "All channels · All messages · Real-time scanning",
        inline: false,
      },
      {
        name: "🔍  Detection Engine",
        value:
          "• Slur & hate-speech database\n• Leet / symbol bypass detection\n• Spacing & punctuation bypass detection\n• Repeated-char bypass detection\n• Unicode confusable detection\n• Structural regex pattern matching",
        inline: false,
      },
      {
        name: "⚖️  Punishment Ladder",
        value:
          "**Flag 1** — Delete + formal warning\n**Flag 2** — Delete + final warning\n**Flag 3** — Delete + 15-minute timeout",
        inline: false,
      },
      {
        name: "📋  Mod Log",
        value: logChannel ? `<#${logChannelId}>` : "Auto-detecting…",
        inline: false,
      }
    )
    .setFooter({ text: "Last Stand Management · Moderation System" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── /stopcensor ────────────────────────────────────────────────────────────────

export const stopcensorData = new SlashCommandBuilder()
  .setName("stopcensor")
  .setDescription("Disable the live moderation & censorship system.")
  .setDefaultMemberPermissions(ADMIN);

export async function executeStopCensor(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  setCensorConfig(guildId, { enabled: false });

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔴  Moderation System — DEACTIVATED")
    .setDescription(
      `The **Advanced Live Censor** has been **disabled**.\nMessages will no longer be scanned.\n${HR}`
    )
    .addFields({
      name: "ℹ️  Note",
      value: "User flag history is preserved. Use `/censor` to re-enable at any time.",
      inline: false,
    })
    .setFooter({ text: "Last Stand Management · Moderation System" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function findModLogChannel(
  interaction: ChatInputCommandInteraction
): TextChannel | null {
  const guild = interaction.guild;
  if (!guild) return null;
  const keywords = ["mod-log", "modlog", "mod_log", "moderation-log", "mod-logs", "mod"];
  for (const kw of keywords) {
    const found = guild.channels.cache.find(
      (c) => c.isTextBased() && c.name.toLowerCase().includes(kw)
    ) as TextChannel | undefined;
    if (found) return found;
  }
  return null;
}
