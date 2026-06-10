import { Message, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits, GuildMember } from "discord.js";
import { getPool } from "../persistence.js";

// Exclusion tags — strictly straight, 2D anime, no furry, no weird/extreme content
const EXCL =
  "-yaoi -yuri -transgender -futanari -trap -crossdressing " +
  "-furry -anthro -kemono " +
  "-tentacles -tentacle -monster -alien -creature -insect -bug -plant -slime -beast -dragon " +
  "-rape -non-consensual -forced " +
  "-guro -scat -vore -ryona -inflation -gore -blood -death -torture -necrophilia " +
  "-3d -3dcg -realistic -photorealistic -live_action -real_person";

// ── Category map ──────────────────────────────────────────────────────────
// booru:    xbooru / tbib / rule34.xxx tag string
// moebooru: konachan / yande.re tag string (rating:e, simpler vocab, image-only)
// redgifs:  search query string

// Moebooru exclusions — these sites use a different (smaller) tag vocab
const EXCL_MB =
  "-yaoi -yuri -futanari -trap -crossdressing " +
  "-furry -anthro " +
  "-guro -scat -vore -gore -ryona";

const CATEGORIES = {
  neko:       { booru: `animated hentai cat_girl rating:explicit ${EXCL}`,        moebooru: `cat_girl rating:e ${EXCL_MB}`,          redgifs: "anime neko hentai"        },
  hentai:     { booru: `animated hentai rating:explicit ${EXCL}`,                 moebooru: `sex rating:e ${EXCL_MB}`,               redgifs: "anime hentai 2d"          },
  waifu:      { booru: `animated hentai 1girl rating:explicit ${EXCL}`,           moebooru: `1girl rating:e ${EXCL_MB}`,             redgifs: "anime waifu hentai"       },
  milf:       { booru: `animated hentai milf rating:explicit ${EXCL}`,            moebooru: `milf rating:e ${EXCL_MB}`,              redgifs: "anime milf hentai"        },
  ahegao:     { booru: `animated hentai ahegao rating:explicit ${EXCL}`,          moebooru: `ahegao rating:e ${EXCL_MB}`,            redgifs: "ahegao anime hentai"      },
  maid:       { booru: `animated hentai maid rating:explicit ${EXCL}`,            moebooru: `maid rating:e ${EXCL_MB}`,              redgifs: "anime maid hentai"        },
  elf:        { booru: `animated hentai elf rating:explicit ${EXCL}`,             moebooru: `elf_ears rating:e ${EXCL_MB}`,          redgifs: "anime elf hentai"         },
  schoolgirl: { booru: `animated hentai school_uniform rating:explicit ${EXCL}`,  moebooru: `school_uniform rating:e ${EXCL_MB}`,    redgifs: "anime schoolgirl hentai"  },
  gangbang:   { booru: `animated hentai gangbang rating:explicit ${EXCL}`,        moebooru: `gangbang rating:e ${EXCL_MB}`,          redgifs: "anime gangbang hentai"    },
  creampie:   { booru: `animated hentai creampie rating:explicit ${EXCL}`,        moebooru: `creampie rating:e ${EXCL_MB}`,          redgifs: "anime creampie hentai"    },
  random:     { booru: `animated hentai rating:explicit ${EXCL}`,                 moebooru: `rating:e ${EXCL_MB}`,                   redgifs: "anime hentai"             },
} as const;

type Category = keyof typeof CATEGORIES;
const VALID_CATS = Object.keys(CATEGORIES) as Category[];

const VIDEO_EXTS = [".mp4", ".webm"];
const IMAGE_EXTS = [".gif", ".png", ".jpg", ".jpeg", ".webp"];

// ── Seen-URL deduplication ─────────────────────────────────────────────────
// Tracks the last 300 URLs returned across all categories so repeats are avoided.
// Uses a Set for O(1) lookup + a queue for eviction order.
const SEEN_MAX = 300;
const seenSet   = new Set<string>();
const seenQueue: string[] = [];

function markSeen(url: string): void {
  if (seenSet.has(url)) return;
  seenSet.add(url);
  seenQueue.push(url);
  if (seenQueue.length > SEEN_MAX) {
    const evicted = seenQueue.shift()!;
    seenSet.delete(evicted);
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function isVideo(url: string) { return VIDEO_EXTS.some((e) => url.toLowerCase().endsWith(e)); }
function isImage(url: string) { return IMAGE_EXTS.some((e) => url.toLowerCase().endsWith(e)); }

// ── Shared booru response types ────────────────────────────────────────────
type BooruPost = { file_url?: string };
type BooruThibPost = { directory?: number; image?: string };

function selectUrl(posts: BooruPost[], wantVideo: boolean): string | null {
  // Strictly filter by wanted type — never mix; a video URL in setImage() = blank embed
  const valid = posts.filter((p) =>
    p.file_url && (wantVideo ? isVideo(p.file_url) : isImage(p.file_url)),
  );
  if (valid.length === 0) return null;
  // Prefer URLs not yet seen — fall back to any valid if all have been shown
  const unseen = valid.filter((p) => !seenSet.has(p.file_url!));
  const pool = unseen.length > 0 ? unseen : valid;
  return pick(pool).file_url ?? null;
}

// ── Generic booru fetcher (shared logic) ──────────────────────────────────
async function fetchBooru(
  baseUrl: string,
  tags: string,
  wantVideo: boolean,
  maxPid: number,
  buildUrl?: (item: BooruThibPost) => string,
): Promise<string | null> {
  // Try a random page first; on empty result fall back to page 0 (always has data)
  for (const pid of [Math.floor(Math.random() * maxPid), 0]) {
    try {
      const res = await fetch(
        `${baseUrl}&limit=50&pid=${pid}&tags=${encodeURIComponent(tags)}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" }, signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return null;

      let posts: BooruPost[];
      if (buildUrl) {
        // tbib: directory + image fields
        const raw = await res.json() as BooruThibPost[] | { post?: BooruThibPost[] };
        const items = Array.isArray(raw) ? raw : (raw.post ?? []);
        posts = items
          .filter((p) => p.directory != null && p.image)
          .map((p) => ({ file_url: buildUrl(p) }));
      } else {
        const data = await res.json() as BooruPost[] | { post?: BooruPost[] };
        posts = Array.isArray(data) ? data : (data.post ?? []);
      }

      const url = selectUrl(posts, wantVideo);
      if (url) return url;
      // no results on this page → loop to pid 0 fallback
    } catch { return null; }
  }
  return null;
}

// ── xbooru — confirmed HTTP 200 from server IPs ───────────────────────────
function fromXbooru(tags: string, wantVideo: boolean): Promise<string | null> {
  return fetchBooru(
    "https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1",
    tags, wantVideo, 30,
  );
}

// ── tbib — confirmed HTTP 200, URL = img.tbib.org/images/{dir}/{img} ──────
function fromTbib(tags: string, wantVideo: boolean): Promise<string | null> {
  return fetchBooru(
    "https://tbib.org/index.php?page=dapi&s=post&q=index&json=1",
    tags, wantVideo, 30,
    (p) => `https://img.tbib.org/images/${p.directory}/${p.image}`,
  );
}

// ── rule34.xxx — separate site from paheal, free JSON API ─────────────────
function fromRule34xxx(tags: string, wantVideo: boolean): Promise<string | null> {
  return fetchBooru(
    "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1",
    tags, wantVideo, 200, // rule34 has a much deeper library — wider page window
  );
}

// ── Moebooru fetcher — shared by konachan + yande.re (image-only) ─────────
async function fetchMoebooru(
  baseUrl: string,
  tags: string,
  wantVideo: boolean,
): Promise<string | null> {
  if (wantVideo) return null; // konachan/yande.re are image-only
  for (const page of [Math.floor(Math.random() * 20) + 1, 1]) {
    try {
      const res = await fetch(
        `${baseUrl}?limit=50&page=${page}&tags=${encodeURIComponent(tags)}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" }, signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return null;
      const posts = await res.json() as BooruPost[];
      if (!Array.isArray(posts)) return null;
      const url = selectUrl(posts, false);
      if (url) return url;
    } catch { return null; }
  }
  return null;
}

function fromKonachan(tags: string, wantVideo: boolean): Promise<string | null> {
  return fetchMoebooru("https://konachan.com/post.json", tags, wantVideo);
}

function fromYandere(tags: string, wantVideo: boolean): Promise<string | null> {
  return fetchMoebooru("https://yande.re/post.json", tags, wantVideo);
}


// ── Redgifs — guest token (auto-fetched, no registration needed) ───────────
let redgifsToken: string | null = null;
let redgifsTokenExpiry = 0;

async function getRedgifsToken(): Promise<string | null> {
  if (redgifsToken && Date.now() < redgifsTokenExpiry) return redgifsToken;
  try {
    const res = await fetch("https://api.redgifs.com/v2/auth/temporary", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    if (!data.token) return null;
    redgifsToken = data.token;
    redgifsTokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 h
    return redgifsToken;
  } catch { return null; }
}

async function fromRedgifs(query: string, wantVideo: boolean): Promise<string | null> {
  try {
    const token = await getRedgifsToken();
    if (!token) return null;
    const start = Math.floor(Math.random() * 200); // randomise result page
    const res = await fetch(
      `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(query)}&order=trending&count=80&start=${start}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 401) { redgifsToken = null; return null; } // token expired — reset
    if (!res.ok) return null;
    const data = await res.json() as { gifs?: Array<{ urls?: { hd?: string; sd?: string } }> };
    const gifs = data.gifs ?? [];
    if (gifs.length === 0) return null;
    const gif = pick(gifs);
    const url = gif.urls?.hd ?? gif.urls?.sd ?? null;
    if (!url) return null;
    // Redgifs always returns mp4 — only use if wantVideo or caller doesn't mind
    if (!wantVideo && !isImage(url)) return null;
    return url;
  } catch { return null; }
}

// ── Race all 4 sources — first URL wins ───────────────────────────────────
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

// Build source list depending on image vs video mode.
// Video mode: Redgifs only — it's a dedicated video platform with reliable anime hentai MP4s.
//   Three parallel queries (different random offsets) for better variety.
// Image mode: all 6 booru/image sources.
function buildFns(
  booruTags: string,
  mbTags: string,
  rgQuery: string,
  wantVideo: boolean,
): Array<() => Promise<string | null>> {
  if (wantVideo) {
    return [
      () => fromRedgifs(rgQuery, true),
      () => fromRedgifs(`${rgQuery} animated`, true),
      () => fromRedgifs(`hentai ${rgQuery}`, true),
    ];
  }
  return [
    () => fromXbooru(booruTags, false),
    () => fromTbib(booruTags, false),
    () => fromRule34xxx(booruTags, false),
    () => fromKonachan(mbTags, false),
    () => fromYandere(mbTags, false),
    () => fromRedgifs(rgQuery, false),
  ];
}

async function fetchNsfwUrl(category: Category, wantVideo: boolean): Promise<string | null> {
  const map = CATEGORIES[category];
  const fns = buildFns(map.booru, map.moebooru, map.redgifs, wantVideo);
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = await raceToFirst(fns);
    if (!url) continue;
    if (!seenSet.has(url)) { markSeen(url); return url; }
  }
  return null;
}

// ── Freeform search — any term the user types ─────────────────────────────
async function fetchFreeformUrl(term: string, wantVideo: boolean): Promise<string | null> {
  const booruTerm = term.replace(/\s+/g, "_");
  const booruTags = `${booruTerm} rating:explicit ${EXCL}`;
  const mbTags    = `${booruTerm} rating:e ${EXCL_MB}`;
  const rgQuery   = `anime ${term} hentai`;

  const fns = buildFns(booruTags, mbTags, rgQuery, wantVideo);
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = await raceToFirst(fns);
    if (!url) continue;
    if (!seenSet.has(url)) { markSeen(url); return url; }
  }
  return null;
}

// ── Per-guild NSFW toggle (stored in bot_kv) ──────────────────────────────
// Default: enabled (true). Key: nsfw:<guildId>, value: {"enabled": bool}

async function getNsfwEnabled(guildId: string): Promise<boolean> {
  try {
    const res = await getPool().query<{ value: { enabled: boolean } }>(
      "SELECT value FROM bot_kv WHERE key = $1",
      [`nsfw:${guildId}`],
    );
    if (res.rows.length === 0) return true; // default on
    return res.rows[0].value?.enabled !== false;
  } catch { return true; }
}

async function setNsfwEnabled(guildId: string, enabled: boolean): Promise<void> {
  await getPool().query(
    `INSERT INTO bot_kv (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [`nsfw:${guildId}`, JSON.stringify({ enabled })],
  );
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

  const guildId = message.guildId;
  const member = message.member as GuildMember | null;
  const isAdmin = member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;

  // ── ?nsfw on / ?nsfw off — admin only ─────────────────────────────────
  if (arg1 === "on" || arg1 === "off") {
    if (!isAdmin) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setDescription("❌ You need **Manage Server** permission to toggle NSFW access."),
        ],
      });
      return;
    }
    const enabling = arg1 === "on";
    if (guildId) await setNsfwEnabled(guildId, enabling);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(enabling ? 0x00ff99 : 0xffaa00)
          .setDescription(
            enabling
              ? "✅ NSFW commands are now **on** — anyone can use `?nsfw`."
              : "🔒 NSFW commands are now **off** — only admins can use `?nsfw`.",
          ),
      ],
    });
    return;
  }

  // ── Access gate: if NSFW is off, non-admins are blocked ───────────────
  if (guildId) {
    const enabled = await getNsfwEnabled(guildId);
    if (!enabled && !isAdmin) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setDescription("🔒 NSFW commands are currently disabled on this server."),
        ],
      });
      return;
    }
  }

  if (arg1 === "help") {
    await message.reply({ embeds: [HELP_EMBED] });
    return;
  }

  let wantVideo = false;
  let url: string | null;

  if (!arg1) {
    // ?nsfw → random image
    url = await fetchNsfwUrl(pick(VALID_CATS.filter((c) => c !== "random")), false);
  } else if (arg1 === "video") {
    // ?nsfw video → random video
    wantVideo = true;
    url = await fetchNsfwUrl(pick(VALID_CATS.filter((c) => c !== "random")), true);
  } else if ((VALID_CATS as string[]).includes(arg1)) {
    // ?nsfw <known cat> [video]
    wantVideo = arg2 === "video";
    url = await fetchNsfwUrl(arg1 as Category, wantVideo);
  } else {
    // Freeform search — grab everything after ?nsfw, strip trailing "video" keyword
    const rawArgs = parts.slice(1);
    wantVideo = rawArgs[rawArgs.length - 1]?.toLowerCase() === "video";
    const termParts = wantVideo ? rawArgs.slice(0, -1) : rawArgs;
    const term = termParts.join(" ").trim().toLowerCase();
    url = await fetchFreeformUrl(term, wantVideo);
  }

  if (!url) {
    await message.reply("❌ Couldn't fetch right now. Try again in a moment.");
    return;
  }

  if (wantVideo) {
    await message.reply({ content: url });
    return;
  }

  // ── Image mode: download and re-upload to bypass hotlink protection ────────
  // If booru CDNs block Discord's embed crawler, setImage(url) renders blank.
  // Downloading on the bot side and attaching lets Discord host it on its own CDN.
  try {
    const srcHost = new URL(url).hostname;
    const imgRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `https://${srcHost}/`,
        "Accept": "image/gif,image/webp,image/*,*/*",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (imgRes.ok) {
      const contentLength = Number(imgRes.headers.get("content-length") ?? 0);
      // Discord file limit for bots: 25 MB
      if (contentLength === 0 || contentLength < 25 * 1024 * 1024) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        if (buffer.byteLength > 0 && buffer.byteLength < 25 * 1024 * 1024) {
          const ext = url.split(".").pop()?.split("?")[0] ?? "gif";
          const file = new AttachmentBuilder(buffer, { name: `nsfw.${ext}` });
          await message.reply({ files: [file] });
          return;
        }
      }
    }
  } catch { /* fall through to direct URL */ }

  // Fallback: direct URL as plain text (Discord auto-previews images)
  await message.reply({ content: url });
}
