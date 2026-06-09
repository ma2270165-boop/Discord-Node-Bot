import { Message, EmbedBuilder } from "discord.js";

// Exclusion tags appended to every query — strictly straight only
const EXCL = "-yaoi -yuri -transgender -futanari -trap -crossdressing";

// ── Category map (xbooru tags) ─────────────────────────────────────────────
const CATEGORIES = {
  neko:       `animated cat_girl rating:explicit ${EXCL}`,
  hentai:     `animated rating:explicit ${EXCL}`,
  waifu:      `animated 1girl rating:explicit ${EXCL}`,
  milf:       `animated milf rating:explicit ${EXCL}`,
  ahegao:     `animated ahegao rating:explicit ${EXCL}`,
  maid:       `animated maid rating:explicit ${EXCL}`,
  elf:        `animated elf rating:explicit ${EXCL}`,
  schoolgirl: `animated school_uniform rating:explicit ${EXCL}`,
  gangbang:   `animated gangbang rating:explicit ${EXCL}`,
  creampie:   `animated creampie rating:explicit ${EXCL}`,
  random:     `animated rating:explicit ${EXCL}`,
} as const;

type Category = keyof typeof CATEGORIES;
const VALID_CATS = Object.keys(CATEGORIES) as Category[];

const VIDEO_EXTS = [".mp4", ".webm"];
const IMAGE_EXTS = [".gif", ".png", ".jpg", ".jpeg", ".webp"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function isVideo(url: string) { return VIDEO_EXTS.some((e) => url.toLowerCase().endsWith(e)); }
function isImage(url: string) { return IMAGE_EXTS.some((e) => url.toLowerCase().endsWith(e)); }

// ── Shared booru response types ────────────────────────────────────────────
type BooruPost = { file_url?: string };
type BooruThibPost = { directory?: number; image?: string };

function selectUrl(posts: BooruPost[], wantVideo: boolean): string | null {
  const typed = wantVideo
    ? posts.filter((p) => p.file_url && isVideo(p.file_url))
    : posts.filter((p) => p.file_url && isImage(p.file_url));
  const pool = typed.length > 0 ? typed : posts.filter((p) => p.file_url);
  if (pool.length === 0) return null;
  return pick(pool).file_url ?? null;
}

// ── xbooru — confirmed HTTP 200 from server IPs ───────────────────────────
async function fromXbooru(tags: string, wantVideo: boolean): Promise<string | null> {
  try {
    const pid = Math.floor(Math.random() * 150);
    const res = await fetch(
      `https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pid}&tags=${encodeURIComponent(tags)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as BooruPost[] | { post?: BooruPost[] };
    const posts = Array.isArray(data) ? data : (data.post ?? []);
    return selectUrl(posts, wantVideo);
  } catch { return null; }
}

// ── tbib — confirmed HTTP 200, URL = img.tbib.org/images/{dir}/{img} ──────
async function fromTbib(tags: string, wantVideo: boolean): Promise<string | null> {
  try {
    const pid = Math.floor(Math.random() * 150);
    const res = await fetch(
      `https://tbib.org/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pid}&tags=${encodeURIComponent(tags)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const raw = await res.json() as BooruThibPost[] | { post?: BooruThibPost[] };
    const items = Array.isArray(raw) ? raw : (raw.post ?? []);
    // Build file_url from directory + image fields
    const posts: BooruPost[] = items
      .filter((p) => p.directory != null && p.image)
      .map((p) => ({ file_url: `https://img.tbib.org/images/${p.directory}/${p.image}` }));
    return selectUrl(posts, wantVideo);
  } catch { return null; }
}

// ── hypnohub — confirmed HTTP 200, uses file_url ──────────────────────────
async function fromHypnohub(tags: string, wantVideo: boolean): Promise<string | null> {
  try {
    const pid = Math.floor(Math.random() * 100);
    const res = await fetch(
      `https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pid}&tags=${encodeURIComponent(tags)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as BooruPost[] | { post?: BooruPost[] };
    const posts = Array.isArray(data) ? data : (data.post ?? []);
    return selectUrl(posts, wantVideo);
  } catch { return null; }
}

// ── Race all 3 sources — first URL wins ───────────────────────────────────
function raceToFirst(fns: Array<() => Promise<string | null>>): Promise<string | null> {
  return new Promise((resolve) => {
    let remaining = fns.length;
    let done = false;
    for (const fn of fns) {
      fn().then((url) => {
        if (url && !done) { done = true; resolve(url); }
        else if (--remaining === 0 && !done) resolve(null);
      }).catch(() => { if (--remaining === 0 && !done) resolve(null); });
    }
  });
}

async function fetchNsfwUrl(category: Category, wantVideo: boolean): Promise<string | null> {
  const tags = CATEGORIES[category];
  const fns = [
    () => fromXbooru(tags, wantVideo),
    () => fromTbib(tags, wantVideo),
    () => fromHypnohub(tags, wantVideo),
  ];
  const url = await raceToFirst(fns);
  if (url) return url;
  // One full retry
  return raceToFirst(fns);
}

// ── Help embed ────────────────────────────────────────────────────────────

const HELP_EMBED = new EmbedBuilder()
  .setColor(0xff0055)
  .setTitle("🔞 NSFW Command Help")
  .addFields(
    {
      name: "Images",
      value: [
        "`?nsfw` — random image",
        "`?nsfw <category>` — category image",
      ].join("\n"),
    },
    {
      name: "Videos",
      value: [
        "`?nsfw video` — random video",
        "`?nsfw <category> video` — category video",
      ].join("\n"),
    },
    {
      name: "Categories",
      value: VALID_CATS.map((c) => `\`${c}\``).join(" · "),
    },
  )
  .setFooter({ text: "?nfsw also works • Strictly straight content only" });

// ── Command handler ────────────────────────────────────────────────────────

export async function handleNsfwCommand(message: Message): Promise<void> {
  const parts = message.content.trim().split(/\s+/);
  const arg1 = parts[1]?.toLowerCase();
  const arg2 = parts[2]?.toLowerCase();

  if (arg1 === "help") {
    await message.reply({ embeds: [HELP_EMBED] });
    return;
  }

  let wantVideo = false;
  let category: Category;

  if (!arg1) {
    // ?nsfw → random image
    category = pick(VALID_CATS.filter((c) => c !== "random"));
  } else if (arg1 === "video") {
    // ?nsfw video → random video
    wantVideo = true;
    category = pick(VALID_CATS.filter((c) => c !== "random"));
  } else if ((VALID_CATS as string[]).includes(arg1)) {
    // ?nsfw <cat> [video]
    category = arg1 as Category;
    wantVideo = arg2 === "video";
  } else {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("❌ Unknown category")
          .setDescription(
            `**Valid:** ${VALID_CATS.map((c) => `\`${c}\``).join(" · ")}\n` +
            `Use \`?nsfw help\` for full usage info.`,
          ),
      ],
    });
    return;
  }

  const url = await fetchNsfwUrl(category, wantVideo);

  if (!url) {
    await message.reply("❌ Couldn't fetch right now. Try again in a moment.");
    return;
  }

  if (wantVideo) {
    await message.reply({ content: `🔞 **${category}** — ${url}` });
  } else {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0055)
          .setImage(url)
          .setFooter({ text: `🔞 ${category}` }),
      ],
    });
  }
}
