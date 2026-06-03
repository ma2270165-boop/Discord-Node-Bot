import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  User,
} from "discord.js";
import { ALL_FUN_COMMANDS, FunCmd, CommandKind, SPECIAL_LISTS } from "./data.js";
import { getAnimeGif } from "./gifService.js";

const COOLDOWN_MS = 3000;
const cooldowns = new Map<string, number>();

const FOOTER = "Last Stand • Fun System";
const COLORS: Record<string, number> = {
  social: 0xff7eb6, troll: 0xff5c5c, relationship: 0xf06292,
  answer: 0x7c4dff, meme: 0x00bcd4, game: 0x4caf50,
  ls: 0xffb300, bonus: 0x9c27b0,
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand100(): number { return Math.floor(Math.random() * 101); }

function resolveSpecialPick(cmd: FunCmd, ctx: { user: User; target: User }): { pick?: string; n?: number } {
  switch (cmd.special) {
    case "rate100":   return { n: rand100() };
    case "pickName":  return { pick: pick(cmd.name === "gf" ? SPECIAL_LISTS.gfNames : SPECIAL_LISTS.bfNames) };
    case "askPick":   return { pick: pick(SPECIAL_LISTS.askPick) };
    case "eightball": return { pick: pick(SPECIAL_LISTS.eightball) };
    case "advice":    return { pick: pick(SPECIAL_LISTS.advice) };
    case "truth":     return { pick: pick(SPECIAL_LISTS.truth) };
    case "dare":      return { pick: pick(SPECIAL_LISTS.dare) };
    case "confession":return { pick: pick(SPECIAL_LISTS.confession) };
    case "pickup":    return { pick: pick(SPECIAL_LISTS.pickup) };
    case "compliment":return { pick: pick(SPECIAL_LISTS.compliment) };
    case "chat":      return { pick: pick(SPECIAL_LISTS.chat) };
    case "fact":      return { pick: pick(SPECIAL_LISTS.fact) };
    case "joke":      return { pick: pick(SPECIAL_LISTS.joke) };
    case "darkjoke":  return { pick: pick(SPECIAL_LISTS.darkjoke) };
    case "brainrot":  return { pick: pick(SPECIAL_LISTS.brainrot) };
    case "quote":     return { pick: pick(SPECIAL_LISTS.quote) };
    case "copypasta": return { pick: pick(SPECIAL_LISTS.copypasta) };
    case "fight": {
      const tmpl = pick(SPECIAL_LISTS.fight)
        .replace(/\{user\}/g, `<@${ctx.user.id}>`)
        .replace(/\{target\}/g, `<@${ctx.target.id}>`);
      return { pick: tmpl };
    }
    case "rps":       return { pick: pick(SPECIAL_LISTS.rps) };
    case "gamble":    return { pick: pick(SPECIAL_LISTS.gamble) };
    case "trivia":    return { pick: pick(SPECIAL_LISTS.trivia) };
    case "auraNum":   return { pick: pick(SPECIAL_LISTS.aura) };
    case "coinflip":  return { pick: Math.random() < 0.5 ? "Heads 🟡" : "Tails ⚪" };
    case "dice":      return { pick: String(1 + Math.floor(Math.random() * 6)) };
    case "guess":     return { pick: `My guess: **${1 + Math.floor(Math.random() * 10)}**` };
    case "slots": {
      const items = ["🍒","🍋","🍇","🔔","💎","7️⃣"];
      const a = pick(items), b = pick(items), c = pick(items);
      const win = (a === b && b === c) ? "JACKPOT!" : (a === b || b === c) ? "Small win!" : "No luck.";
      return { pick: `[ ${a} | ${b} | ${c} ]  →  ${win}` };
    }
    case "clickspeed": return { n: 4 + Math.floor(Math.random() * 12) };
    default: return {};
  }
}

function fillTemplate(t: string, ctx: { user: User; target: User; pick?: string; n?: number }): string {
  return t
    .replace(/\{user\}/g, `<@${ctx.user.id}>`)
    .replace(/\{target\}/g, `<@${ctx.target.id}>`)
    .replace(/\{pick\}/g, ctx.pick ?? "")
    .replace(/\{n\}/g, ctx.n != null ? String(ctx.n) : "");
}

function buildSub(cmd: FunCmd): SlashCommandSubcommandBuilder {
  const sb = new SlashCommandSubcommandBuilder()
    .setName(cmd.name)
    .setDescription(cmd.description);
  if (cmd.needsTarget || cmd.optionalTarget) {
    sb.addUserOption((o) =>
      o.setName("user")
       .setDescription("Target user")
       .setRequired(!!cmd.needsTarget && !cmd.optionalTarget),
    );
  }
  return sb;
}

const PARENT_META: Record<CommandKind, { name: string; description: string }> = {
  social:       { name: "social",       description: "Social actions: hug, kiss, pat, slap, …" },
  troll:        { name: "troll",        description: "Trolling: roast, ratio, sus, expose, …" },
  relationship: { name: "relationship", description: "Love stuff: ship, marry, crush, rizz, …" },
  answer:       { name: "answer",       description: "Random replies: ask, 8ball, dare, advice, …" },
  meme:         { name: "meme",         description: "Memes, jokes, copypastas, brainrot, …" },
  game:         { name: "game",         description: "Mini games: dice, slots, fight, rps, …" },
  ls:           { name: "ls",           description: "Last Stand: raidcall, clutch, warcry, …" },
  bonus:        { name: "bonus",        description: "Aura, drip, NPC, main character, …" },
};

function buildParents(): SlashCommandBuilder[] {
  const groups = new Map<CommandKind, FunCmd[]>();
  for (const cmd of ALL_FUN_COMMANDS) {
    const list = groups.get(cmd.kind) ?? [];
    list.push(cmd);
    groups.set(cmd.kind, list);
  }
  const parents: SlashCommandBuilder[] = [];
  for (const [kind, cmds] of groups) {
    const meta = PARENT_META[kind];
    const parent = new SlashCommandBuilder()
      .setName(meta.name)
      .setDescription(meta.description);
    for (const cmd of cmds) parent.addSubcommand(buildSub(cmd));
    parents.push(parent);
  }
  return parents;
}

async function executeFun(cmd: FunCmd, interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const cdKey = `${userId}:${cmd.name}`;
  const now = Date.now();
  const last = cooldowns.get(cdKey) ?? 0;
  if (now - last < COOLDOWN_MS) {
    const remaining = ((COOLDOWN_MS - (now - last)) / 1000).toFixed(1);
    await interaction.editReply({ content: `⏱️ Slow down — try again in ${remaining}s.` });
    return;
  }
  cooldowns.set(cdKey, now);

  const targetMember = (interaction.options.getMember("user") as GuildMember | null);
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const target: User = targetMember?.user ?? targetUser;
  const author = interaction.user;

  // Self-target funny line for social/needsTarget commands
  if (cmd.needsTarget && target.id === author.id && cmd.kind !== "answer" && cmd.kind !== "ls") {
    await interaction.editReply({
      content: `<@${author.id}> tried to ${cmd.name} themselves… you good? 😅`,
    });
    return;
  }

  const special = resolveSpecialPick(cmd, { user: author, target });
  const tmpl = pick(cmd.texts);
  const description = fillTemplate(tmpl, { user: author, target, ...special });

  // Fetch GIF (with timeout protection — never block reply)
  let gifUrl: string | null = null;
  try {
    gifUrl = await Promise.race([
      getAnimeGif(cmd.name, cmd.gif),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 4500)),
    ]);
    if (!gifUrl) gifUrl = null;
  } catch { gifUrl = null; }

  const titleEmoji = cmd.emoji ? `${cmd.emoji} ` : "";
  const title = `${titleEmoji}${cmd.name.charAt(0).toUpperCase()}${cmd.name.slice(1)}`;

  const embed = new EmbedBuilder()
    .setColor(COLORS[cmd.kind] ?? 0x5865f2)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: FOOTER });
  if (gifUrl) embed.setImage(gifUrl);

  await interaction.editReply({ embeds: [embed] });
}

// ─── Public exports ────────────────────────────────────────────────────────────

export const FUN_COMMAND_DATA = buildParents().map((b) => b.toJSON());

// Top-level parent command names (for PUBLIC_COMMANDS check)
export const FUN_COMMAND_NAMES: string[] = Object.values(PARENT_META).map((p) => p.name);

const FUN_BY_NAME: Record<string, FunCmd> = Object.fromEntries(
  ALL_FUN_COMMANDS.map((c) => [c.name, c]),
);

async function dispatchFun(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand(false);
  if (!sub) {
    await interaction.editReply({ content: "Pick a subcommand." });
    return;
  }
  const cmd = FUN_BY_NAME[sub];
  if (!cmd) {
    await interaction.editReply({ content: `Unknown subcommand: ${sub}` });
    return;
  }
  await executeFun(cmd, interaction);
}

export const FUN_HANDLERS: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> =
  Object.fromEntries(FUN_COMMAND_NAMES.map((name) => [name, dispatchFun]));
  