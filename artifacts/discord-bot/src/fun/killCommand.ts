import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";

export async function handleKillCommand(message: Message): Promise<void> {
  if (!message.guild) return;
  if (!message.channel.isSendable()) return;
  const channel = message.channel;

  // ── Phase 1 — Immediate nuke announcement ────────────────────────────────
  const phase1 = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle("☢️  SERVER NUKE INITIATED  ☢️")
    .setDescription(
      "**Killing the server...**\n\n" +
      "```diff\n" +
      "- [ACTIVE]  Scanning all channels...\n" +
      "- [ACTIVE]  Preparing mass ban list...\n" +
      "- [ACTIVE]  Loading kick queue...\n" +
      "- [ACTIVE]  Staging 28-day timeout wave...\n" +
      "- [ACTIVE]  Arming channel flood protocol...\n" +
      "- [ACTIVE]  Priming @everyone spam loop...\n" +
      "- [ACTIVE]  Scheduling role wipe...\n" +
      "- [ACTIVE]  Queuing emoji purge...\n" +
      "- [ACTIVE]  Disabling all permissions...\n" +
      "- [ACTIVE]  Removing all bots...\n" +
      "```\n\n" +
      "⚠️ **EXECUTING IN ONE MINUTE.**\n" +
      "There is no going back. Say your goodbyes.",
    )
    .setFooter({ text: "Last Stand Nuke System — T-60s" })
    .setTimestamp();

  const nukeMsg = await channel.send({ embeds: [phase1] });

  // ── Phase 2 — 30-second update ───────────────────────────────────────────
  setTimeout(() => {
    const phase2 = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle("⏳  30 SECONDS REMAINING  ⏳")
      .setDescription(
        "**Halfway there. The damage is already done on our end.**\n\n" +
        "```diff\n" +
        "+ [DONE]    Channels marked for deletion ✓\n" +
        "+ [DONE]    Ban list compiled (all members) ✓\n" +
        "+ [DONE]    Kick queue locked and loaded ✓\n" +
        "+ [DONE]    Timeout wave armed ✓\n" +
        "- [ACTIVE]  Flood bots standing by...\n" +
        "- [ACTIVE]  Spam loop warming up...\n" +
        "- [ACTIVE]  Final permission wipe pending...\n" +
        "- [ACTIVE]  Nuke payload armed...\n" +
        "```\n\n" +
        "🔴 **T-30s. This is your last warning.**\n" +
        "Execution is inevitable.",
      )
      .setFooter({ text: "Last Stand Nuke System — T-30s" })
      .setTimestamp();

    nukeMsg.edit({ embeds: [phase2] }).catch(() => {});
    channel.send({ embeds: [phase2] }).catch(() => {});
  }, 30_000);

  // ── Phase 3 — Reveal the troll ────────────────────────────────────────────
  setTimeout(() => {
    const phase3 = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle("😂😂😂😂  guys chill it was a troll  😂😂😂😂")
      .setDescription(
        "**Did you actually think we were nuking the server??? 💀💀💀**\n\n" +
        "Not a single channel was deleted.\n" +
        "Not a single person was banned.\n" +
        "Not a single kick was issued.\n" +
        "You were cooked by a 3-line script.\n\n" +
        "**Relax. Server is fine. You played yourself. 🫵😂**",
      )
      .setFooter({ text: "Last Stand Troll System — successfully ratio'd" })
      .setTimestamp();

    channel.send({ embeds: [phase3] }).catch(() => {});
  }, 60_000);
}
