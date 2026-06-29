import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getUser, setUser, addBalance, getTopUsers } from "./store.js";

const HR   = "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯";
const FOOT = "Last Stand (LS)  ·  Economy";
const COIN = "💰";

function ecoEmbed(color: number, title: string, desc: string) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: "LAST STAND  ·  ECONOMY" })
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: FOOT })
    .setTimestamp();
}

function fmt(n: number): string { return n.toLocaleString(); }
function cd(last: number, ms: number): { ok: boolean; remaining: string } {
  const diff = Date.now() - last;
  if (diff >= ms) return { ok: true, remaining: "" };
  const left  = ms - diff;
  const h     = Math.floor(left / 3600000);
  const m     = Math.floor((left % 3600000) / 60000);
  const s     = Math.floor((left % 60000) / 1000);
  return { ok: false, remaining: h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s` };
}

const WORK_JOBS = [
  ["🏗️ built a skyscraper", [150, 400]],
  ["🚗 delivered packages", [80, 250]],
  ["💻 coded an app", [200, 500]],
  ["🍕 delivered pizzas", [50, 150]],
  ["📦 stocked shelves", [60, 180]],
  ["🎮 tested video games", [120, 350]],
  ["🎵 busked on the street", [30, 120]],
  ["🌱 watered plants", [40, 100]],
  ["🔧 fixed computers", [150, 420]],
  ["📸 took photos", [90, 280]],
] as [string, [number, number]][];

const CRIME_EVENTS = [
  ["🔪 robbed a convenience store", [300, 800], 0.55],
  ["🎰 ran an illegal gambling ring", [500, 1500], 0.45],
  ["💊 sold fake medicine", [200, 600], 0.5],
  ["🚗 boosted a car", [400, 1000], 0.5],
  ["💳 cloned credit cards", [600, 1200], 0.4],
] as [string, [number, number], number][];

const SHOP_ITEMS = [
  { id: "lucky_charm",    name: "🍀 Lucky Charm",      price: 500,   desc: "Boost your luck for 24h" },
  { id: "xp_boost",       name: "⚡ XP Boost",          price: 1000,  desc: "Double XP for 1h" },
  { id: "shield",         name: "🛡️ Robbery Shield",   price: 800,   desc: "Prevent being robbed once" },
  { id: "vault",          name: "🏦 Mini Vault",        price: 2000,  desc: "Store up to 10,000 coins safely" },
  { id: "pickaxe",        name: "⛏️ Pickaxe",          price: 1500,  desc: "Mine coins every hour" },
  { id: "fish_rod",       name: "🎣 Fishing Rod",       price: 750,   desc: "Fish for coins" },
  { id: "mask",           name: "🎭 Crime Mask",        price: 600,   desc: "+15% crime success rate" },
  { id: "laptop",         name: "💻 Laptop",            price: 3000,  desc: "Work from home for +50% work bonus" },
];

// ── /balance ──────────────────────────────────────────────────────────────────
export const balanceData = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your coin balance.")
  .addUserOption((o) => o.setName("user").setDescription("Check another user's balance").setRequired(false));

export async function executeBalance(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const u      = await getUser(target.id);
  const total  = u.balance + u.bank;
  await interaction.editReply({ embeds: [ecoEmbed(0xf59e0b, `${COIN}  BALANCE — ${target.username}`,
    `${HR}\n▸  **Wallet** — \`${fmt(u.balance)}\` coins\n▸  **Bank** — \`${fmt(u.bank)}\` coins\n▸  **Total** — \`${fmt(total)}\` coins\n${HR}`
  ).setThumbnail(target.displayAvatarURL())] });
}

// ── /daily ────────────────────────────────────────────────────────────────────
export const dailyData = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily coin reward.");

export async function executeDaily(interaction: ChatInputCommandInteraction): Promise<void> {
  const u   = await getUser(interaction.user.id);
  const { ok, remaining } = cd(u.lastDaily, 24 * 3600 * 1000);
  if (!ok) { await interaction.editReply({ content: `⏳ Daily already claimed. Try again in **${remaining}**.` }); return; }
  const amount = 100 + Math.floor(Math.random() * 401);
  await addBalance(interaction.user.id, amount);
  await setUser(interaction.user.id, { lastDaily: Date.now() });
  await interaction.editReply({ embeds: [ecoEmbed(0x2ecc71, "🎁  DAILY REWARD CLAIMED",
    `${HR}\n▸  **Earned** — \`+${fmt(amount)}\` coins\n▸  **New Balance** — \`${fmt(u.balance + amount)}\` coins\n${HR}\nCome back in **24 hours** for your next reward!`
  ).setThumbnail(interaction.user.displayAvatarURL())] });
}

// ── /weekly ───────────────────────────────────────────────────────────────────
export const weeklyData = new SlashCommandBuilder()
  .setName("weekly")
  .setDescription("Claim your weekly coin reward.");

export async function executeWeekly(interaction: ChatInputCommandInteraction): Promise<void> {
  const u   = await getUser(interaction.user.id);
  const { ok, remaining } = cd(u.lastWeekly, 7 * 24 * 3600 * 1000);
  if (!ok) { await interaction.editReply({ content: `⏳ Weekly already claimed. Try again in **${remaining}**.` }); return; }
  const amount = 1000 + Math.floor(Math.random() * 2001);
  await addBalance(interaction.user.id, amount);
  await setUser(interaction.user.id, { lastWeekly: Date.now() });
  await interaction.editReply({ embeds: [ecoEmbed(0xf59e0b, "🎁  WEEKLY REWARD CLAIMED",
    `${HR}\n▸  **Earned** — \`+${fmt(amount)}\` coins\n▸  **New Balance** — \`${fmt(u.balance + amount)}\` coins\n${HR}\nCome back in **7 days** for your next reward!`
  ).setThumbnail(interaction.user.displayAvatarURL())] });
}

// ── /work ─────────────────────────────────────────────────────────────────────
export const workData = new SlashCommandBuilder()
  .setName("work")
  .setDescription("Work a job to earn coins.");

export async function executeWork(interaction: ChatInputCommandInteraction): Promise<void> {
  const u   = await getUser(interaction.user.id);
  const { ok, remaining } = cd(u.lastWork, 60 * 60 * 1000);
  if (!ok) { await interaction.editReply({ content: `⏳ You're tired. Work again in **${remaining}**.` }); return; }
  const [jobDesc, [min, max]] = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
  const amount = min + Math.floor(Math.random() * (max - min + 1));
  await addBalance(interaction.user.id, amount);
  await setUser(interaction.user.id, { lastWork: Date.now() });
  await interaction.editReply({ embeds: [ecoEmbed(0x3b82f6, "💼  WORK COMPLETE",
    `${HR}\n<@${interaction.user.id}> ${jobDesc} and earned **${fmt(amount)} coins**!\n▸  **New Balance** — \`${fmt(u.balance + amount)}\` coins\n${HR}\nWork again in **1 hour**.`
  )] });
}

// ── /shop ─────────────────────────────────────────────────────────────────────
export const shopData = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Browse the coin shop.");

export async function executeShop(interaction: ChatInputCommandInteraction): Promise<void> {
  const lines = SHOP_ITEMS.map((item, i) =>
    `**${i + 1}.** ${item.name}\n   \`${fmt(item.price)} coins\` — ${item.desc}`
  ).join("\n\n");
  await interaction.editReply({ embeds: [ecoEmbed(0x8b5cf6, "🏪  COIN SHOP",
    `${HR}\n${lines}\n${HR}\nUse \`/buy item_id:<id>\` to purchase.`
  )] });
}

// ── /buy ──────────────────────────────────────────────────────────────────────
export const buyData = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("Purchase an item from the shop.")
  .addStringOption((o) => o.setName("item").setDescription("Item ID (use /shop to browse)").setRequired(true)
    .addChoices(...SHOP_ITEMS.map((i) => ({ name: i.name, value: i.id }))));

export async function executeBuy(interaction: ChatInputCommandInteraction): Promise<void> {
  const itemId = interaction.options.getString("item", true);
  const item   = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) { await interaction.editReply({ content: "❌ Item not found." }); return; }
  const u = await getUser(interaction.user.id);
  if (u.balance < item.price) {
    await interaction.editReply({ content: `❌ Not enough coins. You need **${fmt(item.price - u.balance)}** more.` });
    return;
  }
  await addBalance(interaction.user.id, -item.price);
  const inv = [...u.inventory];
  const existing = inv.find((i) => i.name === item.name);
  if (existing) existing.qty++;
  else inv.push({ name: item.name, qty: 1, price: item.price });
  await setUser(interaction.user.id, { inventory: inv });
  await interaction.editReply({ embeds: [ecoEmbed(0x2ecc71, "✅  ITEM PURCHASED",
    `${HR}\n▸  **Item** — ${item.name}\n▸  **Cost** — \`${fmt(item.price)} coins\`\n▸  **Balance** — \`${fmt(u.balance - item.price)} coins\`\n${HR}`
  )] });
}

// ── /transfer ─────────────────────────────────────────────────────────────────
export const transferData = new SlashCommandBuilder()
  .setName("transfer")
  .setDescription("Send coins to another user.")
  .addUserOption((o) => o.setName("user").setDescription("Who to send to").setRequired(true))
  .addIntegerOption((o) => o.setName("amount").setDescription("Amount to send").setMinValue(1).setRequired(true));

export async function executeTransfer(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  if (target.id === interaction.user.id) { await interaction.editReply({ content: "❌ You can't send coins to yourself." }); return; }
  if (target.bot) { await interaction.editReply({ content: "❌ You can't send coins to a bot." }); return; }
  const sender = await getUser(interaction.user.id);
  if (sender.balance < amount) { await interaction.editReply({ content: `❌ Insufficient balance. You only have **${fmt(sender.balance)} coins**.` }); return; }
  await addBalance(interaction.user.id, -amount);
  await addBalance(target.id, amount);
  await interaction.editReply({ embeds: [ecoEmbed(0x2ecc71, "💸  TRANSFER SENT",
    `${HR}\n▸  **From** — <@${interaction.user.id}>\n▸  **To** — <@${target.id}>\n▸  **Amount** — \`${fmt(amount)} coins\`\n▸  **Your Balance** — \`${fmt(sender.balance - amount)} coins\`\n${HR}`
  )] });
}

// ── /rob ──────────────────────────────────────────────────────────────────────
export const robData = new SlashCommandBuilder()
  .setName("rob")
  .setDescription("Attempt to rob another user's wallet.")
  .addUserOption((o) => o.setName("user").setDescription("Who to rob").setRequired(true));

export async function executeRob(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  if (target.id === interaction.user.id) { await interaction.editReply({ content: "❌ You can't rob yourself." }); return; }
  if (target.bot) { await interaction.editReply({ content: "❌ Bots are un-robbable." }); return; }
  const u = await getUser(interaction.user.id);
  const { ok, remaining } = cd(u.lastRob, 2 * 3600 * 1000);
  if (!ok) { await interaction.editReply({ content: `⏳ You're laying low. Rob again in **${remaining}**.` }); return; }
  await setUser(interaction.user.id, { lastRob: Date.now() });
  const victim = await getUser(target.id);
  if (victim.balance < 50) { await interaction.editReply({ content: `❌ <@${target.id}> is too broke to rob (less than 50 coins).` }); return; }
  const success = Math.random() < 0.5;
  if (success) {
    const stolen = Math.min(victim.balance, Math.floor(50 + Math.random() * Math.min(victim.balance * 0.4, 500)));
    await addBalance(target.id, -stolen);
    await addBalance(interaction.user.id, stolen);
    await interaction.editReply({ embeds: [ecoEmbed(0xe74c3c, "🔪  ROB SUCCESSFUL",
      `${HR}\n<@${interaction.user.id}> robbed <@${target.id}> and got away with **${fmt(stolen)} coins**!\n▸  **Your Balance** — \`${fmt(u.balance + stolen)} coins\`\n${HR}`
    )] });
  } else {
    const fine = Math.min(u.balance, Math.floor(30 + Math.random() * 120));
    await addBalance(interaction.user.id, -fine);
    await interaction.editReply({ embeds: [ecoEmbed(0x94a3b8, "🚔  CAUGHT!",
      `${HR}\n<@${interaction.user.id}> failed to rob <@${target.id}> and got fined **${fmt(fine)} coins**!\n▸  **Your Balance** — \`${fmt(u.balance - fine)} coins\`\n${HR}`
    )] });
  }
}

// ── /invest ───────────────────────────────────────────────────────────────────
export const investData = new SlashCommandBuilder()
  .setName("invest")
  .setDescription("Invest coins for a chance to multiply them (24h lockup).")
  .addIntegerOption((o) => o.setName("amount").setDescription("Amount to invest").setMinValue(100).setRequired(true));

export async function executeInvest(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount = interaction.options.getInteger("amount", true);
  const u      = await getUser(interaction.user.id);

  if (u.investAt > Date.now()) {
    const remaining = new Date(u.investAt).toLocaleString();
    await interaction.editReply({ content: `📈 Your investment of **${fmt(u.investAmount)} coins** is still active. Matures at ${remaining}.` });
    return;
  }

  if (u.investAmount > 0 && u.investAt > 0 && u.investAt <= Date.now()) {
    const outcomes: [number, number][] = [[0.4, 1.5], [0.25, 2.0], [0.2, 0.7], [0.1, 3.0], [0.05, 0.1]];
    let roll = Math.random(), mult = 1.0;
    for (const [chance, m] of outcomes) { if (roll < chance) { mult = m; break; } roll -= chance; }
    const returned = Math.floor(u.investAmount * mult);
    await addBalance(interaction.user.id, returned);
    await setUser(interaction.user.id, { investAmount: 0, investAt: 0 });
    await interaction.editReply({ content: `📈 Your investment matured! **${fmt(u.investAmount)} coins** → **${fmt(returned)} coins** (${mult}×).` });
    return;
  }

  if (u.balance < amount) { await interaction.editReply({ content: `❌ Insufficient balance.` }); return; }
  await addBalance(interaction.user.id, -amount);
  const matureAt = Date.now() + 24 * 3600 * 1000;
  await setUser(interaction.user.id, { investAmount: amount, investAt: matureAt });
  await interaction.editReply({ embeds: [ecoEmbed(0x3b82f6, "📈  INVESTMENT MADE",
    `${HR}\n▸  **Invested** — \`${fmt(amount)} coins\`\n▸  **Matures at** — <t:${Math.floor(matureAt / 1000)}:F>\n▸  **Possible return** — 0.1× to 3.0×\n${HR}\nRun \`/invest amount:1\` after maturity to collect.`
  )] });
}

// ── /crime ────────────────────────────────────────────────────────────────────
export const crimeData = new SlashCommandBuilder()
  .setName("crime")
  .setDescription("Commit a crime for a high-risk, high-reward payout.");

export async function executeCrime(interaction: ChatInputCommandInteraction): Promise<void> {
  const u = await getUser(interaction.user.id);
  const { ok, remaining } = cd(u.lastCrime, 90 * 60 * 1000);
  if (!ok) { await interaction.editReply({ content: `⏳ Lying low. Try again in **${remaining}**.` }); return; }
  await setUser(interaction.user.id, { lastCrime: Date.now() });
  const [desc, [min, max], chance] = CRIME_EVENTS[Math.floor(Math.random() * CRIME_EVENTS.length)];
  const success = Math.random() < chance;
  if (success) {
    const earned = min + Math.floor(Math.random() * (max - min + 1));
    await addBalance(interaction.user.id, earned);
    await interaction.editReply({ embeds: [ecoEmbed(0xe74c3c, "🦹  CRIME SUCCEEDED",
      `${HR}\n<@${interaction.user.id}> ${desc} and pocketed **${fmt(earned)} coins**!\n▸  **Balance** — \`${fmt(u.balance + earned)} coins\`\n${HR}`
    )] });
  } else {
    const fine = Math.min(u.balance, 50 + Math.floor(Math.random() * 200));
    await addBalance(interaction.user.id, -fine);
    await interaction.editReply({ embeds: [ecoEmbed(0x94a3b8, "🚓  CRIME FAILED",
      `${HR}\n<@${interaction.user.id}> tried to ${desc.split(" ").slice(1).join(" ")} but got caught!\nFined **${fmt(fine)} coins**.\n▸  **Balance** — \`${fmt(u.balance - fine)} coins\`\n${HR}`
    )] });
  }
}

// ── /inventory ────────────────────────────────────────────────────────────────
export const inventoryData = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("View your item inventory.")
  .addUserOption((o) => o.setName("user").setDescription("View another user's inventory").setRequired(false));

export async function executeInventory(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const u      = await getUser(target.id);
  const items  = u.inventory.filter((i) => i.qty > 0);
  const desc   = items.length === 0
    ? "Empty — use `/buy` to get items from the shop."
    : items.map((i) => `▸  ${i.name}  ×**${i.qty}**`).join("\n");
  await interaction.editReply({ embeds: [ecoEmbed(0x8b5cf6, `🎒  INVENTORY — ${target.username}`,
    `${HR}\n${desc}\n${HR}`
  ).setThumbnail(target.displayAvatarURL())] });
}

// ── /ecotop ───────────────────────────────────────────────────────────────────
export const ecoLeaderboardData = new SlashCommandBuilder()
  .setName("ecotop")
  .setDescription("Show the top richest users on the economy leaderboard.");

export async function executeEcoLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const top = await getTopUsers(10);
  if (top.length === 0) { await interaction.editReply({ content: "📭 No economy data yet." }); return; }
  const lines = await Promise.all(top.map(async ({ userId, balance }, i) => {
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
    return `${medal}  ${user ? user.username : `<@${userId}>`}  —  \`${fmt(balance)} coins\``;
  }));
  await interaction.editReply({ embeds: [ecoEmbed(0xf59e0b, `${COIN}  ECONOMY LEADERBOARD`, `${HR}\n${lines.join("\n")}\n${HR}`)] });
}
