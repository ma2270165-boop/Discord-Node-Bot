import { Message, EmbedBuilder } from "discord.js";

// Exclusion tags appended to every query — strictly straight only
const EXCL = "-yaoi -yuri -transgender -futanari -trap -crossdressing";

// ── Category map ───────────────────────────────────────────────────────────
const CATEGORIES = {
  neko:       {
    gelbooru: `animated cat_girl rating:explicit ${EXCL}`,
    rule34:   `animated neko rating:explicit ${EXCL}`,
  },
  hentai:     {
    gelbooru: `animated rating:explicit ${EXCL}`,
    rule34:   `animated hentai rating:explicit ${EXCL}`,
  },
  waifu:      {
    gelbooru: `animated 1girl rating:explicit ${EXCL}`,
    rule34:   `animated 1girl rating:explicit ${EXCL}`,
  },
  milf:       {
    gelbooru: `animated milf rating:explicit ${EXCL}`,
    rule34:   `animated milf rating:explicit ${EXCL}`,
  },
  ahegao:     {
    gelbooru: `animated ahegao rating:explicit ${EXCL}`,
    rule34:   `animated ahegao rating:explicit ${EXCL}`,
  },
  maid:       {
    gelbooru: `animated maid rating:explicit ${EXCL}`,
    rule34:   `animated maid rating:explicit ${EXCL}`,
  },
  elf:        {
    gelbooru: `animated elf rating:explicit ${EXCL}`,
    rule34:   `animated elf rating:explicit ${EXCL}`,
  },
  schoolgirl: {
    gelbooru: `animated school_uniform rating:explicit ${EXCL}`,
    rule34:   `animated school_uniform rating:explicit ${EXCL}`,
  },
  gangbang:   {
    gelbooru: `animated gangbang rating:explicit ${EXCL}`,
    rule34:   `animated gangbang rating:explicit ${EXCL}`,
  },
  creampie:   {
    gelbooru: `animated creampie rating:explicit ${EXCL}`,
    rule34:   `animated creampie rating:explicit ${EXCL}`,
  },
  random:     {
    gelbooru: `animated rating:explicit ${EXCL}`,
    rule34:   `animated rating:explicit ${EXCL}`,
  },
} as const;

type Category = keyof typeof CATEGORIES;
const VALID_CATS = Object.keys(CATEGORIES) as Category[];

const IMAGE_EXTS  = [".gif", ".png", ".jpg", ".jpeg", ".webp"];
const VIDEO_EXTS  = [".mp4", ".webm"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isImage(url: string): boolean { return IMAGE_EXTS.some((e) => url.toLowerCase().includes(e)); }
function isVideo(url: string): boolean { return VIDEO_EXTS.some((e) => url.toLowerCase().endsWith(e)); }

// ── Gelbooru ───────────────────────────────────────────────────────────────
async function fromGelbooru(tags: string, wantVideo: boolean): Promise<string | null> {
  try {
    const pid = Math.floor(Math.random() * 40);
    const res = await fetch(
      `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pid}&tags=${encodeURIComponent(tags)}`,
      { headers: { "User-Agent": "DiscordBot/1.0" }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { post?: Array<{ file_url?: string }> };
    const posts = (data.post ?? []).filter((p) => !!p.file_url);
    const filtered = wantVideo
      ? posts.filter((p) => isVideo(p.file_url!))
      : posts.filter((p) => isImage(p.file_url!));
    const pool = filtered.length > 0 ? filtered : posts;
    if (pool.length === 0) return null;
    return pick(pool).file_url ?? null;
  } catch { return null; }
}

// ── Rule34.xxx ─────────────────────────────────────────────────────────────
async function fromRule34(tags: string, wantVideo: boolean): Promise<string | null> {
  try {
    const pid = Math.floor(Math.random() * 60);
    const res = await fetch(
      `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=50&pid=${pid}&tags=${encodeURIComponent(tags)}`,
      { headers: { "User-Agent": "DiscordBot/1.0" }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as Array<{ file_url?: string }> | null;
    if (!Array.isArray(data) || data.length === 0) return null;
    const posts = data.filter((p) => !!p.file_url);
    const filtered = wantVideo
      ? posts.filter((p) => isVideo(p.file_url!))
      : posts.filter((p) => isImage(p.file_url!));
    const pool = filtered.length > 0 ? filtered : posts;
    if (pool.length === 0) return null;
    return pick(pool).file_url ?? null;
  } catch { return null; }
}

// ── waifu.im fallback (images only) ───────────────────────────────────────
const WAIFUIM_TAGS: Partial<Record<Category, string>> = {
  hentai: "hentai", waifu: "ero", milf: "milf", random: "hentai",
};

async function fromWaifuIm(tag: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.waifu.im/search/?included_tags=${tag}&is_nsfw=true`,
      { headers: { "User-Agent": "DiscordBot/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { images?: Array<{ url?: string }> };
    const imgs = data.images ?? [];
    if (imgs.length === 0) return null;
    return pick(imgs).url ?? null;
  } catch { return null; }
}

// ── Race: first source to return a URL wins ────────────────────────────────
function raceToFirst(fns: Array<() => Promise<string | null>>): Promise<string | null> {
  return new Promise((resolve) => {
    if (fns.length === 0) { resolve(null); return; }
    let remaining = fns.length;
    for (const fn of fns) {
      fn()
        .then((url) => { if (url) { resolve(url); } else if (--remaining === 0) { resolve(null); } })
        .catch(() => { if (--remaining === 0) resolve(null); });
    }
  });
}

async function fetchNsfwUrl(category: Category, wantVideo: boolean): Promise<string | null> {
  const map = CATEGORIES[category];
  const fns: Array<() => Promise<string | null>> = [
    () => fromGelbooru(map.gelbooru, wantVideo),
    () => fromRule34(map.rule34, wantVideo),
  ];
  // waifu.im images-only fallback
  if (!wantVideo) {
    const tag = WAIFUIM_TAGS[category];
    if (tag) fns.push(() => fromWaifuIm(tag));
  }

  const url = await raceToFirst(fns);
  if (url) return url;
  return raceToFirst(fns); // one retry
}

// ── Help embed ────────────────────────────────────────────────────────────

const HELP_EMBED = new EmbedBuilder()
  .setColor(0xff0055)
  .setTitle("🔞 NSFW Command Help")
  .addFields(
    {
      name: "Image Usage",
      value: [
        "`?nsfw` — random image",
        "`?nsfw <category>` — category image",
      ].join("\n"),
    },
    {
      name: "Video Usage",
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
  .setFooter({ text: "?nfsw also works as an alias • Strictly straight content only" });

// ── Command handler ────────────────────────────────────────────────────────

export async function handleNsfwCommand(message: Message): Promise<void> {
  const parts = message.content.trim().split(/\s+/);
  const arg1  = parts[1]?.toLowerCase();
  const arg2  = parts[2]?.toLowerCase();

  // Help
  if (arg1 === "help") {
    await message.reply({ embeds: [HELP_EMBED] });
    return;
  }

  // Determine wantVideo + category
  let wantVideo = false;
  let category: Category;

  if (!arg1) {
    // ?nsfw → random image
    const pickable = VALID_CATS.filter((c) => c !== "random");
    category = pick(pickable);
  } else if (arg1 === "video") {
    // ?nsfw video → random video
    wantVideo = true;
    const pickable = VALID_CATS.filter((c) => c !== "random");
    category = pick(pickable);
  } else if ((VALID_CATS as string[]).includes(arg1)) {
    // ?nsfw <cat> [video]
    category  = arg1 as Category;
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
    await message.reply("❌ All image sources are currently down. Try again shortly.");
    return;
  }

  if (wantVideo) {
    // Send video URL as plain content so Discord auto-embeds the player
    await message.reply({
      content: `🔞 **${category}** — ${url}`,
      embeds: [],
    });
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
