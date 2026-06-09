import { Message, EmbedBuilder } from "discord.js";

// ── Category map ───────────────────────────────────────────────────────────
// User-facing name → per-source API category (null = source doesn't support it)
const CATEGORIES = {
  neko:    { purrbot: "neko",    waifupics: "neko",    nekoslife: "lewd"              },
  hentai:  { purrbot: "hentai",  waifupics: "hentai",  nekoslife: "hentai"            },
  blowjob: { purrbot: "blowjob", waifupics: "blowjob", nekoslife: "blowjob"           },
  anal:    { purrbot: "anal",    waifupics: "anal",    nekoslife: null                },
  solo:    { purrbot: "solo",    waifupics: null,      nekoslife: null                },
  waifu:   { purrbot: null,      waifupics: "waifu",   nekoslife: null                },
  random:  { purrbot: null,      waifupics: null,      nekoslife: "random_hentai_gif" },
} as const;

type Category = keyof typeof CATEGORIES;
const VALID_CATS = Object.keys(CATEGORIES) as Category[];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Per-source fetchers ────────────────────────────────────────────────────

async function fromPurrbot(cat: string): Promise<string | null> {
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

async function fromWaifuPics(cat: string): Promise<string | null> {
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

async function fromNekosLife(cat: string): Promise<string | null> {
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

// ── Fetch with category-aware fallback chain ───────────────────────────────

async function fetchNsfwUrl(category: Category): Promise<string | null> {
  const map = CATEGORIES[category];

  // Build list of [fetcher, apiCat] pairs that support this category, then shuffle
  const sources: Array<() => Promise<string | null>> = [];
  if (map.purrbot)   sources.push(() => fromPurrbot(map.purrbot!));
  if (map.waifupics) sources.push(() => fromWaifuPics(map.waifupics!));
  if (map.nekoslife) sources.push(() => fromNekosLife(map.nekoslife!));
  sources.sort(() => Math.random() - 0.5);

  for (const fn of sources) {
    const url = await fn();
    if (url) return url;
  }
  return null;
}

// ── Command handler ────────────────────────────────────────────────────────

export async function handleNsfwCommand(message: Message): Promise<void> {
  const parts = message.content.trim().split(/\s+/);
  const input = parts[1]?.toLowerCase();

  // Validate category if provided
  let category: Category;
  if (!input) {
    // No category — pick a random one (excluding "random" meta-entry)
    const pickable = VALID_CATS.filter((c) => c !== "random");
    category = pick(pickable);
  } else if ((VALID_CATS as string[]).includes(input)) {
    category = input as Category;
  } else {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("❌ Unknown category")
          .setDescription(
            `**Valid categories:** ${VALID_CATS.map((c) => `\`${c}\``).join(" · ")}\n\n` +
            `**Usage:** \`?nsfw\` — random · \`?nsfw <category>\` — specific`,
          ),
      ],
    });
    return;
  }

  const url = await fetchNsfwUrl(category);

  if (!url) {
    await message.reply("❌ Couldn't fetch a gif right now. Try again in a moment.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff0055)
    .setImage(url)
    .setFooter({ text: `🔞 ${category}` });

  await message.reply({ embeds: [embed] });
}
