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

// Lighter exclusion list for freeform searches — user already specifies what they want,
// so only block truly unacceptable content, not niche tags they might intentionally search.
const EXCL_FREE =
  "-furry -anthro " +
  "-guro -scat -vore -gore -ryona -inflation " +
  "-real_person -live_action -3d -3dcg -photorealistic";

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
  neko:            { booru: `hentai cat_girl rating:explicit ${EXCL}`,                   moebooru: `cat_girl rating:e ${EXCL_MB}`,                 redgifs: "anime neko hentai"               },
  hentai:          { booru: `hentai rating:explicit ${EXCL}`,                            moebooru: `sex rating:e ${EXCL_MB}`,                      redgifs: "anime hentai 2d"                 },
  waifu:           { booru: `hentai 1girl rating:explicit ${EXCL}`,                      moebooru: `1girl rating:e ${EXCL_MB}`,                    redgifs: "anime waifu hentai"              },
  milf:            { booru: `hentai milf rating:explicit ${EXCL}`,                       moebooru: `milf rating:e ${EXCL_MB}`,                     redgifs: "anime milf hentai"               },
  ahegao:          { booru: `hentai ahegao rating:explicit ${EXCL}`,                     moebooru: `ahegao rating:e ${EXCL_MB}`,                   redgifs: "ahegao anime hentai"             },
  maid:            { booru: `hentai maid rating:explicit ${EXCL}`,                       moebooru: `maid rating:e ${EXCL_MB}`,                     redgifs: "anime maid hentai"               },
  elf:             { booru: `hentai elf rating:explicit ${EXCL}`,                        moebooru: `elf_ears rating:e ${EXCL_MB}`,                 redgifs: "anime elf hentai"                },
  schoolgirl:      { booru: `hentai school_uniform rating:explicit ${EXCL}`,             moebooru: `school_uniform rating:e ${EXCL_MB}`,           redgifs: "anime schoolgirl hentai"         },
  gangbang:        { booru: `hentai gangbang rating:explicit ${EXCL}`,                   moebooru: `gangbang rating:e ${EXCL_MB}`,                 redgifs: "anime gangbang hentai"           },
  creampie:        { booru: `hentai creampie rating:explicit ${EXCL}`,                   moebooru: `creampie rating:e ${EXCL_MB}`,                 redgifs: "anime creampie hentai"           },
  random:          { booru: `hentai rating:explicit ${EXCL}`,                            moebooru: `rating:e ${EXCL_MB}`,                          redgifs: "anime hentai"                    },

  // ── Sex acts ───────────────────────────────────────────────────────────────
  blowjob:         { booru: `hentai blowjob rating:explicit ${EXCL}`,                    moebooru: `fellatio rating:e ${EXCL_MB}`,                 redgifs: "anime blowjob hentai"            },
  anal:            { booru: `hentai anal rating:explicit ${EXCL}`,                       moebooru: `anal rating:e ${EXCL_MB}`,                     redgifs: "anime anal hentai"               },
  paizuri:         { booru: `hentai paizuri rating:explicit ${EXCL}`,                    moebooru: `paizuri rating:e ${EXCL_MB}`,                  redgifs: "anime paizuri titfuck hentai"    },
  cumshot:         { booru: `hentai cum rating:explicit ${EXCL}`,                        moebooru: `cum rating:e ${EXCL_MB}`,                      redgifs: "anime cumshot hentai"            },
  riding:          { booru: `hentai cowgirl_position rating:explicit ${EXCL}`,           moebooru: `cowgirl_position rating:e ${EXCL_MB}`,         redgifs: "anime riding hentai"             },
  doggystyle:      { booru: `hentai doggystyle rating:explicit ${EXCL}`,                 moebooru: `doggystyle rating:e ${EXCL_MB}`,               redgifs: "anime doggystyle hentai"         },
  missionary:      { booru: `hentai missionary rating:explicit ${EXCL}`,                 moebooru: `missionary rating:e ${EXCL_MB}`,               redgifs: "anime missionary hentai"         },
  handjob:         { booru: `hentai handjob rating:explicit ${EXCL}`,                    moebooru: `handjob rating:e ${EXCL_MB}`,                  redgifs: "anime handjob hentai"            },
  footjob:         { booru: `hentai footjob rating:explicit ${EXCL}`,                    moebooru: `footjob rating:e ${EXCL_MB}`,                  redgifs: "anime footjob hentai"            },
  threesome:       { booru: `hentai threesome rating:explicit ${EXCL}`,                  moebooru: `threesome rating:e ${EXCL_MB}`,                redgifs: "anime threesome hentai"          },
  facial:          { booru: `hentai cum_on_face rating:explicit ${EXCL}`,                moebooru: `cum_on_face rating:e ${EXCL_MB}`,              redgifs: "anime facial hentai"             },
  deepthroat:      { booru: `hentai deepthroat rating:explicit ${EXCL}`,                 moebooru: `deepthroat rating:e ${EXCL_MB}`,               redgifs: "anime deepthroat hentai"         },
  squirt:          { booru: `hentai squirting rating:explicit ${EXCL}`,                  moebooru: `squirting rating:e ${EXCL_MB}`,                redgifs: "anime squirting hentai"          },
  masturbation:    { booru: `hentai masturbation rating:explicit ${EXCL}`,               moebooru: `masturbation rating:e ${EXCL_MB}`,             redgifs: "anime masturbation hentai"       },
  dildo:           { booru: `hentai dildo rating:explicit ${EXCL}`,                      moebooru: `dildo rating:e ${EXCL_MB}`,                    redgifs: "anime dildo hentai"              },
  vibrator:        { booru: `hentai vibrator rating:explicit ${EXCL}`,                   moebooru: `vibrator rating:e ${EXCL_MB}`,                 redgifs: "anime vibrator hentai"           },
  dp:              { booru: `hentai double_penetration rating:explicit ${EXCL}`,         moebooru: `double_penetration rating:e ${EXCL_MB}`,       redgifs: "anime double penetration hentai" },
  public:          { booru: `hentai public_sex rating:explicit ${EXCL}`,                 moebooru: `sex_in_public rating:e ${EXCL_MB}`,            redgifs: "anime public sex hentai"         },
  cunnilingus:     { booru: `hentai cunnilingus rating:explicit ${EXCL}`,                moebooru: `cunnilingus rating:e ${EXCL_MB}`,              redgifs: "anime cunnilingus hentai"        },
  reverse_cowgirl: { booru: `hentai reverse_cowgirl_position rating:explicit ${EXCL}`,   moebooru: `reverse_cowgirl_position rating:e ${EXCL_MB}`, redgifs: "anime reverse cowgirl hentai"    },
  standing:        { booru: `hentai standing_sex rating:explicit ${EXCL}`,               moebooru: `standing_sex rating:e ${EXCL_MB}`,             redgifs: "anime standing sex hentai"       },
  spanking:        { booru: `hentai spanking rating:explicit ${EXCL}`,                   moebooru: `spanking rating:e ${EXCL_MB}`,                 redgifs: "anime spanking hentai"           },
  fingering:       { booru: `hentai fingering rating:explicit ${EXCL}`,                  moebooru: `fingering rating:e ${EXCL_MB}`,                redgifs: "anime fingering hentai"          },
  thighjob:        { booru: `hentai thigh_sex rating:explicit ${EXCL}`,                  moebooru: `thigh_sex rating:e ${EXCL_MB}`,                redgifs: "anime thighjob hentai"           },
  clothed:         { booru: `hentai clothed_sex rating:explicit ${EXCL}`,                moebooru: `clothed_sex rating:e ${EXCL_MB}`,              redgifs: "anime clothed sex hentai"        },
  sleeping:        { booru: `hentai sleeping rating:explicit ${EXCL}`,                   moebooru: `sleeping rating:e ${EXCL_MB}`,                 redgifs: "anime sleeping sex hentai"       },
  group:           { booru: `hentai group_sex rating:explicit ${EXCL}`,                  moebooru: `group_sex rating:e ${EXCL_MB}`,                redgifs: "anime group sex hentai"          },
  orgy:            { booru: `hentai orgy rating:explicit ${EXCL}`,                       moebooru: `orgy rating:e ${EXCL_MB}`,                     redgifs: "anime orgy hentai"               },

  // ── Character types ────────────────────────────────────────────────────────
  nurse:           { booru: `hentai nurse rating:explicit ${EXCL}`,                      moebooru: `nurse rating:e ${EXCL_MB}`,                    redgifs: "anime nurse hentai"              },
  teacher:         { booru: `hentai teacher rating:explicit ${EXCL}`,                    moebooru: `teacher rating:e ${EXCL_MB}`,                  redgifs: "anime teacher hentai"            },
  ojou:            { booru: `hentai ojou-sama rating:explicit ${EXCL}`,                  moebooru: `ojou-sama rating:e ${EXCL_MB}`,                redgifs: "anime ojou hentai"               },
  demon:           { booru: `hentai demon_girl rating:explicit ${EXCL}`,                 moebooru: `demon_girl rating:e ${EXCL_MB}`,               redgifs: "anime demon girl hentai"         },
  angel:           { booru: `hentai angel rating:explicit ${EXCL}`,                      moebooru: `angel rating:e ${EXCL_MB}`,                    redgifs: "anime angel hentai"              },
  vampire:         { booru: `hentai vampire rating:explicit ${EXCL}`,                    moebooru: `vampire rating:e ${EXCL_MB}`,                  redgifs: "anime vampire hentai"            },
  witch:           { booru: `hentai witch rating:explicit ${EXCL}`,                      moebooru: `witch rating:e ${EXCL_MB}`,                    redgifs: "anime witch hentai"              },
  miko:            { booru: `hentai miko rating:explicit ${EXCL}`,                       moebooru: `miko rating:e ${EXCL_MB}`,                     redgifs: "anime shrine maiden hentai"      },
  bunny:           { booru: `hentai bunny_girl rating:explicit ${EXCL}`,                 moebooru: `bunny_girl rating:e ${EXCL_MB}`,               redgifs: "anime bunny girl hentai"         },
  princess:        { booru: `hentai princess rating:explicit ${EXCL}`,                   moebooru: `princess rating:e ${EXCL_MB}`,                 redgifs: "anime princess hentai"           },
  idol:            { booru: `hentai idol rating:explicit ${EXCL}`,                       moebooru: `idol rating:e ${EXCL_MB}`,                     redgifs: "anime idol hentai"               },
  kunoichi:        { booru: `hentai kunoichi rating:explicit ${EXCL}`,                   moebooru: `kunoichi rating:e ${EXCL_MB}`,                 redgifs: "anime kunoichi ninja hentai"     },
  pirate:          { booru: `hentai pirate rating:explicit ${EXCL}`,                     moebooru: `pirate rating:e ${EXCL_MB}`,                   redgifs: "anime pirate hentai"             },
  cheerleader:     { booru: `hentai cheerleader rating:explicit ${EXCL}`,                moebooru: `cheerleader rating:e ${EXCL_MB}`,              redgifs: "anime cheerleader hentai"        },
  police:          { booru: `hentai policewoman rating:explicit ${EXCL}`,                moebooru: `policewoman rating:e ${EXCL_MB}`,              redgifs: "anime police hentai"             },
  military:        { booru: `hentai military_uniform rating:explicit ${EXCL}`,           moebooru: `military_uniform rating:e ${EXCL_MB}`,         redgifs: "anime military girl hentai"      },
  tomboy:          { booru: `hentai tomboy rating:explicit ${EXCL}`,                     moebooru: `tomboy rating:e ${EXCL_MB}`,                   redgifs: "anime tomboy hentai"             },
  gyaru:           { booru: `hentai gyaru rating:explicit ${EXCL}`,                      moebooru: `gyaru rating:e ${EXCL_MB}`,                    redgifs: "anime gyaru hentai"              },
  foxgirl:         { booru: `hentai fox_girl rating:explicit ${EXCL}`,                   moebooru: `fox_girl rating:e ${EXCL_MB}`,                 redgifs: "anime fox girl hentai"           },
  kemonomimi:      { booru: `hentai kemonomimi rating:explicit ${EXCL}`,                 moebooru: `kemonomimi rating:e ${EXCL_MB}`,               redgifs: "anime kemonomimi hentai"         },
  warrior:         { booru: `hentai warrior rating:explicit ${EXCL}`,                    moebooru: `warrior rating:e ${EXCL_MB}`,                  redgifs: "anime warrior hentai"            },
  knight:          { booru: `hentai knight rating:explicit ${EXCL}`,                     moebooru: `knight rating:e ${EXCL_MB}`,                   redgifs: "anime knight hentai"             },
  twins:           { booru: `hentai twins rating:explicit ${EXCL}`,                      moebooru: `twins rating:e ${EXCL_MB}`,                    redgifs: "anime twins hentai"              },
  yandere:         { booru: `hentai yandere rating:explicit ${EXCL}`,                    moebooru: `yandere rating:e ${EXCL_MB}`,                  redgifs: "anime yandere hentai"            },
  harem:           { booru: `hentai harem rating:explicit ${EXCL}`,                      moebooru: `harem rating:e ${EXCL_MB}`,                    redgifs: "anime harem hentai"              },

  // ── Physical / clothing ────────────────────────────────────────────────────
  stockings:       { booru: `hentai thighhighs rating:explicit ${EXCL}`,                 moebooru: `thighhighs rating:e ${EXCL_MB}`,               redgifs: "anime stockings thighhighs hentai" },
  lingerie:        { booru: `hentai lingerie rating:explicit ${EXCL}`,                   moebooru: `lingerie rating:e ${EXCL_MB}`,                 redgifs: "anime lingerie hentai"           },
  swimsuit:        { booru: `hentai swimsuit rating:explicit ${EXCL}`,                   moebooru: `swimsuit rating:e ${EXCL_MB}`,                 redgifs: "anime swimsuit hentai"           },
  nude:            { booru: `hentai nude rating:explicit ${EXCL}`,                       moebooru: `nude rating:e ${EXCL_MB}`,                     redgifs: "anime nude hentai"               },
  topless:         { booru: `hentai topless rating:explicit ${EXCL}`,                    moebooru: `topless rating:e ${EXCL_MB}`,                  redgifs: "anime topless hentai"            },
  exhibitionism:   { booru: `hentai exhibitionism rating:explicit ${EXCL}`,              moebooru: `exhibitionism rating:e ${EXCL_MB}`,            redgifs: "anime exhibitionism hentai"      },
  latex:           { booru: `hentai latex rating:explicit ${EXCL}`,                      moebooru: `latex rating:e ${EXCL_MB}`,                    redgifs: "anime latex hentai"              },
  glasses:         { booru: `hentai glasses rating:explicit ${EXCL}`,                    moebooru: `glasses rating:e ${EXCL_MB}`,                  redgifs: "anime glasses hentai"            },
  twintails:       { booru: `hentai twintails rating:explicit ${EXCL}`,                  moebooru: `twintails rating:e ${EXCL_MB}`,                redgifs: "anime twintails hentai"          },
  ass:             { booru: `hentai ass rating:explicit ${EXCL}`,                        moebooru: `ass rating:e ${EXCL_MB}`,                      redgifs: "anime ass hentai"                },
  bigboobs:        { booru: `hentai large_breasts rating:explicit ${EXCL}`,              moebooru: `large_breasts rating:e ${EXCL_MB}`,            redgifs: "anime big boobs hentai"          },
  smallboobs:      { booru: `hentai small_breasts rating:explicit ${EXCL}`,              moebooru: `small_breasts rating:e ${EXCL_MB}`,            redgifs: "anime small breasts hentai"      },
  thighs:          { booru: `hentai thick_thighs rating:explicit ${EXCL}`,               moebooru: `thick_thighs rating:e ${EXCL_MB}`,             redgifs: "anime thick thighs hentai"       },
  bikini:          { booru: `hentai bikini rating:explicit ${EXCL}`,                     moebooru: `bikini rating:e ${EXCL_MB}`,                   redgifs: "anime bikini hentai"             },
  apron:           { booru: `hentai naked_apron rating:explicit ${EXCL}`,                moebooru: `naked_apron rating:e ${EXCL_MB}`,              redgifs: "anime naked apron hentai"        },
  bodysuit:        { booru: `hentai bodysuit rating:explicit ${EXCL}`,                   moebooru: `bodysuit rating:e ${EXCL_MB}`,                 redgifs: "anime bodysuit hentai"           },
  pantyhose:       { booru: `hentai pantyhose rating:explicit ${EXCL}`,                  moebooru: `pantyhose rating:e ${EXCL_MB}`,                redgifs: "anime pantyhose hentai"          },
  uniform:         { booru: `hentai uniform rating:explicit ${EXCL}`,                    moebooru: `uniform rating:e ${EXCL_MB}`,                  redgifs: "anime uniform hentai"            },
  cosplay:         { booru: `hentai cosplay rating:explicit ${EXCL}`,                    moebooru: `cosplay rating:e ${EXCL_MB}`,                  redgifs: "anime cosplay hentai"            },

  // ── Kink / scenario ────────────────────────────────────────────────────────
  bondage:         { booru: `hentai bondage rating:explicit ${EXCL}`,                    moebooru: `bondage rating:e ${EXCL_MB}`,                  redgifs: "anime bondage hentai"            },
  bdsm:            { booru: `hentai bdsm rating:explicit ${EXCL}`,                       moebooru: `bdsm rating:e ${EXCL_MB}`,                     redgifs: "anime bdsm hentai"               },
  femdom:          { booru: `hentai femdom rating:explicit ${EXCL}`,                     moebooru: `femdom rating:e ${EXCL_MB}`,                   redgifs: "anime femdom hentai"             },
  collar:          { booru: `hentai collar rating:explicit ${EXCL}`,                     moebooru: `collar rating:e ${EXCL_MB}`,                   redgifs: "anime collar hentai"             },
  blindfold:       { booru: `hentai blindfold rating:explicit ${EXCL}`,                  moebooru: `blindfold rating:e ${EXCL_MB}`,                redgifs: "anime blindfold hentai"          },
  pov:             { booru: `hentai pov rating:explicit ${EXCL}`,                        moebooru: `pov rating:e ${EXCL_MB}`,                      redgifs: "anime pov hentai"                },
  xray:            { booru: `hentai x-ray rating:explicit ${EXCL}`,                      moebooru: `x-ray rating:e ${EXCL_MB}`,                    redgifs: "anime xray hentai"               },
  uncensored:      { booru: `hentai uncensored rating:explicit ${EXCL}`,                 moebooru: `uncensored rating:e ${EXCL_MB}`,               redgifs: "anime uncensored hentai"         },
  impregnation:    { booru: `hentai impregnation rating:explicit ${EXCL}`,               moebooru: `impregnation rating:e ${EXCL_MB}`,             redgifs: "anime impregnation hentai"       },
  pregnant:        { booru: `hentai pregnant rating:explicit ${EXCL}`,                   moebooru: `pregnant rating:e ${EXCL_MB}`,                 redgifs: "anime pregnant hentai"           },
  shibari:         { booru: `hentai shibari rating:explicit ${EXCL}`,                    moebooru: `shibari rating:e ${EXCL_MB}`,                  redgifs: "anime shibari rope hentai"       },
  gloryhole:       { booru: `hentai glory_hole rating:explicit ${EXCL}`,                 moebooru: `glory_hole rating:e ${EXCL_MB}`,               redgifs: "anime glory hole hentai"         },
  breeding:        { booru: `hentai breeding rating:explicit ${EXCL}`,                   moebooru: `breeding rating:e ${EXCL_MB}`,                 redgifs: "anime breeding hentai"           },

  // ── Settings ───────────────────────────────────────────────────────────────
  outdoor:         { booru: `hentai outdoors rating:explicit ${EXCL}`,                   moebooru: `outdoors rating:e ${EXCL_MB}`,                 redgifs: "anime outdoor sex hentai"        },
  beach:           { booru: `hentai beach rating:explicit ${EXCL}`,                      moebooru: `beach rating:e ${EXCL_MB}`,                    redgifs: "anime beach hentai"              },
  classroom:       { booru: `hentai classroom rating:explicit ${EXCL}`,                  moebooru: `classroom rating:e ${EXCL_MB}`,                redgifs: "anime classroom hentai"          },
  office:          { booru: `hentai office_sex rating:explicit ${EXCL}`,                 moebooru: `office_sex rating:e ${EXCL_MB}`,               redgifs: "anime office sex hentai"         },
  bath:            { booru: `hentai bathing rating:explicit ${EXCL}`,                    moebooru: `bathing rating:e ${EXCL_MB}`,                  redgifs: "anime bath sex hentai"           },
} as const;

type Category = keyof typeof CATEGORIES;
const VALID_CATS = Object.keys(CATEGORIES) as Category[];

const VIDEO_EXTS = [".mp4", ".webm", ".gif"];  // gifs animate inline in Discord
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

// ── Shared result + booru response types ─────────────────────────────────
type NsfwResult = { url: string; post: string };
type BooruPost = { id?: number; file_url?: string };
type BooruThibPost = { id?: number; directory?: number; image?: string };

function selectUrl(
  posts: BooruPost[],
  wantVideo: boolean,
  makePost: (p: BooruPost) => string,
): NsfwResult | null {
  const valid = posts.filter((p) =>
    p.file_url && (wantVideo ? isVideo(p.file_url) : isImage(p.file_url)),
  );
  if (valid.length === 0) return null;
  const unseen = valid.filter((p) => !seenSet.has(p.file_url!));
  const pool = unseen.length > 0 ? unseen : valid;
  const chosen = pick(pool);
  return { url: chosen.file_url!, post: makePost(chosen) };
}

// ── Generic booru fetcher (shared logic) ──────────────────────────────────
async function fetchBooru(
  baseUrl: string,
  tags: string,
  wantVideo: boolean,
  maxPid: number,
  buildUrl?: (item: BooruThibPost) => string,
  postBase?: string,
): Promise<NsfwResult | null> {
  const makePost = (p: BooruPost) =>
    postBase && p.id != null ? `${postBase}${p.id}` : (p.file_url ?? "");

  for (const pid of [Math.floor(Math.random() * maxPid), 0]) {
    try {
      const res = await fetch(
        `${baseUrl}&limit=50&pid=${pid}&tags=${encodeURIComponent(tags)}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" }, signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return null;

      let posts: BooruPost[];
      if (buildUrl) {
        const raw = await res.json() as BooruThibPost[] | { post?: BooruThibPost[] };
        const items = Array.isArray(raw) ? raw : (raw.post ?? []);
        posts = items
          .filter((p) => p.directory != null && p.image)
          .map((p) => ({ id: p.id, file_url: buildUrl(p) }));
      } else {
        const data = await res.json() as BooruPost[] | { post?: BooruPost[] };
        posts = Array.isArray(data) ? data : (data.post ?? []);
      }

      const result = selectUrl(posts, wantVideo, makePost);
      if (result) return result;
    } catch { return null; }
  }
  return null;
}

// ── xbooru ────────────────────────────────────────────────────────────────
function fromXbooru(tags: string, wantVideo: boolean): Promise<NsfwResult | null> {
  return fetchBooru(
    "https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1",
    tags, wantVideo, 30, undefined,
    "https://xbooru.com/index.php?page=post&s=view&id=",
  );
}

// ── tbib — URL = img.tbib.org/images/{dir}/{img} ──────────────────────────
function fromTbib(tags: string, wantVideo: boolean): Promise<NsfwResult | null> {
  return fetchBooru(
    "https://tbib.org/index.php?page=dapi&s=post&q=index&json=1",
    tags, wantVideo, 30,
    (p) => `https://img.tbib.org/images/${p.directory}/${p.image}`,
    "https://tbib.org/index.php?page=post&s=view&id=",
  );
}

// ── rule34.xxx ────────────────────────────────────────────────────────────
function fromRule34xxx(tags: string, wantVideo: boolean): Promise<NsfwResult | null> {
  return fetchBooru(
    "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1",
    tags, wantVideo, 200, undefined,
    "https://rule34.xxx/index.php?page=post&s=view&id=",
  );
}

// ── Gelbooru — authenticated with API key + user_id from env ─────────────
function fromGelbooru(tags: string, wantVideo: boolean): Promise<NsfwResult | null> {
  const key    = process.env.GELBOORU_API_KEY;
  const userId = process.env.GELBOORU_USER_ID;
  if (!key || !userId) return Promise.resolve(null);
  return fetchBooru(
    `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&api_key=${key}&user_id=${userId}`,
    tags, wantVideo, 200, undefined,
    "https://gelbooru.com/index.php?page=post&s=view&id=",
  );
}

// ── Danbooru — authenticated, best quality source, prioritized first ──────
// Uses max 2 tags per query (Danbooru free-member limit).
// Two API keys fire in parallel for higher throughput.
type DanbooruPost = { id?: number; file_url?: string; large_file_url?: string; file_ext?: string };

async function fromDanbooru(tag: string, login: string, apiKey: string, wantVideo: boolean): Promise<NsfwResult | null> {
  if (!login || !apiKey) return null;
  const makePost = (p: BooruPost) =>
    p.id != null ? `https://danbooru.donmai.us/posts/${p.id}` : (p.file_url ?? "");
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
        .map((p) => ({ id: p.id, file_url: p.file_url }));
      const result = selectUrl(booruPosts, wantVideo, makePost);
      if (result) return result;
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
  postShowBase: string,
  tags: string,
  wantVideo: boolean,
): Promise<NsfwResult | null> {
  if (wantVideo) return null;
  const makePost = (p: BooruPost) =>
    p.id != null ? `${postShowBase}${p.id}` : (p.file_url ?? "");
  for (const page of [Math.floor(Math.random() * 20) + 1, 1]) {
    try {
      const res = await fetch(
        `${baseUrl}?limit=50&page=${page}&tags=${encodeURIComponent(tags)}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" }, signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return null;
      const posts = await res.json() as BooruPost[];
      if (!Array.isArray(posts)) return null;
      const result = selectUrl(posts, false, makePost);
      if (result) return result;
    } catch { return null; }
  }
  return null;
}

function fromKonachan(tags: string, wantVideo: boolean): Promise<NsfwResult | null> {
  return fetchMoebooru("https://konachan.com/post.json", "https://konachan.com/post/show/", tags, wantVideo);
}

function fromYandere(tags: string, wantVideo: boolean): Promise<NsfwResult | null> {
  return fetchMoebooru("https://yande.re/post.json", "https://yande.re/post/show/", tags, wantVideo);
}

// ── Race all sources — first non-null result wins ─────────────────────────
function raceToFirst(fns: Array<() => Promise<NsfwResult | null>>): Promise<NsfwResult | null> {
  return new Promise((resolve) => {
    let remaining = fns.length;
    let done = false;
    for (const fn of fns) {
      fn().then((result) => {
        if (result && !done) { done = true; resolve(result); }
        else if (--remaining === 0 && !done) resolve(null);
      }).catch(() => { if (--remaining === 0 && !done) resolve(null); });
    }
  });
}

// Build source list — Danbooru (×2 keys) first, then other boorus.
// Redgifs removed: it mixes real-life content into results.
// Video mode uses the same booru sources with wantVideo=true (filters for .gif/.mp4/.webm).
function buildFns(
  booruTags: string,
  mbTags: string,
  dbTag: string,
  wantVideo: boolean,
): Array<() => Promise<NsfwResult | null>> {
  const login1 = process.env.DANBOORU_LOGIN  ?? "";
  const login2 = process.env.DANBOORU_LOGIN_2 ?? "";
  const key1   = process.env.DANBOORU_API_KEY;
  const key2   = process.env.DANBOORU_API_KEY_2;
  return [
    ...(login1 && key1 ? [() => fromDanbooru(dbTag, login1, key1, wantVideo)] : []),
    ...(login2 && key2 ? [() => fromDanbooru(dbTag, login2, key2, wantVideo)] : []),
    () => fromGelbooru(booruTags, wantVideo),
    () => fromXbooru(booruTags, wantVideo),
    () => fromTbib(booruTags, wantVideo),
    () => fromRule34xxx(booruTags, wantVideo),
    () => fromKonachan(mbTags, wantVideo),
    () => fromYandere(mbTags, wantVideo),
  ];
}

async function fetchNsfwUrl(category: Category, wantVideo: boolean): Promise<NsfwResult | null> {
  const map = CATEGORIES[category];
  const fns = buildFns(map.booru, map.moebooru, danbooruTag(map.moebooru), wantVideo);
  // selectUrl already prefers unseen URLs within each page; no outer seenSet loop needed.
  // Try twice (different random pages each call) in case first race is all timeouts.
  const result = await raceToFirst(fns) ?? await raceToFirst(fns);
  if (result) markSeen(result.url);
  return result;
}

// ── Freeform search — any term the user types ─────────────────────────────
async function fetchFreeformUrl(term: string, wantVideo: boolean): Promise<NsfwResult | null> {
  const booruTerm = term.replace(/\s+/g, "_");

  // Attempt 1: full term, light exclusions
  const fns1 = buildFns(
    `${booruTerm} rating:explicit ${EXCL_FREE}`,
    `${booruTerm} rating:e ${EXCL_MB}`,
    `${booruTerm} rating:e`,
    wantVideo,
  );
  let result = await raceToFirst(fns1);
  if (result) { markSeen(result.url); return result; }

  // Attempt 2: first word only (broadens the search for multi-word terms)
  const firstWord = booruTerm.split("_")[0];
  if (firstWord && firstWord !== booruTerm) {
    const fns2 = buildFns(
      `${firstWord} rating:explicit ${EXCL_FREE}`,
      `${firstWord} rating:e ${EXCL_MB}`,
      `${firstWord} rating:e`,
      wantVideo,
    );
    result = await raceToFirst(fns2);
    if (result) { markSeen(result.url); return result; }
  }

  // Attempt 3: silently fall back to a random category — user always gets content
  return fetchNsfwUrl(pick(VALID_CATS.filter(c => c !== "random")), wantVideo);
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

// ── Fetch a media URL + download it, retrying on bad URLs ─────────────────
// Works for both images and videos — Discord embeds anything uploaded as a file.
async function fetchAndDownload(
  fetcher: (video: boolean) => Promise<NsfwResult | null>,
  wantVideo = false,
): Promise<{ buffer: Buffer; ext: string; post: string } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await fetcher(wantVideo);
    if (!result) continue; // sources returned nothing this round — try again with a new random page
    const buffer = await downloadImage(result.url);
    if (buffer) {
      const ext = result.url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? (wantVideo ? "mp4" : "gif");
      return { buffer, ext, post: result.post };
    }
    markSeen(result.url); // bad download — mark seen so next attempt picks a different URL
  }
  return null;
}

// ── Bulk send: fetch `count` images/videos, send 5 per message ────────────
// All fetches start simultaneously. Images are pipelined — the first batch of 5
// sends as soon as those 5 finish downloading; later batches follow immediately
// after (they've been downloading in parallel the whole time).
async function sendBulk(
  message: Message,
  fetcher: (video: boolean) => Promise<NsfwResult | null>,
  count: number,
  wantVideo: boolean,
): Promise<void> {
  if (wantVideo) {
    // Videos: fetch all URLs in parallel, send as [Content N](url) | [Source](<post>) links.
    const tasks = Array.from({ length: count }, () => fetcher(true));
    const settled = await Promise.allSettled(tasks);
    const results = settled
      .filter((r): r is PromiseFulfilledResult<NsfwResult> => r.status === "fulfilled" && !!r.value)
      .map((r) => r.value);

    if (results.length === 0) { await message.reply("❌ Couldn't fetch any videos right now."); return; }
    for (let i = 0; i < results.length; i += 5) {
      const lines = results.slice(i, i + 5).map(
        (r, j) => `[Content ${i + j + 1}](${r.url}) | [Source](<${r.post}>)`,
      );
      await message.reply({ content: lines.join("\n") });
    }
    return;
  }

  // Images: kick off ALL downloads simultaneously, pipeline in batches of 5.
  const allTasks = Array.from({ length: count }, () => fetchAndDownload(fetcher, false));
  let sent = false;

  for (let i = 0; i < allTasks.length; i += 5) {
    const batchResults = await Promise.allSettled(allTasks.slice(i, i + 5));
    const items = batchResults
      .filter((r): r is PromiseFulfilledResult<{ buffer: Buffer; ext: string; post: string }> =>
        r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value);

    if (items.length > 0) {
      const files = items.map((item, j) =>
        new AttachmentBuilder(item.buffer, { name: `nsfw_${i + j + 1}.${item.ext}` }),
      );
      await message.reply({ files });
      sent = true;
    }
  }

  if (!sent) await message.reply("❌ Couldn't fetch any images right now.");
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
  let fetcher: (video: boolean) => Promise<NsfwResult | null>;

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

  // ── Single video — Lawliet-style: [Content 1](url) | [Source](<post>) ──────
  if (wantVideo) {
    const result = await fetcher(true);
    if (!result) { await message.reply("❌ Couldn't fetch right now. Try again in a moment."); return; }
    await message.reply({ content: `[Content 1](${result.url}) | [Source](<${result.post}>)` });
    return;
  }

  // ── Single image: download + re-upload ───────────────────────────────────
  // fetchAndDownload retries 4× internally, then we fall back to a hard-coded
  // random category so the user *always* gets content — never an error message.
  let media = await fetchAndDownload(fetcher, false);

  if (!media) {
    // Fetcher (freeform or specific category) exhausted — silently use a random category
    const fallbackCat = pick(VALID_CATS.filter(c => c !== "random"));
    media = await fetchAndDownload((v) => fetchNsfwUrl(fallbackCat, v), false);
  }

  if (media) {
    await message.reply({ files: [new AttachmentBuilder(media.buffer, { name: `nsfw.${media.ext}` })] });
    return;
  }

  // True last resort: all sources are down (extremely rare — Railway network issue)
  await message.reply("⏳ Sources are slow right now — try again in a few seconds.");
}
