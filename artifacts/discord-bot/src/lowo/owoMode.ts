import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getUser, updateUser, allUsers } from "./storage.js";

// ─── OWO Mode — replaces Lowo system when `lowo 2` is active ─────────────────
// Owner activates with `lowo 2`, returns to normal Lowo with `lowo 1`.
// Uses the same underlying lowo.json storage (cowoncy, zoo, etc.) but
// presents everything in authentic OwO bot style.

// ─── Animal table (mirrors real OwO bot rarities) ─────────────────────────────
const OWO_ANIMALS: Array<{ name: string; emoji: string; rank: number; value: number; weight: number }> = [
  // Common (rank 1) — weight 45
  { name: "frog",       emoji: "🐸", rank: 1, value: 2,    weight: 45 },
  { name: "snail",      emoji: "🐌", rank: 1, value: 2,    weight: 45 },
  { name: "mouse",      emoji: "🐭", rank: 1, value: 2,    weight: 45 },
  { name: "worm",       emoji: "🪱", rank: 1, value: 3,    weight: 45 },
  { name: "ant",        emoji: "🐜", rank: 1, value: 2,    weight: 45 },
  { name: "fly",        emoji: "🪰", rank: 1, value: 2,    weight: 45 },
  // Uncommon (rank 2) — weight 25
  { name: "rabbit",     emoji: "🐰", rank: 2, value: 10,   weight: 25 },
  { name: "hedgehog",   emoji: "🦔", rank: 2, value: 10,   weight: 25 },
  { name: "chipmunk",   emoji: "🐿",  rank: 2, value: 10,  weight: 25 },
  { name: "duck",       emoji: "🦆", rank: 2, value: 12,   weight: 25 },
  { name: "penguin",    emoji: "🐧", rank: 2, value: 12,   weight: 25 },
  // Rare (rank 3) — weight 12
  { name: "cat",        emoji: "🐱", rank: 3, value: 30,   weight: 12 },
  { name: "dog",        emoji: "🐶", rank: 3, value: 30,   weight: 12 },
  { name: "fox",        emoji: "🦊", rank: 3, value: 35,   weight: 12 },
  { name: "koala",      emoji: "🐨", rank: 3, value: 35,   weight: 12 },
  { name: "panda",      emoji: "🐼", rank: 3, value: 35,   weight: 12 },
  { name: "turtle",     emoji: "🐢", rank: 3, value: 30,   weight: 12 },
  // Epic (rank 4) — weight 8
  { name: "tiger",      emoji: "🐯", rank: 4, value: 80,   weight: 8  },
  { name: "lion",       emoji: "🦁", rank: 4, value: 80,   weight: 8  },
  { name: "leopard",    emoji: "🐆", rank: 4, value: 85,   weight: 8  },
  { name: "elephant",   emoji: "🐘", rank: 4, value: 85,   weight: 8  },
  { name: "hippo",      emoji: "🦛", rank: 4, value: 80,   weight: 8  },
  // Mythical (rank 5) — weight 5
  { name: "whale",      emoji: "🐳", rank: 5, value: 200,  weight: 5  },
  { name: "giraffe",    emoji: "🦒", rank: 5, value: 200,  weight: 5  },
  { name: "gorilla",    emoji: "🦍", rank: 5, value: 210,  weight: 5  },
  { name: "polarbear",  emoji: "🐻‍❄️", rank: 5, value: 220, weight: 5 },
  // Legendary (rank 6) — weight 2
  { name: "phoenix",    emoji: "🦅", rank: 6, value: 500,  weight: 2  },
  { name: "unicorn",    emoji: "🦄", rank: 6, value: 500,  weight: 2  },
  { name: "dragon",     emoji: "🐉", rank: 6, value: 550,  weight: 2  },
  // Fabled (rank 7) — weight 1
  { name: "qilin",      emoji: "🐲", rank: 7, value: 1200, weight: 1  },
  { name: "cerberus",   emoji: "🐕‍🦺", rank: 7, value: 1200, weight: 1 },
  // Undiscovered (rank 8) — weight 0.5
  { name: "nessie",     emoji: "🦕", rank: 8, value: 3000, weight: 0.5 },
  { name: "bigfoot",    emoji: "🦶", rank: 8, value: 3000, weight: 0.5 },
];

const RANK_NAMES: Record<number, string> = {
  1: "**`common`**",
  2: "**`uncommon`**",
  3: "**`rare`**",
  4: "**`epic`**",
  5: "**`mythical`**",
  6: "**`legendary`**",
  7: "**`fabled`**",
  8: "**`undiscovered`**",
};

const HUNT_COST = 5;

function weightedRandom(): typeof OWO_ANIMALS[0] {
  const total = OWO_ANIMALS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of OWO_ANIMALS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return OWO_ANIMALS[0];
}

// ─── HUNT ────────────────────────────────────────────────────────────────────
export async function owoHunt(message: Message): Promise<void> {
  const u = getUser(message.author.id);
  if (u.cowoncy < HUNT_COST) {
    await message.reply(`**🌱 | ${message.author.username}**, you need at least **5 cowoncy** to hunt! Use \`owo daily\` to get some.`);
    return;
  }
  const now = Date.now();
  const cd = 10_000;
  if (now - u.lastHunt < cd) {
    const sLeft = Math.ceil((cd - (now - u.lastHunt)) / 1000);
    await message.reply(`**⏳ | ${message.author.username}**, please wait **${sLeft}s** before hunting again!`);
    return;
  }

  const animal = weightedRandom();
  const zooKey = `owo_${animal.name}`;
  updateUser(message.author.id, (u) => {
    u.cowoncy -= HUNT_COST;
    u.lastHunt = now;
    u.zoo[zooKey] = (u.zoo[zooKey] ?? 0) + 1;
    if (!u.dex.includes(zooKey)) u.dex.push(zooKey);
    u.huntsTotal = (u.huntsTotal ?? 0) + 1;
  });

  const rank = RANK_NAMES[animal.rank];
  const vowels = "aeiou";
  const article = vowels.includes(animal.name[0]) ? "an" : "a";
  const text = `**🌱 | ${message.author.username}** spent 5 cowoncy and caught ${article} ${rank} ${animal.emoji}!`;
  await message.reply(text);
}

// ─── ZOO ─────────────────────────────────────────────────────────────────────
export async function owoZoo(message: Message): Promise<void> {
  const target = message.mentions.users.first() ?? message.author;
  const u = getUser(target.id);

  const owoAnimals = Object.entries(u.zoo)
    .filter(([k]) => k.startsWith("owo_"))
    .map(([k, count]) => {
      const name = k.replace("owo_", "");
      const animal = OWO_ANIMALS.find((a) => a.name === name);
      return { name, count, emoji: animal?.emoji ?? "🐾", rank: animal?.rank ?? 1 };
    })
    .sort((a, b) => b.rank - a.rank);

  if (owoAnimals.length === 0) {
    await message.reply(`**${target.username}**'s zoo is empty! Use \`owo hunt\` to catch some animals.`);
    return;
  }

  const header = `🌿 🌱 🌳** ${target.username}'s zoo! **🌳 🌿 🌱\n`;
  const lines = owoAnimals.map((a) => `${a.emoji} ${a.name} **${a.count}**`);
  const totalAnimals = owoAnimals.reduce((s, a) => s + a.count, 0);
  const text = header + lines.join("  •  ") + `\n**Total**: ${totalAnimals} animals`;

  await message.reply(text.length > 2000 ? text.slice(0, 1997) + "..." : text);
}

// ─── SELL ─────────────────────────────────────────────────────────────────────
export async function owoSell(message: Message, args: string[]): Promise<void> {
  const name = args[0]?.toLowerCase();
  if (!name) {
    await message.reply("Usage: `owo sell <animal> [n|all]`");
    return;
  }
  const zooKey = `owo_${name}`;
  const u = getUser(message.author.id);
  const owned = u.zoo[zooKey] ?? 0;
  if (owned === 0) {
    await message.reply(`**⚠️ | ${message.author.username}**, you don't have any **${name}** to sell!`);
    return;
  }

  const animal = OWO_ANIMALS.find((a) => a.name === name);
  const sellVal = animal?.value ?? 5;

  let sellCount = 1;
  const amount = args[1];
  if (amount === "all") sellCount = owned;
  else if (amount && !isNaN(Number(amount))) sellCount = Math.min(Number(amount), owned);

  const earned = sellVal * sellCount;
  updateUser(message.author.id, (u) => {
    u.cowoncy += earned;
    u.zoo[zooKey] -= sellCount;
    if (u.zoo[zooKey] <= 0) delete u.zoo[zooKey];
  });

  await message.reply(`**💰 | ${message.author.username}** sold **${sellCount} ${name}** for **${earned} cowoncy**!`);
}

// ─── DAILY ───────────────────────────────────────────────────────────────────
export async function owoDaily(message: Message): Promise<void> {
  const u = getUser(message.author.id);
  const now = Date.now();
  const DAY = 86_400_000;
  if (now - u.lastDaily < DAY) {
    const left = DAY - (now - u.lastDaily);
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    const s = Math.floor((left % 60_000) / 1_000);
    await message.reply(`**⏰ | ${message.author.username}**, your daily resets in **${h}H ${m}M ${s}S**`);
    return;
  }

  const streak48 = u.lastDaily > 0 && (now - u.lastDaily) < 172_800_000;
  const newStreak = streak48 ? (u.dailyStreak ?? 0) + 1 : 1;
  const gain = Math.floor(500 + Math.random() * 200) + (newStreak - 1) * 25;

  updateUser(message.author.id, (u) => {
    u.cowoncy += gain;
    u.lastDaily = now;
    u.dailyStreak = newStreak;
  });

  const left = DAY - 1;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  let text = `💰 **| ${message.author.username}**, Here is your daily **${gain} Cowoncy**!`;
  if (newStreak > 1) text += `\n**<:blank:427371936482328596> |** You're on a **${newStreak - 1} daily streak**!`;
  text += `\n**⏱️ |** Your next daily is in: **${h}H ${m}M**`;
  await message.reply(text);
}

// ─── COWONCY ─────────────────────────────────────────────────────────────────
export async function owoCowoncy(message: Message): Promise<void> {
  const target = message.mentions.users.first() ?? message.author;
  const u = getUser(target.id);
  const money = u.cowoncy.toLocaleString();
  await message.reply(`<:cowoncy:416043450337853441> **| ${target.username}**, you currently have **__${money}__ cowoncy!**`);
}

// ─── GIVE ─────────────────────────────────────────────────────────────────────
export async function owoGive(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.users.first();
  if (!target || target.bot) {
    await message.reply("**⚠️ | Usage:** `owo give @user <amount>`");
    return;
  }
  const amtStr = args.find((a) => !a.startsWith("<@"));
  const amt = Number(amtStr);
  if (!amtStr || isNaN(amt) || amt <= 0) {
    await message.reply("**⚠️ |** Please specify a valid amount!");
    return;
  }
  const u = getUser(message.author.id);
  if (u.cowoncy < amt) {
    await message.reply(`**⚠️ | ${message.author.username}**, you don't have enough cowoncy!`);
    return;
  }
  updateUser(message.author.id, (u) => { u.cowoncy -= amt; });
  updateUser(target.id, (u) => { u.cowoncy += amt; });
  await message.reply(`**💸 | ${message.author.username}** has given **${target.username}** **${amt.toLocaleString()}** cowoncy!`);
}

// ─── PRAY / CURSE ─────────────────────────────────────────────────────────────
const PRAY_LINES = ["May luck be in your favor.", "You feel lucky!", "Fortune favors you!", "Luck is on your side!"];
const CURSE_LINES = ["You feel unlucky...", "Oh no.", "rip", "I've got a bad feeling about this..."];

export async function owoPray(message: Message, args: string[], cmd: "pray" | "curse"): Promise<void> {
  const target = message.mentions.users.first();

  if (cmd === "pray") {
    const line = PRAY_LINES[Math.floor(Math.random() * PRAY_LINES.length)];
    if (target && target.id !== message.author.id) {
      updateUser(message.author.id, (u) => { u.rep = (u.rep ?? 0) - 1; });
      updateUser(target.id, (u) => { u.rep = (u.rep ?? 0) + 1; });
      const luck = getUser(target.id).rep ?? 0;
      await message.reply(`**🙏 | ${message.author.username}** prays for **${target.username}**! ${line}\n**<:blank:427371936482328596> |** ${target.username} now has **${luck}** luck point(s)!`);
    } else {
      updateUser(message.author.id, (u) => { u.rep = (u.rep ?? 0) + 1; });
      const luck = getUser(message.author.id).rep ?? 0;
      await message.reply(`**🙏 | ${message.author.username}** prays... ${line}\n**<:blank:427371936482328596> |** You have **${luck}** luck point(s)!`);
    }
  } else {
    const line = CURSE_LINES[Math.floor(Math.random() * CURSE_LINES.length)];
    if (target && target.id !== message.author.id) {
      updateUser(message.author.id, (u) => { u.rep = (u.rep ?? 0) + 1; });
      updateUser(target.id, (u) => { u.rep = (u.rep ?? 0) - 1; });
      const luck = getUser(target.id).rep ?? 0;
      await message.reply(`**👻 | ${message.author.username}** puts a curse on **${target.username}**! ${line}\n**<:blank:427371936482328596> |** ${target.username} now has **${luck}** luck point(s)!`);
    } else {
      updateUser(message.author.id, (u) => { u.rep = (u.rep ?? 0) - 1; });
      const luck = getUser(message.author.id).rep ?? 0;
      await message.reply(`**👻 | ${message.author.username}** is now cursed. ${line}\n**<:blank:427371936482328596> |** You have **${luck}** luck point(s)!`);
    }
  }
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
export async function owoProfile(message: Message): Promise<void> {
  const target = message.mentions.users.first() ?? message.author;
  const u = getUser(target.id);
  const totalOwO = Object.entries(u.zoo).filter(([k]) => k.startsWith("owo_")).reduce((s, [, v]) => s + v, 0);
  const uniqueDex = u.dex.filter((d) => d.startsWith("owo_")).length;
  const e = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${target.username}'s Profile`, iconURL: target.displayAvatarURL({ size: 128 }) })
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "💰 Cowoncy",      value: u.cowoncy.toLocaleString(),          inline: true },
      { name: "🌱 Animals",      value: String(totalOwO),                     inline: true },
      { name: "📗 Dex",          value: `${uniqueDex}/${OWO_ANIMALS.length}`, inline: true },
      { name: "⭐ Luck",         value: String(u.rep ?? 0),                   inline: true },
      { name: "🔥 Daily Streak", value: String(u.dailyStreak ?? 0),           inline: true },
    )
    .setFooter({ text: "OwO Mode — type `lowo 1` to return to normal Lowo (owner only)" });
  await message.reply({ embeds: [e] });
}

// ─── TOP ─────────────────────────────────────────────────────────────────────
export async function owoTop(message: Message): Promise<void> {
  const users = allUsers();
  const sorted = Object.entries(users)
    .sort(([, a], [, b]) => b.cowoncy - a.cowoncy)
    .slice(0, 10);

  if (sorted.length === 0) {
    await message.reply("No players yet!");
    return;
  }
  const lines = sorted.map(([id, data], i) => {
    const medal = ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;
    return `${medal} \`${id}\` — **${data.cowoncy.toLocaleString()}** cowoncy`;
  });
  const e = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆 Cowoncy Leaderboard")
    .setDescription(lines.join("\n"));
  await message.reply({ embeds: [e] });
}

// ─── SLOTS ───────────────────────────────────────────────────────────────────
const SLOT_EMOJIS = ["🍎", "🍊", "🍋", "🍇", "🍒", "⭐", "💎", "7️⃣"];
export async function owoSlots(message: Message, args: string[]): Promise<void> {
  const bet = Number(args[0]);
  if (!bet || bet < 1) { await message.reply("Usage: `owo slots <amount>`"); return; }
  const u = getUser(message.author.id);
  if (u.cowoncy < bet) { await message.reply("**⚠️ |** You don't have enough cowoncy!"); return; }

  const reels = [0, 1, 2].map(() => SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)]);
  const display = `[ ${reels.join(" | ")} ]`;
  const allMatch = reels[0] === reels[1] && reels[1] === reels[2];
  const twoMatch = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];

  let mult = 0;
  if (allMatch) mult = reels[0] === "💎" ? 10 : reels[0] === "7️⃣" ? 7 : 3;
  else if (twoMatch) mult = 1.5;

  const change = mult > 0 ? Math.floor(bet * mult) : -bet;
  updateUser(message.author.id, (u) => { u.cowoncy += change; });

  let result: string;
  if (allMatch) result = `**JACKPOT!** 🎰 You won **${Math.floor(bet * mult)}** cowoncy!`;
  else if (twoMatch) result = `Close one! You won **${Math.floor(bet * mult)}** cowoncy!`;
  else result = `You lost **${bet}** cowoncy. Try again!`;

  await message.reply(`**🎰 | ${message.author.username}**\n${display}\n${result}`);
}

// ─── COINFLIP ─────────────────────────────────────────────────────────────────
export async function owoCoinflip(message: Message, args: string[]): Promise<void> {
  const side = args[0]?.toLowerCase();
  const bet = Number(args[1]);
  if (!side || !["h", "t", "heads", "tails"].includes(side) || !bet || bet < 1) {
    await message.reply("Usage: `owo coinflip h|t <amount>`");
    return;
  }
  const u = getUser(message.author.id);
  if (u.cowoncy < bet) { await message.reply("**⚠️ |** You don't have enough cowoncy!"); return; }

  const flip = Math.random() < 0.5 ? "heads" : "tails";
  const playerSide = ["h", "heads"].includes(side) ? "heads" : "tails";
  const won = flip === playerSide;
  updateUser(message.author.id, (u) => { u.cowoncy += won ? bet : -bet; });

  const coin = flip === "heads" ? "🪙" : "🌑";
  await message.reply(`${coin} The coin landed on **${flip}**! You ${won ? `won **${bet}** cowoncy!` : `lost **${bet}** cowoncy.`}`);
}

// ─── BLACKJACK ───────────────────────────────────────────────────────────────
const BJ_SUITS = ["♠️", "♥️", "♦️", "♣️"];
const BJ_VALS  = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
function dealCard() { return { suit: BJ_SUITS[Math.floor(Math.random() * 4)], val: BJ_VALS[Math.floor(Math.random() * 13)] }; }
function cardVal(c: { val: string }) { if (c.val === "A") return 11; if (["J","Q","K"].includes(c.val)) return 10; return Number(c.val); }
function handTotal(hand: Array<{ val: string }>) {
  let total = hand.reduce((s, c) => s + cardVal(c), 0);
  let aces = hand.filter((c) => c.val === "A").length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function handStr(hand: Array<{ val: string; suit: string }>) { return hand.map((c) => `${c.val}${c.suit}`).join(" "); }

export async function owoBlackjack(message: Message, args: string[]): Promise<void> {
  const bet = Number(args[0]);
  if (!bet || bet < 1) { await message.reply("Usage: `owo blackjack <amount>`"); return; }
  const u = getUser(message.author.id);
  if (u.cowoncy < bet) { await message.reply("**⚠️ |** You don't have enough cowoncy!"); return; }

  const playerHand = [dealCard(), dealCard()];
  const dealerHand = [dealCard(), dealCard()];
  const pTotal = handTotal(playerHand);
  const dTotal = handTotal(dealerHand);

  let result: string;
  let change: number;

  if (pTotal === 21 && dTotal !== 21) {
    change = Math.floor(bet * 1.5); result = `🃏 **Blackjack!** You win **${change}** cowoncy!`;
  } else if (pTotal > 21) {
    change = -bet; result = `💥 Bust! You lose **${bet}** cowoncy.`;
  } else if (dTotal > 21 || pTotal > dTotal) {
    change = bet; result = `✅ You win **${bet}** cowoncy!`;
  } else if (pTotal === dTotal) {
    change = 0; result = "🤝 It's a tie! Your bet is returned.";
  } else {
    change = -bet; result = `❌ Dealer wins. You lose **${bet}** cowoncy.`;
  }

  updateUser(message.author.id, (u) => { u.cowoncy += change; });
  await message.reply(
    `🃏 **Blackjack**\n` +
    `**Your hand:** ${handStr(playerHand)} *(${pTotal})*\n` +
    `**Dealer hand:** ${handStr(dealerHand)} *(${dTotal})*\n` +
    result
  );
}

// ─── COOKIE ───────────────────────────────────────────────────────────────────
const cookieCooldowns = new Map<string, number>();
export async function owoCookie(message: Message): Promise<void> {
  const target = message.mentions.users.first();
  if (!target || target.id === message.author.id || target.bot) {
    await message.reply("**⚠️ |** Give a cookie to someone else! `owo cookie @user`");
    return;
  }
  const now = Date.now();
  const key = `${message.author.id}:${target.id}`;
  const last = cookieCooldowns.get(key) ?? 0;
  if (now - last < 86_400_000) {
    const h = Math.floor((86_400_000 - (now - last)) / 3_600_000);
    await message.reply(`**⏰ |** You can give ${target.username} another cookie in **${h}h**!`);
    return;
  }
  cookieCooldowns.set(key, now);
  await message.reply(`**🍪 | ${message.author.username}** gave **${target.username}** a cookie! ʕ·ᴥ·ʔ`);
}

// ─── SHIP ─────────────────────────────────────────────────────────────────────
export async function owoShip(message: Message): Promise<void> {
  const mentioned = Array.from(message.mentions.users.values());
  const user1 = mentioned[0] ?? message.author;
  const user2 = mentioned[1] ?? message.author;
  if (user1.id === user2.id) {
    await message.reply("**⚠️ |** You need to mention two different users to ship.");
    return;
  }
  const hash = (user1.id.charCodeAt(0) + user2.id.charCodeAt(0) + user1.id.length + user2.id.length) % 101;
  const bar = "▓".repeat(Math.floor(hash / 10)) + "░".repeat(10 - Math.floor(hash / 10));
  const verdict = hash >= 80 ? "💕 Soulmates!" : hash >= 60 ? "💖 Great match!" : hash >= 40 ? "💛 Good pair!" : hash >= 20 ? "😅 Unlikely..." : "💔 Not meant to be.";
  await message.reply(`**💕 | Ship Meter**\n${user1.username} + ${user2.username}\n\`[${bar}]\` **${hash}%**\n${verdict}`);
}

// ─── OWOIFY ───────────────────────────────────────────────────────────────────
export async function owoOwoify(message: Message, args: string[]): Promise<void> {
  const text = args.join(" ");
  if (!text) { await message.reply("Usage: `owo owoify <text>`"); return; }
  const owoified = text
    .replace(/[rl]/g, "w")
    .replace(/[RL]/g, "W")
    .replace(/n([aeiouAEIOU])/g, "ny$1")
    .replace(/N([aeiouAEIOU])/g, "Ny$1")
    .replace(/ove/g, "uv")
    .replace(/!+/g, " owo!")
    .replace(/\. /g, " uwu. ");
  const faces = ["(・`ω´・)", ";;w;;", "owo", "UwU", ">w<", "^w^"];
  const face = faces[Math.floor(Math.random() * faces.length)];
  await message.reply(`${owoified} ${face}`);
}

// ─── PING ─────────────────────────────────────────────────────────────────────
export async function owoPing(message: Message): Promise<void> {
  const start = Date.now();
  const m = await message.reply("**🏓 Pong!**");
  await m.edit(`**🏓 Pong!** \`${Date.now() - start}ms\``);
}

// ─── HELP ─────────────────────────────────────────────────────────────────────
export async function owoHelp(message: Message): Promise<void> {
  const e = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: "Command List", iconURL: message.author.displayAvatarURL() })
    .setDescription("Here is the list of commands!\nFor more info: `owo help {command}`")
    .addFields(
      { name: "🎖 Rankings",  value: "`top`  `my`" },
      { name: "💰 Economy",   value: "`cowoncy`  `money`  `give`  `daily`" },
      { name: "🌱 Animals",   value: "`hunt`(h)  `zoo`(z)  `sell`(s)  `sacrifice`(sac)" },
      { name: "🎲 Gambling",  value: "`slots`  `coinflip`(cf)  `blackjack`(bj)" },
      { name: "🎭 Social",    value: "`cookie`  `ship`  `pray`  `curse`  `profile`(p)  `owoify`" },
      { name: "🔧 Utility",   value: "`ping`  `help`" },
      { name: "🔁 Mode",      value: "`lowo 1` — return to normal Lowo *(owner only)*" },
    )
    .setFooter({ text: "Currently in OwO Mode • Prefix: owo" });
  await message.reply({ embeds: [e] });
}

// ─── MAIN OWO ROUTER ─────────────────────────────────────────────────────────
type OwoHandler = (message: Message, args: string[]) => Promise<void>;

const OWO_HANDLERS: Record<string, OwoHandler> = {
  hunt: (m)    => owoHunt(m),      h: (m)    => owoHunt(m),
  zoo:  (m, a) => owoZoo(m),       z: (m, a) => owoZoo(m),
  sell: owoSell,                   s: owoSell,
  sacrifice: owoSell,              sac: owoSell,
  daily: (m)   => owoDaily(m),     d: (m)    => owoDaily(m),
  cowoncy: (m) => owoCowoncy(m),   money:   (m) => owoCowoncy(m),
  cash: (m)    => owoCowoncy(m),   balance: (m) => owoCowoncy(m),
  bal:  (m)    => owoCowoncy(m),
  give: owoGive,                   send: owoGive,
  pray:  (m, a) => owoPray(m, a, "pray"),
  curse: (m, a) => owoPray(m, a, "curse"),
  profile: (m) => owoProfile(m),   p: (m) => owoProfile(m),
  top: (m)     => owoTop(m),       leaderboard: (m) => owoTop(m),
  slots: owoSlots,                 slot: owoSlots,
  coinflip: owoCoinflip,           cf: owoCoinflip,
  blackjack: owoBlackjack,         bj: owoBlackjack,
  cookie: (m) => owoCookie(m),
  ship:   (m) => owoShip(m),
  owoify: owoOwoify,
  help:  (m)  => owoHelp(m),       "?": (m) => owoHelp(m),
  ping:  (m)  => owoPing(m),
};

// Direct dispatcher — called by router.ts with already-parsed sub + args
export async function dispatchOwoCommand(message: Message, sub: string, args: string[]): Promise<boolean> {
  const handler = OWO_HANDLERS[sub];
  if (!handler) {
    await message.reply(`**🚫 |** Could not find OwO command \`${sub}\`. Try \`lowo help\`!`);
    return true;
  }
  try {
    await handler(message, args);
  } catch (err) {
    console.error("[OWO MODE]", sub, err);
    await message.reply("⚠️ Something went wrong processing that command.").catch(() => {});
  }
  return true;
}

export async function handleOwoModeCommand(message: Message): Promise<boolean> {
  const content = message.content.trim();
  const lower = content.toLowerCase();
  if (!lower.startsWith("owo ") && lower !== "owo") return false;

  const parts = content.split(/\s+/);
  parts.shift(); // remove "owo"
  const sub = parts.shift()?.toLowerCase() ?? "help";
  const args = parts;
  return dispatchOwoCommand(message, sub, args);
}
