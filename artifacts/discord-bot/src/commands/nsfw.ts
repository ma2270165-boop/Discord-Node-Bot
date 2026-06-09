import { Message, EmbedBuilder } from "discord.js";

// ── Source definitions ─────────────────────────────────────────────────────
// Each fetcher returns a URL string or null. They are tried in order until one succeeds.

async function fromPurrbot(): Promise<string | null> {
  const CATS = ["neko", "hentai", "solo", "yuri", "blowjob", "anal"] as const;
  const cat  = CATS[Math.floor(Math.random() * CATS.length)];
  try {
    const res = await fetch(`https://api.purrbot.site/v2/img/nsfw/${cat}/gif`, {
      headers: { "User-Agent": "LS-Bot/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { link?: string; error?: boolean };
    if (data.error || !data.link) return null;
    return data.link;
  } catch { return null; }
}

async function fromWaifuPics(): Promise<string | null> {
  const CATS = ["waifu", "neko", "blowjob", "anal", "hentai"] as const;
  const cat  = CATS[Math.floor(Math.random() * CATS.length)];
  try {
    const res = await fetch(`https://api.waifu.pics/nsfw/${cat}`, {
      headers: { "User-Agent": "LS-Bot/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch { return null; }
}

async function fromNekosLife(): Promise<string | null> {
  const CATS = ["lewd", "hentai", "les_hentai", "blowjob", "random_hentai_gif"] as const;
  const cat  = CATS[Math.floor(Math.random() * CATS.length)];
  try {
    const res = await fetch(`https://nekos.life/api/v2/img/${cat}`, {
      headers: { "User-Agent": "LS-Bot/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch { return null; }
}

// Try each source in order, return the first URL that works
async function fetchNsfwUrl(): Promise<string | null> {
  const sources = [fromPurrbot, fromWaifuPics, fromNekosLife];
  // Shuffle so load is spread across sources over time
  sources.sort(() => Math.random() - 0.5);
  for (const source of sources) {
    const url = await source();
    if (url) return url;
  }
  return null;
}

// ── Command handler ────────────────────────────────────────────────────────
export async function handleNsfwCommand(message: Message): Promise<void> {
  const url = await fetchNsfwUrl();

  if (!url) {
    await message.reply("❌ All image sources are currently unavailable. Try again in a moment.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff0055)
    .setImage(url)
    .setFooter({ text: "🔞" });

  await message.reply({ embeds: [embed] });
}
