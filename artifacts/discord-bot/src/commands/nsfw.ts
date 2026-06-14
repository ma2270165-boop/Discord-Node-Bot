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
  // ── Originals ──────────────────────────────────────────────────────────────
  neko:            { booru: `animated hentai cat_girl rating:explicit ${EXCL}`,                   moebooru: `cat_girl rating:e ${EXCL_MB}`,                 redgifs: "anime neko hentai"               },
  hentai:          { booru: `animated hentai rating:explicit ${EXCL}`,                            moebooru: `sex rating:e ${EXCL_MB}`,                      redgifs: "anime hentai 2d"                 },
  waifu:           { booru: `animated hentai 1girl rating:explicit ${EXCL}`,                      moebooru: `1girl rating:e ${EXCL_MB}`,                    redgifs: "anime waifu hentai"              },
  milf:            { booru: `animated hentai milf rating:explicit ${EXCL}`,                       moebooru: `milf rating:e ${EXCL_MB}`,                     redgifs: "anime milf hentai"               },
  ahegao:          { booru: `animated hentai ahegao rating:explicit ${EXCL}`,                     moebooru: `ahegao rating:e ${EXCL_MB}`,                   redgifs: "ahegao anime hentai"             },
  maid:            { booru: `animated hentai maid rating:explicit ${EXCL}`,                       moebooru: `maid rating:e ${EXCL_MB}`,                     redgifs: "anime maid hentai"               },
  elf:             { booru: `animated hentai elf rating:explicit ${EXCL}`,                        moebooru: `elf_ears rating:e ${EXCL_MB}`,                 redgifs: "anime elf hentai"                },
  schoolgirl:      { booru: `animated hentai school_uniform rating:explicit ${EXCL}`,             moebooru: `school_uniform rating:e ${EXCL_MB}`,           redgifs: "anime schoolgirl hentai"         },
  gangbang:        { booru: `animated hentai gangbang rating:explicit ${EXCL}`,                   moebooru: `gangbang rating:e ${EXCL_MB}`,                 redgifs: "anime gangbang hentai"           },
  creampie:        { booru: `animated hentai creampie rating:explicit ${EXCL}`,                   moebooru: `creampie rating:e ${EXCL_MB}`,                 redgifs: "anime creampie hentai"           },
  random:          { booru: `animated hentai rating:explicit ${EXCL}`,                            moebooru: `rating:e ${EXCL_MB}`,                          redgifs: "anime hentai"                    },

  // ── Sex acts ───────────────────────────────────────────────────────────────
  blowjob:         { booru: `animated hentai blowjob rating:explicit ${EXCL}`,                    moebooru: `fellatio rating:e ${EXCL_MB}`,                 redgifs: "anime blowjob hentai"            },
  anal:            { booru: `animated hentai anal rating:explicit ${EXCL}`,                       moebooru: `anal rating:e ${EXCL_MB}`,                     redgifs: "anime anal hentai"               },
  paizuri:         { booru: `animated hentai paizuri rating:explicit ${EXCL}`,                    moebooru: `paizuri rating:e ${EXCL_MB}`,                  redgifs: "anime paizuri titfuck hentai"    },
  cumshot:         { booru: `animated hentai cum rating:explicit ${EXCL}`,                        moebooru: `cum rating:e ${EXCL_MB}`,                      redgifs: "anime cumshot hentai"            },
  riding:          { booru: `animated hentai cowgirl_position rating:explicit ${EXCL}`,           moebooru: `cowgirl_position rating:e ${EXCL_MB}`,         redgifs: "anime riding hentai"             },
  doggystyle:      { booru: `animated hentai doggystyle rating:explicit ${EXCL}`,                 moebooru: `doggystyle rating:e ${EXCL_MB}`,               redgifs: "anime doggystyle hentai"         },
  missionary:      { booru: `animated hentai missionary rating:explicit ${EXCL}`,                 moebooru: `missionary rating:e ${EXCL_MB}`,               redgifs: "anime missionary hentai"         },
  handjob:         { booru: `animated hentai handjob rating:explicit ${EXCL}`,                    moebooru: `handjob rating:e ${EXCL_MB}`,                  redgifs: "anime handjob hentai"            },
  footjob:         { booru: `animated hentai footjob rating:explicit ${EXCL}`,                    moebooru: `footjob rating:e ${EXCL_MB}`,                  redgifs: "anime footjob hentai"            },
  threesome:       { booru: `animated hentai threesome rating:explicit ${EXCL}`,                  moebooru: `threesome rating:e ${EXCL_MB}`,                redgifs: "anime threesome hentai"          },
  facial:          { booru: `animated hentai cum_on_face rating:explicit ${EXCL}`,                moebooru: `cum_on_face rating:e ${EXCL_MB}`,              redgifs: "anime facial hentai"             },
  deepthroat:      { booru: `animated hentai deepthroat rating:explicit ${EXCL}`,                 moebooru: `deepthroat rating:e ${EXCL_MB}`,               redgifs: "anime deepthroat hentai"         },
  squirt:          { booru: `animated hentai squirting rating:explicit ${EXCL}`,                  moebooru: `squirting rating:e ${EXCL_MB}`,                redgifs: "anime squirting hentai"          },
  masturbation:    { booru: `animated hentai masturbation rating:explicit ${EXCL}`,               moebooru: `masturbation rating:e ${EXCL_MB}`,             redgifs: "anime masturbation hentai"       },
  dildo:           { booru: `animated hentai dildo rating:explicit ${EXCL}`,                      moebooru: `dildo rating:e ${EXCL_MB}`,                    redgifs: "anime dildo hentai"              },
  vibrator:        { booru: `animated hentai vibrator rating:explicit ${EXCL}`,                   moebooru: `vibrator rating:e ${EXCL_MB}`,                 redgifs: "anime vibrator hentai"           },
  dp:              { booru: `animated hentai double_penetration rating:explicit ${EXCL}`,         moebooru: `double_penetration rating:e ${EXCL_MB}`,       redgifs: "anime double penetration hentai" },
  public:          { booru: `animated hentai public_sex rating:explicit ${EXCL}`,                 moebooru: `sex_in_public rating:e ${EXCL_MB}`,            redgifs: "anime public sex hentai"         },
  cunnilingus:     { booru: `animated hentai cunnilingus rating:explicit ${EXCL}`,                moebooru: `cunnilingus rating:e ${EXCL_MB}`,              redgifs: "anime cunnilingus hentai"        },
  reverse_cowgirl: { booru: `animated hentai reverse_cowgirl_position rating:explicit ${EXCL}`,   moebooru: `reverse_cowgirl_position rating:e ${EXCL_MB}`, redgifs: "anime reverse cowgirl hentai"    },
  standing:        { booru: `animated hentai standing_sex rating:explicit ${EXCL}`,               moebooru: `standing_sex rating:e ${EXCL_MB}`,             redgifs: "anime standing sex hentai"       },
  spanking:        { booru: `animated hentai spanking rating:explicit ${EXCL}`,                   moebooru: `spanking rating:e ${EXCL_MB}`,                 redgifs: "anime spanking hentai"           },
  fingering:       { booru: `animated hentai fingering rating:explicit ${EXCL}`,                  moebooru: `fingering rating:e ${EXCL_MB}`,                redgifs: "anime fingering hentai"          },
  thighjob:        { booru: `animated hentai thigh_sex rating:explicit ${EXCL}`,                  moebooru: `thigh_sex rating:e ${EXCL_MB}`,                redgifs: "anime thighjob hentai"           },
  clothed:         { booru: `animated hentai clothed_sex rating:explicit ${EXCL}`,                moebooru: `clothed_sex rating:e ${EXCL_MB}`,              redgifs: "anime clothed sex hentai"        },
  sleeping:        { booru: `animated hentai sleeping rating:explicit ${EXCL}`,                   moebooru: `sleeping rating:e ${EXCL_MB}`,                 redgifs: "anime sleeping sex hentai"       },
  group:           { booru: `animated hentai group_sex rating:explicit ${EXCL}`,                  moebooru: `group_sex rating:e ${EXCL_MB}`,                redgifs: "anime group sex hentai"          },
  orgy:            { booru: `animated hentai orgy rating:explicit ${EXCL}`,                       moebooru: `orgy rating:e ${EXCL_MB}`,                     redgifs: "anime orgy hentai"               },

  // ── Character types ────────────────────────────────────────────────────────
  nurse:           { booru: `animated hentai nurse rating:explicit ${EXCL}`,                      moebooru: `nurse rating:e ${EXCL_MB}`,                    redgifs: "anime nurse hentai"              },
  teacher:         { booru: `animated hentai teacher rating:explicit ${EXCL}`,                    moebooru: `teacher rating:e ${EXCL_MB}`,                  redgifs: "anime teacher hentai"            },
  ojou:            { booru: `animated hentai ojou-sama rating:explicit ${EXCL}`,                  moebooru: `ojou-sama rating:e ${EXCL_MB}`,                redgifs: "anime ojou hentai"               },
  demon:           { booru: `animated hentai demon_girl rating:explicit ${EXCL}`,                 moebooru: `demon_girl rating:e ${EXCL_MB}`,               redgifs: "anime demon girl hentai"         },
  angel:           { booru: `animated hentai angel rating:explicit ${EXCL}`,                      moebooru: `angel rating:e ${EXCL_MB}`,                    redgifs: "anime angel hentai"              },
  vampire:         { booru: `animated hentai vampire rating:explicit ${EXCL}`,                    moebooru: `vampire rating:e ${EXCL_MB}`,                  redgifs: "anime vampire hentai"            },
  witch:           { booru: `animated hentai witch rating:explicit ${EXCL}`,                      moebooru: `witch rating:e ${EXCL_MB}`,                    redgifs: "anime witch hentai"              },
  miko:            { booru: `animated hentai miko rating:explicit ${EXCL}`,                       moebooru: `miko rating:e ${EXCL_MB}`,                     redgifs: "anime shrine maiden hentai"      },
  bunny:           { booru: `animated hentai bunny_girl rating:explicit ${EXCL}`,                 moebooru: `bunny_girl rating:e ${EXCL_MB}`,               redgifs: "anime bunny girl hentai"         },
  princess:        { booru: `animated hentai princess rating:explicit ${EXCL}`,                   moebooru: `princess rating:e ${EXCL_MB}`,                 redgifs: "anime princess hentai"           },
  idol:            { booru: `animated hentai idol rating:explicit ${EXCL}`,                       moebooru: `idol rating:e ${EXCL_MB}`,                     redgifs: "anime idol hentai"               },
  kunoichi:        { booru: `animated hentai kunoichi rating:explicit ${EXCL}`,                   moebooru: `kunoichi rating:e ${EXCL_MB}`,                 redgifs: "anime kunoichi ninja hentai"     },
  pirate:          { booru: `animated hentai pirate rating:explicit ${EXCL}`,                     moebooru: `pirate rating:e ${EXCL_MB}`,                   redgifs: "anime pirate hentai"             },
  cheerleader:     { booru: `animated hentai cheerleader rating:explicit ${EXCL}`,                moebooru: `cheerleader rating:e ${EXCL_MB}`,              redgifs: "anime cheerleader hentai"        },
  police:          { booru: `animated hentai policewoman rating:explicit ${EXCL}`,                moebooru: `policewoman rating:e ${EXCL_MB}`,              redgifs: "anime police hentai"             },
  military:        { booru: `animated hentai military_uniform rating:explicit ${EXCL}`,           moebooru: `military_uniform rating:e ${EXCL_MB}`,         redgifs: "anime military girl hentai"      },
  tomboy:          { booru: `animated hentai tomboy rating:explicit ${EXCL}`,                     moebooru: `tomboy rating:e ${EXCL_MB}`,                   redgifs: "anime tomboy hentai"             },
  gyaru:           { booru: `animated hentai gyaru rating:explicit ${EXCL}`,                      moebooru: `gyaru rating:e ${EXCL_MB}`,                    redgifs: "anime gyaru hentai"              },
  foxgirl:         { booru: `animated hentai fox_girl rating:explicit ${EXCL}`,                   moebooru: `fox_girl rating:e ${EXCL_MB}`,                 redgifs: "anime fox girl hentai"           },
  kemonomimi:      { booru: `animated hentai kemonomimi rating:explicit ${EXCL}`,                 moebooru: `kemonomimi rating:e ${EXCL_MB}`,               redgifs: "anime kemonomimi hentai"         },
  warrior:         { booru: `animated hentai warrior rating:explicit ${EXCL}`,                    moebooru: `warrior rating:e ${EXCL_MB}`,                  redgifs: "anime warrior hentai"            },
  knight:          { booru: `animated hentai knight rating:explicit ${EXCL}`,                     moebooru: `knight rating:e ${EXCL_MB}`,                   redgifs: "anime knight hentai"             },
  twins:           { booru: `animated hentai twins rating:explicit ${EXCL}`,                      moebooru: `twins rating:e ${EXCL_MB}`,                    redgifs: "anime twins hentai"              },
  yandere:         { booru: `animated hentai yandere rating:explicit ${EXCL}`,                    moebooru: `yandere rating:e ${EXCL_MB}`,                  redgifs: "anime yandere hentai"            },
  harem:           { booru: `animated hentai harem rating:explicit ${EXCL}`,                      moebooru: `harem rating:e ${EXCL_MB}`,                    redgifs: "anime harem hentai"              },

  // ── Physical / clothing ────────────────────────────────────────────────────
  stockings:       { booru: `animated hentai thighhighs rating:explicit ${EXCL}`,                 moebooru: `thighhighs rating:e ${EXCL_MB}`,               redgifs: "anime stockings thighhighs hentai" },
  lingerie:        { booru: `animated hentai lingerie rating:explicit ${EXCL}`,                   moebooru: `lingerie rating:e ${EXCL_MB}`,                 redgifs: "anime lingerie hentai"           },
  swimsuit:        { booru: `animated hentai swimsuit rating:explicit ${EXCL}`,                   moebooru: `swimsuit rating:e ${EXCL_MB}`,                 redgifs: "anime swimsuit hentai"           },
  nude:            { booru: `animated hentai nude rating:explicit ${EXCL}`,                       moebooru: `nude rating:e ${EXCL_MB}`,                     redgifs: "anime nude hentai"               },
  topless:         { booru: `animated hentai topless rating:explicit ${EXCL}`,                    moebooru: `topless rating:e ${EXCL_MB}`,                  redgifs: "anime topless hentai"            },
  exhibitionism:   { booru: `animated hentai exhibitionism rating:explicit ${EXCL}`,              moebooru: `exhibitionism rating:e ${EXCL_MB}`,            redgifs: "anime exhibitionism hentai"      },
  latex:           { booru: `animated hentai latex rating:explicit ${EXCL}`,                      moebooru: `latex rating:e ${EXCL_MB}`,                    redgifs: "anime latex hentai"              },
  glasses:         { booru: `animated hentai glasses rating:explicit ${EXCL}`,                    moebooru: `glasses rating:e ${EXCL_MB}`,                  redgifs: "anime glasses hentai"            },
  twintails:       { booru: `animated hentai twintails rating:explicit ${EXCL}`,                  moebooru: `twintails rating:e ${EXCL_MB}`,                redgifs: "anime twintails hentai"          },
  ass:             { booru: `animated hentai ass rating:explicit ${EXCL}`,                        moebooru: `ass rating:e ${EXCL_MB}`,                      redgifs: "anime ass hentai"                },
  bigboobs:        { booru: `animated hentai large_breasts rating:explicit ${EXCL}`,              moebooru: `large_breasts rating:e ${EXCL_MB}`,            redgifs: "anime big boobs hentai"          },
  smallboobs:      { booru: `animated hentai small_breasts rating:explicit ${EXCL}`,              moebooru: `small_breasts rating:e ${EXCL_MB}`,            redgifs: "anime small breasts hentai"      },
  thighs:          { booru: `animated hentai thick_thighs rating:explicit ${EXCL}`,               moebooru: `thick_thighs rating:e ${EXCL_MB}`,             redgifs: "anime thick thighs hentai"       },
  bikini:          { booru: `animated hentai bikini rating:explicit ${EXCL}`,                     moebooru: `bikini rating:e ${EXCL_MB}`,                   redgifs: "anime bikini hentai"             },
  apron:           { booru: `animated hentai naked_apron rating:explicit ${EXCL}`,                moebooru: `naked_apron rating:e ${EXCL_MB}`,              redgifs: "anime naked apron hentai"        },
  bodysuit:        { booru: `animated hentai bodysuit rating:explicit ${EXCL}`,                   moebooru: `bodysuit rating:e ${EXCL_MB}`,                 redgifs: "anime bodysuit hentai"           },
  pantyhose:       { booru: `animated hentai pantyhose rating:explicit ${EXCL}`,                  moebooru: `pantyhose rating:e ${EXCL_MB}`,                redgifs: "anime pantyhose hentai"          },
  uniform:         { booru: `animated hentai uniform rating:explicit ${EXCL}`,                    moebooru: `uniform rating:e ${EXCL_MB}`,                  redgifs: "anime uniform hentai"            },
  cosplay:         { booru: `animated hentai cosplay rating:explicit ${EXCL}`,                    moebooru: `cosplay rating:e ${EXCL_MB}`,                  redgifs: "anime cosplay hentai"            },

  // ── Kink / scenario ────────────────────────────────────────────────────────
  bondage:         { booru: `animated hentai bondage rating:explicit ${EXCL}`,                    moebooru: `bondage rating:e ${EXCL_MB}`,                  redgifs: "anime bondage hentai"            },
  bdsm:            { booru: `animated hentai bdsm rating:explicit ${EXCL}`,                       moebooru: `bdsm rating:e ${EXCL_MB}`,                     redgifs: "anime bdsm hentai"               },
  femdom:          { booru: `animated hentai femdom rating:explicit ${EXCL}`,                     moebooru: `femdom rating:e ${EXCL_MB}`,                   redgifs: "anime femdom hentai"             },
  collar:          { booru: `animated hentai collar rating:explicit ${EXCL}`,                     moebooru: `collar rating:e ${EXCL_MB}`,                   redgifs: "anime collar hentai"             },
  blindfold:       { booru: `animated hentai blindfold rating:explicit ${EXCL}`,                  moebooru: `blindfold rating:e ${EXCL_MB}`,                redgifs: "anime blindfold hentai"          },
  pov:             { booru: `animated hentai pov rating:explicit ${EXCL}`,                        moebooru: `pov rating:e ${EXCL_MB}`,                      redgifs: "anime pov hentai"                },
  xray:            { booru: `animated hentai x-ray rating:explicit ${EXCL}`,                      moebooru: `x-ray rating:e ${EXCL_MB}`,                    redgifs: "anime xray hentai"               },
  uncensored:      { booru: `animated hentai uncensored rating:explicit ${EXCL}`,                 moebooru: `uncensored rating:e ${EXCL_MB}`,               redgifs: "anime uncensored hentai"         },
  impregnation:    { booru: `animated hentai impregnation rating:explicit ${EXCL}`,               moebooru: `impregnation rating:e ${EXCL_MB}`,             redgifs: "anime impregnation hentai"       },
  pregnant:        { booru: `animated hentai pregnant rating:explicit ${EXCL}`,                   moebooru: `pregnant rating:e ${EXCL_MB}`,                 redgifs: "anime pregnant hentai"           },
  shibari:         { booru: `animated hentai shibari rating:explicit ${EXCL}`,                    moebooru: `shibari rating:e ${EXCL_MB}`,                  redgifs: "anime shibari rope hentai"       },
  gloryhole:       { booru: `animated hentai glory_hole rating:explicit ${EXCL}`,                 moebooru: `glory_hole rating:e ${EXCL_MB}`,               redgifs: "anime glory hole hentai"         },
  breeding:        { booru: `animated hentai breeding rating:explicit ${EXCL}`,                   moebooru: `breeding rating:e ${EXCL_MB}`,                 redgifs: "anime breeding hentai"           },

  // ── Settings ───────────────────────────────────────────────────────────────
  outdoor:         { booru: `animated hentai outdoors rating:explicit ${EXCL}`,                   moebooru: `outdoors rating:e ${EXCL_MB}`,                 redgifs: "anime outdoor sex hentai"        },
  beach:           { booru: `animated hentai beach rating:explicit ${EXCL}`,                      moebooru: `beach rating:e ${EXCL_MB}`,                    redgifs: "anime beach hentai"              },
  classroom:       { booru: `animated hentai classroom rating:explicit ${EXCL}`,                  moebooru: `classroom rating:e ${EXCL_MB}`,                redgifs: "anime classroom hentai"          },
  office:          { booru: `animated hentai office_sex rating:explicit ${EXCL}`,                 moebooru: `office_sex rating:e ${EXCL_MB}`,               redgifs: "anime office sex hentai"         },
  bath:            { booru: `animated hentai bathing rating:explicit ${EXCL}`,                    moebooru: `bathing rating:e ${EXCL_MB}`,                  redgifs: "anime bath sex hentai"           },
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
    tags, wantVideo, 200,
  );
}

// ── Gelbooru — authenticated with API key + user_id from env ─────────────
function fromGelbooru(tags: string, wantVideo: boolean): Promise<string | null> {
  const key    = process.env.GELBOORU_API_KEY;
  const userId = process.env.GELBOORU_USER_ID;
  if (!key || !userId) return Promise.resolve(null);
  return fetchBooru(
    `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&api_key=${key}&user_id=${userId}`,
    tags, wantVideo, 200,
  );
}

// ── Danbooru — authenticated, best quality source, prioritized first ──────
// Uses max 2 tags per query (Danbooru free-member limit).
// Two API keys fire in parallel for higher throughput.
type DanbooruPost = { file_url?: string; large_file_url?: string; file_ext?: string };

async function fromDanbooru(tag: string, login: string, apiKey: string, wantVideo: boolean): Promise<string | null> {
  if (!login || !apiKey) return null;
  for (const page of [Math.floor(Math.random() * 100) + 1, 1]) {
    try {
      const url = `https://danbooru.donmai.us/posts.json?login=${encodeURIComponent(login)}&api_key=${encodeURIComponent(apiKey)}&tags=${encodeURIComponent(tag)}&limit=100&page=${page}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const posts = await res.json() as DanbooruPost[];
      if (!Array.isArray(posts) || posts.length === 0) continue;
      const booruPosts: BooruPost[] = posts
        .filter((p) => p.file_url)
        .map((p) => ({ file_url: p.file_url }));
      const picked = selectUrl(booruPosts, wantVideo);
      if (picked) return picked;
    } catch { return null; }
  }
  return null;
}

// Derive a compact 2-tag Danbooru query from a moebooru tag string
// (strips exclusions and rating tag, takes only the first positive content tag)
function danbooruTag(moebooru: string): string {
  const first = moebooru.split(/\s+/).find((t) => !t.startsWith("-") && !t.startsWith("rating:"));
  return first ? `${first} rating:e` : "rating:e";
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
// Danbooru (×2 keys) fires first — highest quality + parallel throughput.
// Video mode: Redgifs only (dedicated video platform).
function buildFns(
  booruTags: string,
  mbTags: string,
  dbTag: string,
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
  const login1 = process.env.DANBOORU_LOGIN  ?? "";
  const login2 = process.env.DANBOORU_LOGIN_2 ?? "";
  const key1   = process.env.DANBOORU_API_KEY;
  const key2   = process.env.DANBOORU_API_KEY_2;
  return [
    ...(login1 && key1 ? [() => fromDanbooru(dbTag, login1, key1, false)] : []),
    ...(login2 && key2 ? [() => fromDanbooru(dbTag, login2, key2, false)] : []),
    () => fromGelbooru(booruTags, false),
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
  const dbTag = danbooruTag(map.moebooru);
  const fns = buildFns(map.booru, map.moebooru, dbTag, map.redgifs, wantVideo);
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
  const dbTag     = `${booruTerm} rating:e`;
  const rgQuery   = `anime ${term} hentai`;

  const fns = buildFns(booruTags, mbTags, dbTag, rgQuery, wantVideo);
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

// ── Download a single image — returns buffer or null ──────────────────────
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const srcHost = new URL(url).hostname;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `https://${srcHost}/`,
        "Accept": "image/gif,image/webp,image/*,*/*",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength >= 25 * 1024 * 1024) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength >= 25 * 1024 * 1024) return null;
    return buffer;
  } catch { return null; }
}

// ── Fetch one image URL + download it, retrying on bad URLs ───────────────
async function fetchAndDownload(
  fetcher: (video: boolean) => Promise<string | null>,
): Promise<{ buffer: Buffer; ext: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = await fetcher(false);
    if (!url) return null;
    const buffer = await downloadImage(url);
    if (buffer) {
      const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "gif";
      return { buffer, ext };
    }
    markSeen(url); // mark bad so next call returns a different URL
  }
  return null;
}

// ── Bulk send: fetch `count` images/videos, send 5 per message ────────────
async function sendBulk(
  message: Message,
  fetcher: (video: boolean) => Promise<string | null>,
  count: number,
  wantVideo: boolean,
): Promise<void> {
  await message.reply(`⏳ Fetching **${count}** ${wantVideo ? "videos" : "images"}…`);

  if (wantVideo) {
    // Videos: collect URLs in parallel, send as plain text (Redgifs auto-embeds)
    const results = await Promise.allSettled(
      Array.from({ length: count }, async () => {
        const url = await fetcher(true);
        return url;
      }),
    );
    const urls = results
      .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value!);

    if (urls.length === 0) { await message.reply("❌ Couldn't fetch any videos right now."); return; }

    for (let i = 0; i < urls.length; i += 5) {
      await message.reply({ content: urls.slice(i, i + 5).join("\n") });
    }
    return;
  }

  // Images: download all in parallel, then send 5 per message as attachments
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => fetchAndDownload(fetcher)),
  );
  const images = results
    .filter((r): r is PromiseFulfilledResult<{ buffer: Buffer; ext: string }> =>
      r.status === "fulfilled" && r.value !== null,
    )
    .map((r, i) => ({ ...r.value, idx: i + 1 }));

  if (images.length === 0) { await message.reply("❌ Couldn't fetch any images right now."); return; }

  for (let i = 0; i < images.length; i += 5) {
    const batch = images.slice(i, i + 5);
    const files = batch.map((img) =>
      new AttachmentBuilder(img.buffer, { name: `nsfw_${img.idx}.${img.ext}` }),
    );
    await message.reply({ files });
  }
}

// ── Help embed ────────────────────────────────────────────────────────────

const HELP_EMBED = new EmbedBuilder()
  .setColor(0xff0055)
  .setTitle("🔞 NSFW Command Help")
  .addFields(
    {
      name: "Single image / video",
      value: [
        "`?nsfw` — random image",
        "`?nsfw <category>` — category image",
        "`?nsfw video` — random video",
        "`?nsfw <category> video` — category video",
      ].join("\n"),
    },
    {
      name: "Bulk (up to 20, sent 5 per message)",
      value: [
        "`?nsfw <amount>` — e.g. `?nsfw 10`",
        "`?nsfw <amount> <category>` — e.g. `?nsfw 5 maid`",
        "`?nsfw <amount> video` — e.g. `?nsfw 10 video`",
        "`?nsfw <amount> <category> video` — e.g. `?nsfw 5 maid video`",
      ].join("\n"),
    },
    {
      name: "Other",
      value: [
        "`?nsfw list` — show all 100+ categories",
        "`?nsfw help` — show this message",
        "`?nsfw on/off` — toggle (admin only)",
      ].join("\n"),
    },
  )
  .setFooter({ text: "?nfsw also works • Strictly straight content only" });

// ── List embed — paginated by group ───────────────────────────────────────
function buildListEmbed(): EmbedBuilder {
  const groups: Record<string, string[]> = {
    "Sex Acts":       ["blowjob","anal","paizuri","cumshot","riding","doggystyle","missionary","handjob","footjob","threesome","facial","deepthroat","squirt","masturbation","dildo","vibrator","dp","public","cunnilingus","reverse_cowgirl","standing","spanking","fingering","thighjob","clothed","sleeping","group","orgy","gangbang","creampie"],
    "Characters":     ["neko","waifu","milf","maid","elf","schoolgirl","nurse","teacher","ojou","demon","angel","vampire","witch","miko","bunny","princess","idol","kunoichi","pirate","cheerleader","police","military","tomboy","gyaru","foxgirl","kemonomimi","warrior","knight","twins","yandere","harem"],
    "Physical/Style": ["stockings","lingerie","swimsuit","nude","topless","exhibitionism","latex","glasses","twintails","ass","bigboobs","smallboobs","thighs","bikini","apron","bodysuit","pantyhose","uniform","cosplay","ahegao"],
    "Kink/Scenario":  ["bondage","bdsm","femdom","collar","blindfold","pov","xray","uncensored","impregnation","pregnant","shibari","gloryhole","breeding"],
    "Settings":       ["outdoor","beach","classroom","office","bath","public"],
    "General":        ["hentai","random"],
  };
  const embed = new EmbedBuilder()
    .setColor(0xff0055)
    .setTitle(`🔞 All Categories (${VALID_CATS.length} total)`);
  for (const [group, cats] of Object.entries(groups)) {
    embed.addFields({ name: group, value: cats.map((c) => `\`${c}\``).join(" ") });
  }
  return embed;
}

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

  if (arg1 === "list") {
    await message.reply({ embeds: [buildListEmbed()] });
    return;
  }

  // ── Bulk mode detection: ?nsfw <number> [category] [video] ────────────────
  const maybeCount = parseInt(arg1 ?? "", 10);
  const isBulk = !isNaN(maybeCount) && maybeCount >= 1;

  // Normalise any "video"/"videos"/"vid" variant to the canonical word "video"
  const normalise = (s: string | undefined) =>
    s && /^vid(eo)?s?$/i.test(s) ? "video" : s;

  // In bulk mode, shift args so category/video slots move one position right
  const bulkCatArg = normalise(isBulk ? parts[2]?.toLowerCase() : arg1);
  const bulkVidArg = normalise(isBulk ? parts[3]?.toLowerCase() : arg2);
  const bulkCount  = isBulk ? Math.min(maybeCount, 20) : 1;

  let wantVideo = false;
  let fetcher: (video: boolean) => Promise<string | null>;

  if (!bulkCatArg || bulkCatArg === "video") {
    wantVideo = bulkCatArg === "video" || bulkVidArg === "video";
    const cat = pick(VALID_CATS.filter((c) => c !== "random"));
    fetcher = (v) => fetchNsfwUrl(cat, v);
  } else if ((VALID_CATS as string[]).includes(bulkCatArg)) {
    wantVideo = bulkVidArg === "video";
    fetcher = (v) => fetchNsfwUrl(bulkCatArg as Category, v);
  } else if (!isBulk) {
    // Freeform search — only available in single mode
    const rawArgs = parts.slice(1).map(normalise) as string[];
    wantVideo = rawArgs[rawArgs.length - 1] === "video";
    const termParts = wantVideo ? rawArgs.slice(0, -1) : rawArgs;
    const term = termParts.join(" ").trim().toLowerCase();
    fetcher = (v) => fetchFreeformUrl(term, v);
  } else {
    // Bulk + unknown category — treat as freeform term
    const term = bulkCatArg;
    fetcher = (v) => fetchFreeformUrl(term, v);
  }

  // ── Bulk path ──────────────────────────────────────────────────────────────
  if (isBulk) {
    await sendBulk(message, fetcher, bulkCount, wantVideo);
    return;
  }

  // ── Single video ───────────────────────────────────────────────────────────
  if (wantVideo) {
    const url = await fetcher(true);
    if (!url) { await message.reply("❌ Couldn't fetch right now. Try again in a moment."); return; }
    await message.reply({ content: url });
    return;
  }

  // ── Single image: download + re-upload, retry up to 3 different URLs ───────
  for (let imgAttempt = 0; imgAttempt < 3; imgAttempt++) {
    const url = await fetcher(false);
    if (!url) break;
    const buffer = await downloadImage(url);
    if (buffer) {
      const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "gif";
      await message.reply({ files: [new AttachmentBuilder(buffer, { name: `nsfw.${ext}` })] });
      return;
    }
    markSeen(url);
  }

  await message.reply("❌ Couldn't fetch right now. Try again in a moment.");
}
