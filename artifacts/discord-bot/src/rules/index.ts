import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getRulesMessage, setRulesMessage } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BANNER_GIF = readFileSync(resolve(__dirname, "banner.gif"));

const ADMIN = PermissionFlagsBits.ManageGuild;

const RULES_TEXT = [
  "**✦ Respect Everyone**",
  "┆ No beefing, harassment, or fighting with members.",
  "",
  "**✦ No Slurs / Hate Speech**",
  "┆ Any slur or hateful language will result in punishment.",
  "",
  "**✦ No Leaking Clan Information**",
  "┆ Do not share information about LAST STAND (LS) outside the clan.",
  "",
  "**✦ No NSFW Content**",
  "┆ Any NSFW content will result in an instant ban.",
  "",
  "**✦ No Disturbing Images or GIFs**",
  "┆ Sending creepy or inappropriate media will result in a timeout.",
  "",
  "**✦ No Spam**",
  "┆ Do not spam messages, GIFs, or pings.",
  "",
  "**✦ No Toxic Behavior**",
  "┆ Bullying, insulting, or harassing members is not allowed.",
  "",
  "**✦ Respect Staff**",
  "┆ Follow all instructions given by admins and moderators.",
  "",
  "**✦ No Advertising**",
  "┆ Promoting other clans or servers without permission is prohibited.",
  "",
  "**✦ Clan Tag Requirement**",
  "┆ If you main the clan, you must have **(LS)** before your name.",
  "",
  "**✦ No Impersonation**",
  "┆ Do not pretend to be staff or another member.",
  "",
  "**✦ No Raiding**",
  "┆ Organizing raids against other servers is forbidden.",
  "",
  "**✦ Punishment System**",
  "┆ Warn → Timeout → Kick → Ban",
].join("\n");

export const setupRulesData = new SlashCommandBuilder()
  .setName("setuprules")
  .setDescription("Deploy or update the permanent LAST STAND rulebook in this channel.")
  .setDefaultMemberPermissions(ADMIN);

export async function executeSetupRules(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({ content: "❌ Cannot post in this channel." });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setAuthor({
      name: "✦ ── ❀  LAST STAND (LS)  ❀ ── ✦",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("── CLAN RULEBOOK ──")
    .setDescription(
      "☾ Please read all rules before joining the clan.\n" +
      "✦ By staying in this server, you agree to follow them.\n\n" +
      "╭───────────────✦───────────────╮\n\n" +
      RULES_TEXT +
      "\n\n╰───────────────✦───────────────╯\n\n" +
      "❀ Read more rules in <#rules> or **#rulesbook**"
    )
    .setImage("attachment://banner.gif")
    .setFooter({
      text: "Breaking rules may result in punishment.  •  Last Stand (LS)",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTimestamp();

  const attachment = new AttachmentBuilder(BANNER_GIF, { name: "banner.gif" });

  const existing = await getRulesMessage(interaction.guildId!);

  if (existing && existing.channelId === channel.id) {
    try {
      const existingChannel = (await interaction.guild?.channels
        .fetch(existing.channelId)
        .catch(() => null)) as TextChannel | null;

      if (existingChannel) {
        const existingMsg = await existingChannel.messages
          .fetch(existing.messageId)
          .catch(() => null);

        if (existingMsg) {
          await existingMsg.edit({ embeds: [embed], files: [attachment], attachments: [] });
          await interaction.editReply({ content: `✅ Rulebook updated: ${existingMsg.url}` });
          return;
        }
      }
    } catch {
    }
  }

  const msg = await channel.send({ embeds: [embed], files: [attachment] });
  await setRulesMessage({
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: msg.id,
  });

  await interaction.editReply({ content: `✅ Rulebook deployed: ${msg.url}` });
}
