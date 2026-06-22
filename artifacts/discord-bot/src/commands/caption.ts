import { Message, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Font registration ───────────────────────────────────────────────────────
let fontsRegistered = false;
let boldFontName = "Anton";

function registerFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  try {
    // 1. Bundled Anton (free Impact-style font — always available)
    const anton = resolve(__dirname, "../assets/Anton-Regular.ttf");
    if (existsSync(anton)) {
      GlobalFonts.registerFromPath(anton, "Anton");
      boldFontName = "Anton";
      return;
    }
    // 2. System Impact
    const impactPaths = [
      "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
      "/usr/share/fonts/truetype/impact.ttf",
    ];
    for (const p of impactPaths) {
      if (existsSync(p)) {
        GlobalFonts.registerFromPath(p, "Impact");
        boldFontName = "Impact";
        return;
      }
    }
    // 3. Bundled NotoSans-Bold fallback
    const noto = resolve(__dirname, "../assets/NotoSans-Bold.ttf");
    if (existsSync(noto)) {
      GlobalFonts.registerFromPath(noto, "NotoSansBold");
      boldFontName = "NotoSansBold";
    }
  } catch { /* fonts optional */ }
}

// ── Image resolution (shared with other commands) ──────────────────────────
export async function findImageUrl(message: Message): Promise<string | null> {
  const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);

  const attach = message.attachments.find(
    (a) => a.contentType?.startsWith("image/") || isImageUrl(a.url),
  );
  if (attach) return attach.url;

  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      const refAttach = ref.attachments.find(
        (a) => a.contentType?.startsWith("image/") || isImageUrl(a.url),
      );
      if (refAttach) return refAttach.url;
      for (const embed of ref.embeds) {
        if (embed.image?.url) return embed.image.url;
        if (embed.thumbnail?.url) return embed.thumbnail.url;
      }
    } catch { /* ignore */ }
  }

  for (const embed of message.embeds) {
    if (embed.image?.url) return embed.image.url;
    if (embed.thumbnail?.url) return embed.thumbnail.url;
  }

  return null;
}

// ── Auto-sizing font helper ─────────────────────────────────────────────────
// Finds the largest font size where text fits within maxWidth.
// Returns { fontSize, lines } — may split to multiple lines if single-line
// won't fit even at minSize.
function fitText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  fontFamily: string,
  maxFontSize = 120,
  minFontSize = 24,
): { fontSize: number; lines: string[] } {
  // Try single-line first: shrink font until it fits
  for (let fs = maxFontSize; fs >= minFontSize; fs -= 2) {
    ctx.font = `bold ${fs}px "${fontFamily}"`;
    if (ctx.measureText(text).width <= maxWidth) {
      return { fontSize: fs, lines: [text] };
    }
  }

  // Still doesn't fit at min size single-line → wrap at minFontSize
  ctx.font = `bold ${minFontSize}px "${fontFamily}"`;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return { fontSize: minFontSize, lines };
}

// ── Constants ──────────────────────────────────────────────────────────────
const MAX_IMG_W = 800;
const PAD_X     = 24;   // horizontal padding inside caption bar
const PAD_Y     = 20;   // vertical padding (top + bottom)

// ── Main command handler ───────────────────────────────────────────────────
export async function handleCaptionCommand(message: Message): Promise<void> {
  const parts = message.content.trim().split(/\s+/);
  const captionText = parts.slice(1).join(" ").trim();

  if (!captionText) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setDescription(
            "❌ Provide caption text.\n" +
            "**Usage:** `?caption <text>` — reply to or attach an image.\n" +
            "**Example:** `?caption pov: what my lil bro watches`",
          ),
      ],
    });
    return;
  }

  const imageUrl = await findImageUrl(message);
  if (!imageUrl) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setDescription(
            "❌ No image found.\n" +
            "Attach an image to your message, or reply to a message that has one.",
          ),
      ],
    });
    return;
  }

  try {
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!imgRes.ok) throw new Error(`Image fetch: ${imgRes.status}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    registerFonts();

    const srcImg = await loadImage(imgBuf);

    // Scale image so width ≤ MAX_IMG_W
    const scale = srcImg.width > MAX_IMG_W ? MAX_IMG_W / srcImg.width : 1;
    const imgW  = Math.round(srcImg.width  * scale);
    const imgH  = Math.round(srcImg.height * scale);

    // ── Measure: find largest font that fits ──────────────────────────────
    const measureC = createCanvas(imgW, 200);
    const mctx     = measureC.getContext("2d");

    // Real Assyst caps around 60–65px — start there, shrink if it wraps
    const maxFs = Math.min(64, Math.round(imgW * 0.09));

    const { fontSize, lines } = fitText(
      mctx,
      captionText,
      imgW - PAD_X * 2,
      boldFontName,
      maxFs,
      20,
    );

    const lineH = Math.round(fontSize * 1.2);
    const barH  = PAD_Y * 2 + lines.length * lineH;

    // ── Compose final canvas ──────────────────────────────────────────────
    const canvas = createCanvas(imgW, barH + imgH);
    const ctx    = canvas.getContext("2d");

    // White caption bar
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, imgW, barH);

    // Bold black text, horizontally centered, vertically centered in bar
    ctx.fillStyle    = "#000000";
    ctx.font         = `bold ${fontSize}px "${boldFontName}"`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    const textBlockH = lines.length * lineH;
    const textStartY = (barH - textBlockH) / 2 + lineH / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], imgW / 2, textStartY + i * lineH);
    }

    // Source image below the bar
    ctx.drawImage(srcImg, 0, barH, imgW, imgH);

    const outBuf = canvas.toBuffer("image/png");
    const file   = new AttachmentBuilder(outBuf, { name: "caption.png" });
    await message.reply({ files: [file] });

  } catch (err) {
    console.error("[CAPTION]", err);
    await message.reply("❌ Couldn't generate caption. Try again in a moment.");
  }
}
