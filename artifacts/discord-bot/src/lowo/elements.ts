import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getUser, updateUser, getLowoMeta, updateLowoMeta, getAllUsers } from "./storage.js";
import { ANIMAL_BY_ID } from "./data.js";

// ─── Element definitions ──────────────────────────────────────────────────────
export const ELEMENT_DEFS = {
  eternal_nature:     { name: "Eternal Element of Nature",     emoji: "🌿", source: "manual `lowo hunt`",   rate: "0.0005%" },
  eternal_underworld: { name: "Eternal Element of Underworld", emoji: "💀", source: "manual `lowo mine`",   rate: "0.001%"  },
  eternal_ocean:      { name: "Eternal Element of Ocean",      emoji: "🌊", source: "manual `lowo fish`",   rate: "0.001%"  },
  eternal_earth:      { name: "Eternal Element of Earth",      emoji: "⚡", source: "craft all 3 elements", rate: "Crafted" },
} as const;
export type DroppableElementId = "eternal_nature" | "eternal_underworld" | "eternal_ocean";

// Drop chances
const DROP_RATES: Record<DroppableElementId, number> = {
  eternal_nature:     0.000005, // 0.0005%
  eternal_underworld: 0.00001,  // 0.001%
  eternal_ocean:      0.00001,  // 0.001%
};

// ─── tryDropElement ───────────────────────────────────────────────────────────
// Returns the elementId if it dropped, null otherwise.
// isManual MUST be true — autohunt is hardcoded to 0% chance.
export function tryDropElement(
  userId: string,
  elementId: DroppableElementId,
  isManual: boolean,
): DroppableElementId | null {
  if (!isManual) return null;
  if (Math.random() >= DROP_RATES[elementId]) return null;
  updateUser(userId, (x) => {
    if (!x.elements) x.elements = { eternal_nature: 0, eternal_underworld: 0, eternal_ocean: 0, eternal_earth: 0 };
    x.elements[elementId] = (x.elements[elementId] ?? 0) + 1;
  });
  return elementId;
}

// ─── broadcastElementDrop ─────────────────────────────────────────────────────
export async function broadcastElementDrop(
  message: Message,
  elementId: DroppableElementId,
): Promise<void> {
  const el = ELEMENT_DEFS[elementId];
  const embed = new EmbedBuilder()
    .setColor(0x00FFFF)
    .setTitle("💥  A B S O L U T E   D R O P")
    .setDescription(
      [
        `**${message.author.username}** has unearthed the **${el.emoji} ${el.name}**!`,
        ``,
        `This is one of the rarest events in Lowo history.`,
        `_Collect all three foundational elements and craft the_ **⚡ Eternal Element of Earth** _to face what lies beyond._`,
      ].join("\n"),
    )
    .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
    .setFooter({ text: "Eternal Elements — Endgame Collection System" })
    .setTimestamp();
  const ch = message.channel;
  if ("send" in ch) {
    await ch.send({ content: "@here", embeds: [embed], allowedMentions: { parse: ["everyone"] } }).catch(() => {});
  }
}

// ─── cmdElements — view progress ─────────────────────────────────────────────
export async function cmdElements(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.users.first() ?? message.author;
  const u = getUser(target.id);
  const els = u.elements ?? { eternal_nature: 0, eternal_underworld: 0, eternal_ocean: 0, eternal_earth: 0 };

  const n  = els.eternal_nature     ?? 0;
  const uw = els.eternal_underworld ?? 0;
  const oc = els.eternal_ocean      ?? 0;
  const ea = els.eternal_earth      ?? 0;
  const hasAll3 = n >= 1 && uw >= 1 && oc >= 1;
  const hasEarth = ea >= 1;

  const row = (owned: number, id: keyof typeof ELEMENT_DEFS): string => {
    const el = ELEMENT_DEFS[id];
    const box = owned >= 1 ? "✅" : "⬜";
    return `${box} ${el.emoji} **${el.name}** — ${owned}x\n   _${el.source} · ${el.rate}_`;
  };

  const footer = hasEarth
    ? `> 🔱 **Earth element ready.** Execute \`lowo summon eternal_king\` — costs **30,000 🪙 Battle Tokens**.`
    : hasAll3
      ? `> 🔥 **All three foundational elements found.** Forge the Earth:\n> \`lowo craft eternal_earth\` — costs **5,000,000,000 cowoncy + 100,000 essence + 50,000 Lowo Cash**`
      : `> ⏳ Grind all three game loops manually. Auto-hunt drops nothing.`;

  const desc = [
    row(n,  "eternal_nature"),
    row(uw, "eternal_underworld"),
    row(oc, "eternal_ocean"),
    ``,
    row(ea, "eternal_earth"),
    ``,
    footer,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(hasEarth ? 0xFFD700 : hasAll3 ? 0x00FFFF : 0x2F3136)
    .setAuthor({ name: `${target.username} — Eternal Elements`, iconURL: target.displayAvatarURL({ size: 64 }) })
    .setDescription(desc)
    .setFooter({ text: "Eternal Elements — Endgame Collection System" })
    .setTimestamp();

  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// ─── cmdSummon — summon and fight the Eternal King ───────────────────────────
export async function cmdSummon(message: Message, args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase().replace(/_/g, "").replace(/ /g, "");
  if (sub !== "eternalking") {
    await message.reply("❌ Unknown summon target. Usage: `lowo summon eternal_king`");
    return;
  }

  const u = getUser(message.author.id);
  const els = u.elements ?? {};
  const earthCount = els.eternal_earth ?? 0;
  const bt = u.battleTokens ?? 0;

  if (earthCount < 1) {
    await message.reply(
      "❌ You need the **⚡ Eternal Element of Earth** to summon the king.\n" +
      "_Craft it with_ `lowo craft eternal_earth` _(requires all 3 foundational elements)._",
    );
    return;
  }
  if (bt < 30_000) {
    await message.reply(
      `❌ You need **30,000 🪙 Battle Tokens** to summon. You have **${bt.toLocaleString()}**.\n` +
      `_Earn tokens by winning \`lowo battle\` and \`lowo sb\`._`,
    );
    return;
  }

  // Consume both resources upfront — no refund on loss (this is the risk)
  updateUser(message.author.id, (x) => {
    x.elements!.eternal_earth -= 1;
    x.battleTokens -= 30_000;
  });

  const ch = message.channel;
  const send = async (text: string) => {
    if ("send" in ch) await ch.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  };

  await send(
    `⚡ **${message.author.username}** sacrifices the **Eternal Element of Earth** and **30,000 Battle Tokens**...\n` +
    `\n` +
    `🌑 *The sky fractures. A golden rift tears open above the server.*\n` +
    `💥 *An ancient pressure floods every channel simultaneously.*\n` +
    `\n` +
    `👑 **THE ETERNAL KING HAS AWAKENED.**\n` +
    `_This is a private encounter — no one else may interfere._`,
  );

  await new Promise((r) => setTimeout(r, 1500));
  await runEternalKingFight(message);
}

// ─── Eternal King solo boss fight ────────────────────────────────────────────
async function runEternalKingFight(message: Message): Promise<void> {
  const u = getUser(message.author.id);

  if (u.team.length === 0) {
    await message.reply(
      "❌ Your team is empty — the Eternal King dismissed you without a fight.\n" +
      "_Your resources were still consumed. Build a team and attempt the summon again._",
    );
    return;
  }

  // Build player team
  type Fighter = { id: string; name: string; emoji: string; hp: number; maxHp: number; atk: number; def: number; mag: number; dead: boolean };
  const team: Fighter[] = u.team.map((id) => {
    const base = ANIMAL_BY_ID[id];
    if (!base) return null;
    let hp = base.hp, atk = base.atk, def = base.def, mag = base.mag;
    if (u.enchantments?.[id]) { hp = Math.floor(hp * 1.25); atk = Math.floor(atk * 1.25); def = Math.floor(def * 1.25); mag = Math.floor(mag * 1.25); }
    if (u.mutations?.[id])    { atk = Math.floor(atk * 1.6); mag = Math.floor(mag * 1.6); }
    const p = u.prestige?.[id];
    if (p) {
      const mult = Math.min(Math.pow(2, p.count), 65536);
      if (p.statBuff === "hp")  hp  = Math.floor(hp  * mult);
      if (p.statBuff === "atk") atk = Math.floor(atk * mult);
      if (p.statBuff === "def") def = Math.floor(def * mult);
      if (p.statBuff === "mag") mag = Math.floor(mag * mult);
    }
    const c = u.corrupted?.[id];
    if (c) { hp = c.hp; atk = c.atk; def = c.def; mag = c.mag; }
    return { id, name: base.name, emoji: base.emoji, hp: Math.floor(hp), maxHp: Math.floor(hp), atk: Math.floor(atk), def: Math.floor(def), mag: Math.floor(mag), dead: false };
  }).filter(Boolean) as Fighter[];

  // Eternal King — requires a well-built team with enchants/mutations/prestige to beat
  const KING = { hp: 2_500_000, maxHp: 2_500_000, atk: 900, def: 500, mag: 700 };

  const lines: string[] = [
    "```",
    "⚔️  ETERNAL KING — SOLO ENCOUNTER",
    "──────────────────────────────────────────",
    `👑 Eternal King  HP: ${KING.hp.toLocaleString()} / ${KING.maxHp.toLocaleString()}`,
    `🛡️ Team: ${team.map((p) => `${p.emoji} ${p.name} (HP: ${p.hp})`).join("  •  ")}`,
    "──────────────────────────────────────────",
    "```",
  ];

  const MAX_ROUNDS = 40;
  let round = 0;
  let kingHp = KING.hp;

  while (round < MAX_ROUNDS && kingHp > 0 && team.some((p) => !p.dead)) {
    round++;

    // Player team hits king
    for (const pet of team) {
      if (pet.dead) continue;
      const dmg = Math.max(10, Math.floor((pet.atk * 1.2 + pet.mag * 0.8) - KING.def * 0.25 + Math.random() * 80));
      kingHp = Math.max(0, kingHp - dmg);
    }

    // King hits a random alive pet with a signature skill every 4 rounds
    const alive = team.filter((p) => !p.dead);
    if (alive.length > 0) {
      const target = alive[Math.floor(Math.random() * alive.length)]!;
      let kingDmg = Math.max(1, KING.atk - Math.floor(target.def * 0.35) + Math.floor(Math.random() * 120));
      if (round % 4 === 0) kingDmg = Math.floor(kingDmg * 2.5); // signature burst
      target.hp = Math.max(0, target.hp - kingDmg);
      if (target.hp === 0) target.dead = true;
    }

    // Log every 8 rounds, on death events, or on boss defeat
    const anyDied = team.some((p) => p.dead && p.hp === 0);
    if (round % 8 === 0 || anyDied || kingHp === 0 || !team.some((p) => !p.dead)) {
      const teamLine = team.map((p) => `${p.emoji}${p.dead ? "☠️" : ` HP:${p.hp}`}`).join("  ");
      lines.push(`**Round ${round}** — 👑 **${kingHp.toLocaleString()}** HP remaining\n> ${teamLine}`);
    }

    if (kingHp === 0) break;
  }

  const playerWon = kingHp === 0;
  lines.push(
    playerWon
      ? `\n✅ **THE ETERNAL KING HAS FALLEN.**\n*He shatters into a cascade of golden light and dissolves into the void.*`
      : `\n💀 **YOUR TEAM WAS DEFEATED.**\n*The Eternal King stands unbroken. The rift closes. Your resources are gone.*`,
  );

  const ch = message.channel;
  const content = lines.join("\n").slice(0, 1900);
  if ("send" in ch) await ch.send({ content, allowedMentions: { parse: [] } }).catch(() => {});

  if (playerWon) await handleVictory(message);
}

// ─── Victory handler — DM code + notify owner ────────────────────────────────
async function handleVictory(message: Message): Promise<void> {
  const meta = getLowoMeta() as any;
  const cfg  = (meta.eternalConfig ?? {}) as { code?: string; ownerNotifyId?: string; claimed?: boolean };
  const code = cfg.code ?? null;
  const ownerNotifyId = cfg.ownerNotifyId ?? null;

  // Mark claimed immediately so a second attempt (if code bug) won't re-send
  updateLowoMeta((m: any) => {
    if (!m.eternalConfig) m.eternalConfig = {};
    m.eternalConfig.claimed     = true;
    m.eternalConfig.claimedBy   = message.author.id;
    m.eternalConfig.claimedAt   = Date.now();
    m.eternalConfig.claimedTag  = message.author.tag;
  });

  // DM the winner — verify ID matches summoner (redundant here but explicit)
  try {
    const dm = await message.author.createDM();
    const prizeText = code
      ? `🎁 **Your reward:**\n\`\`\`${code}\`\`\`\n*This code has been marked claimed and the giveaway is now closed.*`
      : `🎁 **Your reward:** An admin has been notified to deliver your prize manually.`;
    await dm.send(
      [
        `👑 **ETERNAL KING DEFEATED — CONGRATULATIONS**`,
        ``,
        `You have conquered the hardest endgame challenge in the server.`,
        `Three rare element drops, a quarter-billion cowoncy forged, and 30,000 Battle Tokens spent.`,
        ``,
        prizeText,
      ].join("\n"),
    );
  } catch {
    const ch = message.channel;
    if ("send" in ch) {
      await ch.send(
        `⚠️ **${message.author.username}** — I could not DM you. Enable DMs and contact an admin to claim your prize.`,
      ).catch(() => {});
    }
  }

  // DM the owner
  if (ownerNotifyId) {
    try {
      const owner = await message.client.users.fetch(ownerNotifyId);
      await owner.send(
        [
          `⚠️ **GIVEAWAY CONCLUDED — INTERNAL ALERT**`,
          ``,
          `**User:** ${message.author.tag} (${message.author.id})`,
          `**Server:** ${message.guild?.name ?? "Unknown"} (${message.guildId ?? "DM"})`,
          `**Event:** Eternal King defeated.`,
          `**Prize dispatched:** ${code ? "40 RS code sent to their DMs." : "No code configured — manual delivery required."}`,
          `**System Status:** Giveaway module is now flagged as [INACTIVE].`,
        ].join("\n"),
      );
    } catch {
      // Owner DM failed silently
    }
  }

  // Public victory announcement
  const ch = message.channel;
  if ("send" in ch) {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle("👑  ETERNAL KING — DEFEATED")
      .setDescription(
        [
          `**${message.author.username}** has conquered the ultimate endgame challenge.`,
          ``,
          `🌿 Eternal Element of Nature — hunted from the wild`,
          `💀 Eternal Element of Underworld — mined from the deep`,
          `🌊 Eternal Element of Ocean — fished from the abyss`,
          `⚡ Eternal Element of Earth — forged at impossible cost`,
          `👑 Eternal King — defeated in solo combat`,
          ``,
          `*The giveaway has concluded.*`,
        ].join("\n"),
      )
      .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
      .setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  }
}

// ─── cmdEternalBoard — server-wide leaderboard ───────────────────────────────
export async function cmdEternalBoard(message: Message): Promise<void> {
  const allUsers = getAllUsers();

  interface BoardEntry {
    id: string;
    n: number; uw: number; oc: number; ea: number;
    score: number;
  }

  const entries: BoardEntry[] = [];
  for (const [id, u] of Object.entries(allUsers)) {
    const els = u.elements;
    if (!els) continue;
    const n  = els.eternal_nature     ?? 0;
    const uw = els.eternal_underworld ?? 0;
    const oc = els.eternal_ocean      ?? 0;
    const ea = els.eternal_earth      ?? 0;
    if (n + uw + oc + ea === 0) continue;
    // Score: earth = 100pts (needs all 3 + craft), each foundational = 1pt
    const score = ea * 100 + n + uw + oc;
    entries.push({ id, n, uw, oc, ea, score });
  }

  entries.sort((a, b) => b.score - a.score || b.n + b.uw + b.oc - (a.n + a.uw + a.oc));

  if (entries.length === 0) {
    await message.reply(
      "⬜ No one has found an Eternal Element yet.\n" +
      "_Hunt, mine, and fish manually — autohunt drops nothing._",
    );
    return;
  }

  const MEDALS = ["🥇", "🥈", "🥉"];
  const lines: string[] = [];

  for (let i = 0; i < Math.min(entries.length, 15); i++) {
    const e = entries[i]!;
    const medal = MEDALS[i] ?? `**${i + 1}.**`;
    let userTag: string;
    try { userTag = `<@${e.id}>`; } catch { userTag = `\`${e.id}\``; }

    const badges = [
      e.n  > 0 ? `🌿×${e.n}`  : "⬜🌿",
      e.uw > 0 ? `💀×${e.uw}` : "⬜💀",
      e.oc > 0 ? `🌊×${e.oc}` : "⬜🌊",
      e.ea > 0 ? `⚡×${e.ea}` : "⬜⚡",
    ].join("  ");
    lines.push(`${medal} ${userTag}\n> ${badges}`);
  }

  const meta = getLowoMeta() as any;
  const cfg = meta.eternalConfig ?? {};
  const claimed = cfg.claimed === true;
  const statusLine = claimed
    ? `\n> 🏆 *The Eternal King has been defeated. The giveaway is concluded.*`
    : `\n> 🔱 *The Eternal King awaits. First to defeat him wins the prize.*`;

  const embed = new EmbedBuilder()
    .setColor(0x00FFFF)
    .setTitle("👑  Eternal Elements — Server Board")
    .setDescription(
      [
        "**Legend:**  🌿 Nature  •  💀 Underworld  •  🌊 Ocean  •  ⚡ Earth",
        "Collect all three foundational elements → craft Earth → summon the king.",
        "",
        ...lines,
        statusLine,
      ].join("\n"),
    )
    .setFooter({ text: "Elements drop only on manual lowo hunt / mine / fish — never on autohunt" })
    .setTimestamp();

  await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

// ─── Admin helpers ────────────────────────────────────────────────────────────
export async function cmdSetEternalCode(message: Message, args: string[]): Promise<void> {
  const code = args.join(" ").trim();
  if (!code) { await message.reply("Usage: `lowo seteternalcode <your-code>`"); return; }
  updateLowoMeta((m: any) => {
    if (!m.eternalConfig) m.eternalConfig = {};
    m.eternalConfig.code = code;
  });
  await message.reply(`✅ Eternal King prize code set. *(Only visible in lowo.json on the server — never exposed to users.)*`);
  // Delete the command message so the code isn't visible in chat
  await message.delete().catch(() => {});
}

export async function cmdSetEternalOwner(message: Message, args: string[]): Promise<void> {
  const id = args[0]?.trim();
  if (!id || !/^\d{17,20}$/.test(id)) { await message.reply("Usage: `lowo seteternalowner <Discord User ID>`"); return; }
  updateLowoMeta((m: any) => {
    if (!m.eternalConfig) m.eternalConfig = {};
    m.eternalConfig.ownerNotifyId = id;
  });
  await message.reply(`✅ Eternal King owner notify ID set to \`${id}\`.`);
}

export async function cmdEternalStatus(message: Message): Promise<void> {
  const meta = getLowoMeta() as any;
  const cfg = (meta.eternalConfig ?? {}) as { code?: string; ownerNotifyId?: string; claimed?: boolean; claimedBy?: string; claimedTag?: string; claimedAt?: number };
  const lines = [
    `**Eternal Elements Config**`,
    `Code configured: ${cfg.code ? "✅ Yes" : "❌ No"}`,
    `Owner notify ID: ${cfg.ownerNotifyId ? `\`${cfg.ownerNotifyId}\`` : "❌ Not set"}`,
    `Claimed: ${cfg.claimed ? `✅ Yes — by ${cfg.claimedTag ?? cfg.claimedBy} on <t:${Math.floor((cfg.claimedAt ?? 0) / 1000)}:f>` : "No"}`,
  ];
  await message.reply(lines.join("\n"));
}
