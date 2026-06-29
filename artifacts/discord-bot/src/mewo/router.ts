import type { Message } from "discord.js";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { handleHelp } from "./help.js";
import { checkCooldown } from "./cooldowns.js";
import { isChannelEnabled, getEnabledChannels, enableChannel, disableChannel } from "./store.js";
import {
  cmd8ball, cmdCoinflip, cmdRate, cmdHotcalc, cmdHowgay, cmdHowautistic,
  cmdPpsize, cmdShip, cmdSay, cmdRizz, cmdRoast, cmdMath, cmdAsciify,
  cmdUrban, cmdLyrics, cmdNitro, cmdBadtranslate, cmdEmojimix,
} from "./modules/fun.js";
import {
  cmdBaka, cmdBite, cmdCry, cmdCuddle, cmdFeed, cmdHandhold, cmdHandshake,
  cmdHighfive, cmdHug, cmdKick, cmdKiss, cmdPat, cmdPeck, cmdPoke,
  cmdPunch, cmdShoot, cmdSlap, cmdRoleplayHelp,
} from "./modules/roleplay.js";
import {
  cmdBase64Encode, cmdBase64Decode, cmdAvatar, cmdBanner, cmdPing,
  cmdDiscordUser, cmdTimezoneSet, cmdTimezoneView, cmdQrGenerate, cmdQrScan,
  cmdConvertId2User, cmdConvertUser2Id, cmdIpLookup, cmdIpPing, cmdDomainLookup,
  cmdTranslate, cmdMe, cmdAbout, cmdInvite, cmdCustomizeColor,
} from "./modules/utility.js";
import {
  cmdChatgpt, cmdLlama, cmdAiUsage, cmdOcr, cmdScreenshot, cmdDownload,
  cmdGrokImagine, cmdPerplexity, cmdTtsOpenai, cmdTtsElevenlabs, cmdDeepGeolocate,
  cmdDeepseek,
} from "./modules/ai.js";
import {
  cmdRps, cmdTictactoe, cmdBlackjack, cmdCookie, cmdSnake,
} from "./modules/games.js";
import {
  cmdGithub, cmdMinecraftServer, cmdMinecraftUser, cmdMinecraftSkin,
  cmdMinecraftRandomserver, cmdYoutube, cmdSteam, cmdSoundcloud,
} from "./modules/search.js";
import {
  cmdTagCreate, cmdTagDelete, cmdTagEdit, cmdTagList, cmdTagSend,
} from "./modules/tags.js";
import {
  cmdFakeMessage, cmdFakeReply, cmdFakeQuote,
} from "./modules/fake.js";
import {
  cmdShazam, cmdBypass, cmdSocialscan, cmdSherlock,
} from "./modules/social.js";
import {
  cmdWallet, cmdWalletDaily, cmdWalletPay, cmdWalletLeaderboard, cmdWalletGamble,
} from "./modules/wallet.js";

type Handler = (msg: Message, args: string[]) => Promise<void>;

const PREFIX = "mewo";

const CD_AI_TEXT_S = 8;
const CD_AI_MEDIA_S = 15;
const CD_WALLET_GAMBLE_S = 5;
const CD_WALLET_DAILY_S = 3;

function cooldownReply(msg: Message, seconds: number): Promise<void> {
  return msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFEE75C)
      .setDescription(`⏳ Slow down! Wait **${seconds}s** before using this command again.`)
      .setFooter({ text: "mewo • cooldown" })
    ],
  }).then(() => {});
}

function unknownCmd(group?: string): Handler {
  return async (msg) => {
    await msg.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(group
          ? `❌ Unknown \`${group}\` subcommand. Try \`mewo help ${group}\``
          : "❌ Unknown command. Use `mewo help` to see all commands.")
        .setFooter({ text: "mewo" })
      ],
    });
  };
}

// ─── Sub-command maps ─────────────────────────────────────────────────────────

const AI_CMDS: Record<string, Handler> = {
  chatgpt: cmdChatgpt,
  llama: cmdLlama,
  deepseek: cmdDeepseek,
  usage: cmdAiUsage,
  ocr: cmdOcr,
  screenshot: cmdScreenshot,
  download: cmdDownload,
  "grok-imagine": cmdGrokImagine,
  imagine: cmdGrokImagine,
  geolocate: cmdDeepGeolocate,
  deepgeolocate: cmdDeepGeolocate,
  perplexity: cmdPerplexity,
};

const AI_TTS_CMDS: Record<string, Handler> = {
  elevenlabs: cmdTtsElevenlabs,
  openai: cmdTtsOpenai,
};

const BASE64_CMDS: Record<string, Handler> = {
  encode: cmdBase64Encode,
  decode: cmdBase64Decode,
};

const GAMES_CMDS: Record<string, Handler> = {
  rps: cmdRps,
  tictactoe: cmdTictactoe,
  blackjack: cmdBlackjack,
  cookie: cmdCookie,
  snake: cmdSnake,
};

const ROLEPLAY_CMDS: Record<string, Handler> = {
  baka: cmdBaka, bite: cmdBite, cry: cmdCry, cuddle: cmdCuddle,
  feed: cmdFeed, handhold: cmdHandhold, handshake: cmdHandshake,
  highfive: cmdHighfive, hug: cmdHug, kick: cmdKick, kiss: cmdKiss,
  pat: cmdPat, peck: cmdPeck, poke: cmdPoke, punch: cmdPunch,
  shoot: cmdShoot, slap: cmdSlap, help: cmdRoleplayHelp,
};

// Direct shortcut set — allows `mewo hug @user` without needing `mewo roleplay hug`
const ROLEPLAY_SHORTCUTS = new Set([
  "baka", "bite", "cry", "cuddle", "feed", "handhold", "handshake",
  "highfive", "hug", "kick", "kiss", "pat", "peck", "poke", "punch",
  "shoot", "slap",
]);

const SEARCH_CMDS: Record<string, Handler> = {
  youtube: cmdYoutube,
  github: cmdGithub,
  steam: cmdSteam,
  soundcloud: cmdSoundcloud,
};

const MINECRAFT_CMDS: Record<string, Handler> = {
  server: cmdMinecraftServer,
  user: cmdMinecraftUser,
  skin: cmdMinecraftSkin,
  randomserver: cmdMinecraftRandomserver,
};

const TAGS_CMDS: Record<string, Handler> = {
  create: cmdTagCreate,
  delete: cmdTagDelete,
  edit: cmdTagEdit,
  list: cmdTagList,
  send: cmdTagSend,
};

const TIMEZONE_CMDS: Record<string, Handler> = {
  set: cmdTimezoneSet,
  view: cmdTimezoneView,
};

const CONVERT_CMDS: Record<string, Handler> = {
  discordid2user: cmdConvertId2User,
  discorduser2id: cmdConvertUser2Id,
};

const QR_CMDS: Record<string, Handler> = {
  generate: cmdQrGenerate,
  scan: cmdQrScan,
};

const CUSTOMIZE_CMDS: Record<string, Handler> = {
  color: cmdCustomizeColor,
  wallet: cmdWallet,
};

const DISCORD_CMDS: Record<string, Handler> = {
  user: cmdDiscordUser,
};

const IP_CMDS: Record<string, Handler> = {
  lookup: cmdIpLookup,
  ping: cmdIpPing,
};

const DOMAIN_CMDS: Record<string, Handler> = {
  lookup: cmdDomainLookup,
};

const FAKE_CMDS: Record<string, Handler> = {
  message: cmdFakeMessage,
  msg: cmdFakeMessage,
  reply: cmdFakeReply,
  quote: cmdFakeQuote,
};

const WALLET_CMDS: Record<string, Handler> = {
  balance: cmdWallet,
  daily: cmdWalletDaily,
  pay: cmdWalletPay,
  leaderboard: cmdWalletLeaderboard,
  lb: cmdWalletLeaderboard,
  gamble: cmdWalletGamble,
  bet: cmdWalletGamble,
};

// ─── Main router ──────────────────────────────────────────────────────────────

export async function handleMewoCommand(message: Message): Promise<boolean> {
  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (!lower.startsWith(PREFIX)) return false;
  const afterPrefix = content.slice(PREFIX.length);
  if (afterPrefix !== "" && afterPrefix[0] !== " ") return false;

  const rest = afterPrefix.trim();
  const parts = rest ? rest.split(/\s+/) : [];
  const cmd = parts[0]?.toLowerCase() ?? "";
  const args = parts.slice(1);

  // ── Channel gating ───────────────────────────────────────────────────────────
  const enabledChannels = await getEnabledChannels();
  if (enabledChannels.length > 0 && !enabledChannels.includes(message.channelId)) {
    return true;
  }

  if (!cmd || cmd === "help") {
    await handleHelp(message, args).catch(console.error);
    return true;
  }

  if (cmd === "enable") {
    if (!message.guildId) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ Server-only.")] }); return true; }
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You need Administrator permission.")] }); return true; }
    await enableChannel(message.channelId);
    await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("mewo — Channel Enabled")
        .setDescription(`mewo commands are now **enabled** in <#${message.channelId}>.\n\nOnce any channel is enabled, mewo will only respond in enabled channels.`)
        .setFooter({ text: "mewo" })
      ],
    });
    return true;
  }

  if (cmd === "disable") {
    if (!message.guildId) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ Server-only.")] }); return true; }
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You need Administrator permission.")] }); return true; }
    await disableChannel(message.channelId);
    const remaining = await getEnabledChannels();
    await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("mewo — Channel Disabled")
        .setDescription(
          `mewo commands are now **disabled** in <#${message.channelId}>.\n\n` +
          (remaining.length === 0
            ? "No enabled channels remain — mewo is now **active everywhere**."
            : `Still active in: ${remaining.map(id => `<#${id}>`).join(", ")}`)
        )
        .setFooter({ text: "mewo" })
      ],
    });
    return true;
  }

  try {
    // ── Roleplay direct shortcuts ─────────────────────────────────────────────
    if (ROLEPLAY_SHORTCUTS.has(cmd)) {
      const handler = ROLEPLAY_CMDS[cmd];
      if (handler) { await handler(message, args); return true; }
    }

    switch (cmd) {

      // ── Fun ──────────────────────────────────────────────────────────────────
      case "8ball":        await cmd8ball(message, args);        break;
      case "coinflip":     await cmdCoinflip(message, args);     break;
      case "rate":         await cmdRate(message, args);          break;
      case "hotcalc":      await cmdHotcalc(message, args);      break;
      case "howgay":       await cmdHowgay(message, args);       break;
      case "howautistic":  await cmdHowautistic(message, args);  break;
      case "ppsize":       await cmdPpsize(message, args);       break;
      case "ship":         await cmdShip(message, args);         break;
      case "say":          await cmdSay(message, args);          break;
      case "rizz":         await cmdRizz(message, args);         break;
      case "roast":        await cmdRoast(message, args);        break;
      case "math":         await cmdMath(message, args);         break;
      case "asciify":      await cmdAsciify(message, args);      break;
      case "urban":        await cmdUrban(message, args);        break;
      case "lyrics":       await cmdLyrics(message, args);       break;
      case "nitro":        await cmdNitro(message, args);        break;
      case "badtranslate": await cmdBadtranslate(message, args); break;
      case "emojimix":     await cmdEmojimix(message, args);     break;

      // ── Utility ──────────────────────────────────────────────────────────────
      case "ping":      await cmdPing(message, args);      break;
      case "avatar":    await cmdAvatar(message, args);    break;
      case "banner":    await cmdBanner(message, args);    break;
      case "me":        await cmdMe(message, args);        break;
      case "about":     await cmdAbout(message, args);     break;
      case "invite":    await cmdInvite(message, args);    break;
      case "translate": await cmdTranslate(message, args); break;

      // ── Social ───────────────────────────────────────────────────────────────
      case "shazam":      await cmdShazam(message, args);      break;
      case "bypass":      await cmdBypass(message, args);      break;
      case "socialscan":  await cmdSocialscan(message, args);  break;
      case "sherlock":    await cmdSherlock(message, args);    break;
      case "soundcloud":  await cmdSoundcloud(message, args);  break;

      // ── Groups ───────────────────────────────────────────────────────────────

      case "ai": {
        const sub = args[0]?.toLowerCase();
        if (sub === "tts") {
          const subSub = args[1]?.toLowerCase();
          const h = subSub ? AI_TTS_CMDS[subSub] : null;
          if (h) await h(message, args.slice(2));
          else {
            await message.reply({
              embeds: [new EmbedBuilder().setColor(0xED4245)
                .setDescription("❌ Usage: `mewo ai tts openai <text>` or `mewo ai tts elevenlabs <text>`")]
            });
          }
          break;
        }
        if (sub === "chatgpt" || sub === "llama" || sub === "deepseek") {
          const cd = checkCooldown(message.author.id, `ai_${sub}`, CD_AI_TEXT_S);
          if (cd !== false) { await cooldownReply(message, cd); break; }
        }
        if (sub === "imagine" || sub === "screenshot" || sub === "download") {
          const cd = checkCooldown(message.author.id, `ai_${sub}`, CD_AI_MEDIA_S);
          if (cd !== false) { await cooldownReply(message, cd); break; }
        }
        const h = sub ? AI_CMDS[sub] : null;
        if (h) await h(message, args.slice(1));
        else await unknownCmd("ai")(message, args);
        break;
      }

      case "base64": {
        const h = BASE64_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else {
          await message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245)
              .setDescription("❌ Usage: `mewo base64 encode <text>` or `mewo base64 decode <string>`")]
          });
        }
        break;
      }

      case "games": {
        const h = GAMES_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else await unknownCmd("games")(message, args);
        break;
      }

      case "roleplay": {
        const h = ROLEPLAY_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else await cmdRoleplayHelp(message, args);
        break;
      }

      case "search": {
        const sub = args[0]?.toLowerCase();
        if (sub === "minecraft") {
          const mcSub = args[1]?.toLowerCase();
          const h = mcSub ? MINECRAFT_CMDS[mcSub] : null;
          if (h) await h(message, args.slice(2));
          else {
            await message.reply({
              embeds: [new EmbedBuilder().setColor(0xED4245)
                .setDescription("❌ Usage: `mewo search minecraft server/user/skin/randomserver <...>`")]
            });
          }
        } else {
          const h = sub ? SEARCH_CMDS[sub] : null;
          if (h) await h(message, args.slice(1));
          else await unknownCmd("search")(message, args);
        }
        break;
      }

      case "tags": {
        const h = TAGS_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else await unknownCmd("tags")(message, args);
        break;
      }

      case "timezone": {
        const h = TIMEZONE_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else {
          await message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245)
              .setDescription("❌ Usage: `mewo timezone set <tz>` or `mewo timezone view [tz/@user]`")]
          });
        }
        break;
      }

      case "convert": {
        const h = CONVERT_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else {
          await message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245)
              .setDescription("❌ Usage: `mewo convert discordid2user <id>` or `mewo convert discorduser2id @user`")]
          });
        }
        break;
      }

      case "qr": {
        const h = QR_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else await unknownCmd("qr")(message, args);
        break;
      }

      case "customize": {
        const h = CUSTOMIZE_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else await unknownCmd("customize")(message, args);
        break;
      }

      case "discord": {
        const h = DISCORD_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else await unknownCmd("discord")(message, args);
        break;
      }

      case "ip": {
        const h = IP_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else {
          await message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245)
              .setDescription("❌ Usage: `mewo ip lookup <ip>` or `mewo ip ping <host>`")]
          });
        }
        break;
      }

      case "domain": {
        const h = DOMAIN_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else {
          await message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245)
              .setDescription("❌ Usage: `mewo domain lookup <domain>`")]
          });
        }
        break;
      }

      case "fake": {
        const h = FAKE_CMDS[args[0]?.toLowerCase()];
        if (h) await h(message, args.slice(1));
        else {
          await message.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle("Fake Media Generation")
              .setDescription(
                "`mewo fake message @user <text>` — Fake Discord message\n" +
                "`mewo fake reply @replied_to @author <text>` — Fake reply\n" +
                "`mewo fake quote @user <text>` — Fake quote card"
              )
              .setFooter({ text: "mewo • fake" })
            ],
          });
        }
        break;
      }

      case "wallet": {
        const sub = args[0]?.toLowerCase();
        if (sub === "gamble" || sub === "bet") {
          const cd = checkCooldown(message.author.id, "wallet_gamble", CD_WALLET_GAMBLE_S);
          if (cd !== false) { await cooldownReply(message, cd); break; }
        }
        if (sub === "daily") {
          const cd = checkCooldown(message.author.id, "wallet_daily", CD_WALLET_DAILY_S);
          if (cd !== false) { await cooldownReply(message, cd); break; }
        }
        if (!sub) { await cmdWallet(message, []); break; }
        const h = WALLET_CMDS[sub];
        if (h) await h(message, args.slice(1));
        else await unknownCmd("wallet")(message, args);
        break;
      }

      case "settings": await cmdAbout(message, args); break;

      // ── AI direct shortcuts (no need for `mewo ai` prefix) ───────────────
      case "imagine":
      case "generate": {
        const cd = checkCooldown(message.author.id, "ai_imagine", CD_AI_MEDIA_S);
        if (cd !== false) { await cooldownReply(message, cd); break; }
        await cmdGrokImagine(message, args);
        break;
      }
      case "chatgpt": {
        const cd = checkCooldown(message.author.id, "ai_chatgpt", CD_AI_TEXT_S);
        if (cd !== false) { await cooldownReply(message, cd); break; }
        await cmdChatgpt(message, args);
        break;
      }
      case "deepseek": {
        const cd = checkCooldown(message.author.id, "ai_deepseek", CD_AI_TEXT_S);
        if (cd !== false) { await cooldownReply(message, cd); break; }
        await cmdDeepseek(message, args);
        break;
      }
      case "llama": {
        const cd = checkCooldown(message.author.id, "ai_llama", CD_AI_TEXT_S);
        if (cd !== false) { await cooldownReply(message, cd); break; }
        await cmdLlama(message, args);
        break;
      }
      case "perplexity": {
        const cd = checkCooldown(message.author.id, "ai_perplexity", CD_AI_TEXT_S);
        if (cd !== false) { await cooldownReply(message, cd); break; }
        await cmdPerplexity(message, args);
        break;
      }
      case "ocr":
        await cmdOcr(message, args);
        break;
      case "screenshot": {
        const cd = checkCooldown(message.author.id, "ai_screenshot", CD_AI_MEDIA_S);
        if (cd !== false) { await cooldownReply(message, cd); break; }
        await cmdScreenshot(message, args);
        break;
      }
      case "download": {
        const cd = checkCooldown(message.author.id, "ai_download", CD_AI_MEDIA_S);
        if (cd !== false) { await cooldownReply(message, cd); break; }
        await cmdDownload(message, args);
        break;
      }
      case "tts": {
        const sub = args[0]?.toLowerCase();
        const h = sub ? AI_TTS_CMDS[sub] : null;
        if (h) await h(message, args.slice(1));
        else {
          await message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245)
              .setDescription("❌ Usage: `mewo tts openai <text>` or `mewo tts elevenlabs <text>`")]
          });
        }
        break;
      }

      default:
        await message.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xFEE75C)
            .setDescription(`Unknown command \`${cmd}\`. Use \`mewo help\` to see all available commands.`)
            .setFooter({ text: "mewo" })
          ],
        });
    }
  } catch (e) {
    console.error(`[MEWO] Error in command "${cmd}":`, e);
    await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription("❌ An unexpected error occurred. Please try again.")
        .setFooter({ text: "mewo" })
      ],
    }).catch(() => {});
  }

  return true;
}
