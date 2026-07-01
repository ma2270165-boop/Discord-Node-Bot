import type { Message, Client, GuildChannel, Guild } from "discord.js";
import { EmbedBuilder, PermissionFlagsBits, ChannelType, OverwriteType } from "discord.js";
import { getPool } from "../persistence.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface PermOverwrite {
  id: string;
  type: number;   // OverwriteType.Role = 0, OverwriteType.Member = 1
  allow: string;  // BigInt serialised as string
  deny: string;
}

interface RoleSnap {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string;
  iconURL: string | null;
  unicodeEmoji: string | null;
  position: number;
  managed: boolean;
  isEveryone: boolean;
}

interface ChannelSnap {
  id: string;
  name: string;
  type: number;
  position: number;
  parentId: string | null;
  topic: string | null;
  nsfw: boolean;
  rateLimitPerUser: number;
  bitrate: number | null;
  userLimit: number | null;
  permissionOverwrites: PermOverwrite[];
  defaultAutoArchiveDuration: number | null;
}

interface EmojiSnap {
  id: string;
  name: string;
  imageURL: string;
  animated: boolean;
  managed: boolean;
  roleIds: string[];
}

interface StickerSnap {
  id: string;
  name: string;
  description: string | null;
  tags: string;
  url: string;
  format: number;
}

interface SoundSnap {
  soundId: string;
  name: string;
  volume: number;
  emojiId: string | null;
  emojiName: string | null;
  url: string;
}

interface GuildSnap {
  name: string;
  description: string | null;
  iconURL: string | null;
  bannerURL: string | null;
  splashURL: string | null;
  afkTimeout: number;
  verificationLevel: number;
  explicitContentFilter: number;
  defaultMessageNotifications: number;
  preferredLocale: string;
}

interface ServerSnapshot {
  takenAt: number;
  guildId: string;
  guild: GuildSnap;
  roles: RoleSnap[];
  channels: ChannelSnap[];  // categories first, then others
  emojis: EmojiSnap[];
  stickers: StickerSnap[];
  soundboard: SoundSnap[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const SNAPSHOT_KEY = (guildId: string) => `server_snapshot:${guildId}`;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const DELAY = 600; // ms between Discord API calls to stay under rate limits

async function saveSnapshot(guildId: string, snap: ServerSnapshot): Promise<void> {
  await getPool().query(
    `INSERT INTO bot_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [SNAPSHOT_KEY(guildId), JSON.stringify(snap)],
  );
}

async function loadSnapshot(guildId: string): Promise<ServerSnapshot | null> {
  const res = await getPool().query<{ value: ServerSnapshot }>(
    "SELECT value FROM bot_kv WHERE key = $1",
    [SNAPSHOT_KEY(guildId)],
  );
  return res.rows[0]?.value ?? null;
}

function channelToSnap(ch: GuildChannel): ChannelSnap {
  const overwrites: PermOverwrite[] = [];
  if ("permissionOverwrites" in ch) {
    ch.permissionOverwrites.cache.forEach(ow => {
      overwrites.push({
        id: ow.id,
        type: ow.type,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
      });
    });
  }
  return {
    id: ch.id,
    name: ch.name,
    type: ch.type,
    position: "position" in ch ? (ch.position as number) : 0,
    parentId: "parentId" in ch ? ((ch.parentId as string | null) ?? null) : null,
    topic: "topic" in ch ? ((ch.topic as string | null) ?? null) : null,
    nsfw: "nsfw" in ch ? (ch.nsfw as boolean) : false,
    rateLimitPerUser: "rateLimitPerUser" in ch ? (ch.rateLimitPerUser as number) : 0,
    bitrate: "bitrate" in ch ? (ch.bitrate as number) : null,
    userLimit: "userLimit" in ch ? (ch.userLimit as number | null) : null,
    permissionOverwrites: overwrites,
    defaultAutoArchiveDuration: "defaultAutoArchiveDuration" in ch
      ? ((ch.defaultAutoArchiveDuration as number | null) ?? null)
      : null,
  };
}

function remapOverwrites(
  overwrites: PermOverwrite[],
  roleIdMap: Map<string, string>,
): { id: string; type: OverwriteType; allow: bigint; deny: bigint }[] {
  return overwrites.map(ow => ({
    id: ow.type === OverwriteType.Role ? (roleIdMap.get(ow.id) ?? ow.id) : ow.id,
    type: ow.type as OverwriteType,
    allow: BigInt(ow.allow),
    deny: BigInt(ow.deny),
  }));
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ── ?copy ────────────────────────────────────────────────────────────────────

export async function handleCopyCommand(message: Message, _client: Client): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setDescription("❌ You need **Administrator** to use `?copy`.")]});
    return;
  }

  const status = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00)
    .setTitle("⏳ Capturing Server Snapshot")
    .setDescription("Reading all roles, channels, emojis, stickers and soundboard…\nThis may take a moment.")]});

  try {
    const guild = message.guild;

    await Promise.all([
      guild.roles.fetch(),
      guild.channels.fetch(),
      guild.emojis.fetch(),
      guild.stickers.fetch(),
    ]);

    // ── Roles ────────────────────────────────────────────────────────────────
    const roles: RoleSnap[] = guild.roles.cache
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        iconURL: r.iconURL({ size: 256 }) ?? null,
        unicodeEmoji: r.unicodeEmoji ?? null,
        position: r.position,
        managed: r.managed,
        isEveryone: r.id === guild.id,
      }))
      .filter(r => !r.managed);

    // ── Channels (categories first, then the rest) ────────────────────────────
    const sorted = [...guild.channels.cache.values()].sort(
      (a, b) => ((a as GuildChannel).position ?? 0) - ((b as GuildChannel).position ?? 0),
    ) as GuildChannel[];

    const channels: ChannelSnap[] = [
      ...sorted.filter(c => c.type === ChannelType.GuildCategory).map(channelToSnap),
      ...sorted.filter(c => c.type !== ChannelType.GuildCategory).map(channelToSnap),
    ];

    // ── Emojis ───────────────────────────────────────────────────────────────
    const emojis: EmojiSnap[] = guild.emojis.cache
      .filter(e => !e.managed)
      .map(e => ({
        id: e.id,
        name: e.name ?? "unknown",
        imageURL: e.imageURL({ size: 256, extension: e.animated ? "gif" : "png" }),
        animated: e.animated ?? false,
        managed: e.managed ?? false,
        roleIds: [...e.roles.cache.keys()],
      }));

    // ── Stickers ──────────────────────────────────────────────────────────────
    const stickers: StickerSnap[] = guild.stickers.cache.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags ?? "",
      url: s.url,
      format: s.format,
    }));

    // ── Soundboard ────────────────────────────────────────────────────────────
    let soundboard: SoundSnap[] = [];
    try {
      const sounds = await guild.soundboardSounds.fetch();
      soundboard = sounds
        .filter(s => !s.soundId.startsWith("default_"))
        .map(s => ({
          soundId: s.soundId,
          name: s.name,
          volume: s.volume,
          emojiId: s.emoji?.id ?? null,
          emojiName: s.emoji?.name ?? null,
          url: `https://cdn.discordapp.com/soundboard-sounds/${s.soundId}`,
        }));
    } catch { /* soundboard optional — may need intent */ }

    // ── Guild metadata ────────────────────────────────────────────────────────
    const guildSnap: GuildSnap = {
      name: guild.name,
      description: guild.description,
      iconURL: guild.iconURL({ size: 512, extension: "png" }),
      bannerURL: guild.bannerURL({ size: 1024, extension: "png" }) ?? null,
      splashURL: guild.splashURL({ size: 1024, extension: "png" }) ?? null,
      afkTimeout: guild.afkTimeout,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      preferredLocale: guild.preferredLocale,
    };

    const snap: ServerSnapshot = {
      takenAt: Date.now(),
      guildId: guild.id,
      guild: guildSnap,
      roles,
      channels,
      emojis,
      stickers,
      soundboard,
    };

    await saveSnapshot(guild.id, snap);

    const cats = channels.filter(c => c.type === ChannelType.GuildCategory);
    const nonCats = channels.filter(c => c.type !== ChannelType.GuildCategory);

    await status.edit({ embeds: [new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle("✅ Server Snapshot Saved")
      .setDescription(`Snapshot taken at <t:${Math.floor(snap.takenAt / 1000)}:T>. Use \`?paste\` to restore missing items.`)
      .addFields(
        { name: "🎭 Roles",      value: `**${roles.filter(r => !r.isEveryone).length}** captured`, inline: true },
        { name: "📁 Categories", value: `**${cats.length}** captured`,                             inline: true },
        { name: "💬 Channels",   value: `**${nonCats.length}** captured`,                          inline: true },
        { name: "😀 Emojis",    value: `**${emojis.length}** captured`,                            inline: true },
        { name: "🎨 Stickers",  value: `**${stickers.length}** captured`,                          inline: true },
        { name: "🔊 Soundboard", value: `**${soundboard.length}** captured`,                       inline: true },
      )
      .setFooter({ text: "Stored in DB — survives bot restarts. Snapshot is per-server." })]});

  } catch (err) {
    console.error("[COPY]", err);
    await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setTitle("❌ Snapshot Failed").setDescription(`${(err as Error).message}`)]});
  }
}

// ── ?paste ───────────────────────────────────────────────────────────────────

export async function handlePasteCommand(message: Message, client: Client): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setDescription("❌ You need **Administrator** to use `?paste`.")]});
    return;
  }

  const status = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00)
    .setTitle("⏳ Loading Snapshot")
    .setDescription("Reading saved snapshot from database…")]});

  try {
    const guild = message.guild;
    const snap  = await loadSnapshot(guild.id);

    if (!snap) {
      await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
        .setTitle("❌ No Snapshot Found")
        .setDescription("Run `?copy` first to save a snapshot of this server.")]});
      return;
    }

    const takenAt = new Date(snap.takenAt).toLocaleString();

    await status.edit({ embeds: [new EmbedBuilder().setColor(0xFFAA00)
      .setTitle("🔄 Restoring Server…")
      .setDescription(`Snapshot from **${takenAt}**\nCreating missing roles, categories, channels, emojis, stickers and sounds…\n*(This may take a while — please wait)*`)]});

    // Counters
    let rolesCreated = 0,    rolesSkipped = 0;
    let catsCreated  = 0,    catsSkipped  = 0;
    let chCreated    = 0,    chSkipped    = 0;
    let emojisCreated = 0,   emojisSkipped = 0;
    let stickersCreated = 0, stickersSkipped = 0;
    let soundsCreated = 0,   soundsSkipped = 0;
    const errors: string[] = [];

    // Refresh current guild state
    await Promise.all([
      guild.roles.fetch(),
      guild.channels.fetch(),
      guild.emojis.fetch(),
      guild.stickers.fetch(),
    ]);

    // Build lookup maps (by lowercase name)
    const existingRoles    = new Map(guild.roles.cache.map(r => [r.name.toLowerCase(), r]));
    const existingChannels = new Map(guild.channels.cache.map(c => [`${c.name.toLowerCase()}:${c.type}`, c]));
    const existingEmojis   = new Map(guild.emojis.cache.map(e => [e.name?.toLowerCase() ?? "", e]));
    const existingStickers = new Map(guild.stickers.cache.map(s => [s.name.toLowerCase(), s]));

    // Build role ID remap: old snapshot role ID → current server role ID
    const roleIdMap = new Map<string, string>();
    roleIdMap.set(snap.guildId, guild.id); // @everyone: old guildId → new guildId

    // Pre-populate map for roles that already exist in the server
    for (const r of guild.roles.cache.values()) {
      const match = snap.roles.find(sr => sr.name.toLowerCase() === r.name.toLowerCase());
      if (match) roleIdMap.set(match.id, r.id);
    }

    // ── Step 1: Roles ─────────────────────────────────────────────────────
    const rolesToCreate = snap.roles
      .filter(r => !r.isEveryone && !r.managed)
      .sort((a, b) => a.position - b.position);

    for (const r of rolesToCreate) {
      const existing = existingRoles.get(r.name.toLowerCase());
      if (existing) {
        roleIdMap.set(r.id, existing.id);
        rolesSkipped++;
        continue;
      }

      try {
        let icon: Buffer | undefined;
        if (r.iconURL) {
          try { icon = await downloadBuffer(r.iconURL); } catch { /* icon optional */ }
        }

        const created = await guild.roles.create({
          name:        r.name,
          color:       r.color,
          hoist:       r.hoist,
          mentionable: r.mentionable,
          permissions: BigInt(r.permissions),
          reason:      "?paste restore",
          ...(icon           ? { icon }                         : {}),
          ...(r.unicodeEmoji ? { unicodeEmoji: r.unicodeEmoji } : {}),
        });

        roleIdMap.set(r.id, created.id);
        existingRoles.set(r.name.toLowerCase(), created);
        rolesCreated++;
        await sleep(DELAY);
      } catch (e) {
        errors.push(`Role "${r.name}": ${(e as Error).message}`);
      }
    }

    // ── Step 2: Categories ────────────────────────────────────────────────
    const categoryIdMap = new Map<string, string>();

    // Pre-map existing categories
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildCategory) continue;
      const match = snap.channels.find(sc => sc.type === ChannelType.GuildCategory && sc.name.toLowerCase() === ch.name.toLowerCase());
      if (match) categoryIdMap.set(match.id, ch.id);
    }

    const snapCats = snap.channels
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const cat of snapCats) {
      const key = `${cat.name.toLowerCase()}:${cat.type}`;
      const existing = existingChannels.get(key);
      if (existing) {
        categoryIdMap.set(cat.id, existing.id);
        catsSkipped++;
        continue;
      }

      try {
        const created = await guild.channels.create({
          name:                cat.name,
          type:                ChannelType.GuildCategory,
          position:            cat.position,
          permissionOverwrites: remapOverwrites(cat.permissionOverwrites, roleIdMap),
          reason:              "?paste restore",
        });
        categoryIdMap.set(cat.id, created.id);
        existingChannels.set(key, created);
        catsCreated++;
        await sleep(DELAY);
      } catch (e) {
        errors.push(`Category "${cat.name}": ${(e as Error).message}`);
      }
    }

    // ── Step 3: Channels ──────────────────────────────────────────────────
    const snapChannels = snap.channels
      .filter(c => c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const ch of snapChannels) {
      const key = `${ch.name.toLowerCase()}:${ch.type}`;
      if (existingChannels.has(key)) {
        chSkipped++;
        continue;
      }

      try {
        const parentId = ch.parentId ? (categoryIdMap.get(ch.parentId) ?? null) : null;

        const opts: Parameters<typeof guild.channels.create>[0] = {
          name:                 ch.name,
          type:                 ch.type as ChannelType.GuildText,
          position:             ch.position,
          permissionOverwrites: remapOverwrites(ch.permissionOverwrites, roleIdMap),
          reason:               "?paste restore",
          ...(parentId                                        ? { parent: parentId }                                          : {}),
          ...(ch.topic                                        ? { topic: ch.topic }                                           : {}),
          ...(ch.nsfw                                         ? { nsfw: true }                                                : {}),
          ...(ch.rateLimitPerUser                             ? { rateLimitPerUser: ch.rateLimitPerUser }                     : {}),
          ...(ch.bitrate   !== null                           ? { bitrate: ch.bitrate }                                       : {}),
          ...(ch.userLimit !== null && ch.userLimit > 0       ? { userLimit: ch.userLimit }                                   : {}),
          ...(ch.defaultAutoArchiveDuration !== null           ? { defaultAutoArchiveDuration: ch.defaultAutoArchiveDuration } : {}),
        };

        const created = await guild.channels.create(opts);
        existingChannels.set(key, created);
        chCreated++;
        await sleep(DELAY);
      } catch (e) {
        errors.push(`Channel #${ch.name}: ${(e as Error).message}`);
      }
    }

    // ── Step 4: Emojis ────────────────────────────────────────────────────
    for (const emoji of snap.emojis) {
      if (existingEmojis.has(emoji.name.toLowerCase())) {
        emojisSkipped++;
        continue;
      }
      try {
        const image = await downloadBuffer(emoji.imageURL);
        // Remap role restrictions to current role IDs
        const roles = emoji.roleIds.map(id => roleIdMap.get(id) ?? id).filter(Boolean);
        await guild.emojis.create({
          attachment: image,
          name:       emoji.name,
          reason:     "?paste restore",
          ...(roles.length > 0 ? { roles } : {}),
        });
        emojisCreated++;
        await sleep(DELAY);
      } catch (e) {
        errors.push(`Emoji :${emoji.name}:: ${(e as Error).message}`);
      }
    }

    // ── Step 5: Stickers ──────────────────────────────────────────────────
    for (const sticker of snap.stickers) {
      if (existingStickers.has(sticker.name.toLowerCase())) {
        stickersSkipped++;
        continue;
      }
      try {
        const ext  = sticker.format === 3 ? "json" : "png";
        const file = await downloadBuffer(sticker.url);
        await guild.stickers.create({
          file:        { attachment: file, name: `sticker.${ext}` },
          name:        sticker.name,
          tags:        sticker.tags,
          description: sticker.description ?? "",
          reason:      "?paste restore",
        });
        stickersCreated++;
        await sleep(DELAY);
      } catch (e) {
        errors.push(`Sticker "${sticker.name}": ${(e as Error).message}`);
      }
    }

    // ── Step 6: Soundboard ────────────────────────────────────────────────
    try {
      const currentSounds = await guild.soundboardSounds.fetch();
      const existingSounds = new Map(currentSounds.map(s => [s.name.toLowerCase(), s]));

      for (const sound of snap.soundboard) {
        if (existingSounds.has(sound.name.toLowerCase())) {
          soundsSkipped++;
          continue;
        }
        try {
          const file = await downloadBuffer(sound.url);
          const base64 = `data:audio/ogg;base64,${file.toString("base64")}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (guild.soundboardSounds as any).create({
            name:      sound.name,
            sound:     base64,
            volume:    sound.volume,
            ...(sound.emojiId   ? { emojiId: sound.emojiId }     : {}),
            ...(sound.emojiName ? { emojiName: sound.emojiName } : {}),
          });
          soundsCreated++;
          await sleep(DELAY);
        } catch (e) {
          errors.push(`Sound "${sound.name}": ${(e as Error).message}`);
        }
      }
    } catch { /* soundboard optional */ }

    // ── Report ────────────────────────────────────────────────────────────
    void client; // suppress unused warning

    const embed = new EmbedBuilder()
      .setColor(errors.length === 0 ? 0x00FFFF : 0xFFAA00)
      .setTitle(errors.length === 0 ? "✅ Restore Complete" : "⚠️ Restore Complete (with some errors)")
      .setDescription(`Snapshot from **${takenAt}**`)
      .addFields(
        { name: "🎭 Roles",      value: `✅ ${rolesCreated} created\n⏭️ ${rolesSkipped} already exist`,    inline: true },
        { name: "📁 Categories", value: `✅ ${catsCreated} created\n⏭️ ${catsSkipped} already exist`,     inline: true },
        { name: "💬 Channels",   value: `✅ ${chCreated} created\n⏭️ ${chSkipped} already exist`,         inline: true },
        { name: "😀 Emojis",    value: `✅ ${emojisCreated} created\n⏭️ ${emojisSkipped} already exist`,  inline: true },
        { name: "🎨 Stickers",  value: `✅ ${stickersCreated} created\n⏭️ ${stickersSkipped} already exist`, inline: true },
        { name: "🔊 Soundboard", value: `✅ ${soundsCreated} created\n⏭️ ${soundsSkipped} already exist`, inline: true },
      );

    if (errors.length > 0) {
      const errText = errors.slice(0, 8).join("\n") + (errors.length > 8 ? `\n…and ${errors.length - 8} more` : "");
      embed.addFields({ name: `❌ Errors (${errors.length})`, value: `\`\`\`\n${errText}\n\`\`\``, inline: false });
    }

    await status.edit({ embeds: [embed] });

  } catch (err) {
    console.error("[PASTE]", err);
    await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setTitle("❌ Restore Failed").setDescription(`${(err as Error).message}`)]});
  }
}

// ── Auto-restore (called by anti-nuke after quarantine) ──────────────────────
//
// Runs the same logic as ?paste but headlessly — no Message needed.
// Returns an embed summarising the result so the caller can post it to the
// anti-nuke log channel.

export async function runPasteRestore(guild: Guild, client: Client): Promise<{ found: boolean; embed: EmbedBuilder }> {
  void client;

  const snap = await loadSnapshot(guild.id);
  if (!snap) {
    return {
      found: false,
      embed: new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle("⚠️ No ?copy Snapshot Found")
        .setDescription(
          "The anti-nuke fired but there is no saved `?copy` snapshot to restore from.\n" +
          "Run `?copy` after setting up your server so future nukes can be auto-restored.",
        ),
    };
  }

  const takenAt = new Date(snap.takenAt).toLocaleString();

  let rolesCreated = 0,    rolesSkipped = 0;
  let catsCreated  = 0,    catsSkipped  = 0;
  let chCreated    = 0,    chSkipped    = 0;
  let emojisCreated = 0,   emojisSkipped = 0;
  let stickersCreated = 0, stickersSkipped = 0;
  let soundsCreated = 0,   soundsSkipped = 0;
  const errors: string[] = [];

  await Promise.all([
    guild.roles.fetch(),
    guild.channels.fetch(),
    guild.emojis.fetch(),
    guild.stickers.fetch(),
  ]);

  const existingRoles    = new Map(guild.roles.cache.map(r => [r.name.toLowerCase(), r]));
  const existingChannels = new Map(guild.channels.cache.map(c => [`${c.name.toLowerCase()}:${c.type}`, c]));
  const existingEmojis   = new Map(guild.emojis.cache.map(e => [e.name?.toLowerCase() ?? "", e]));
  const existingStickers = new Map(guild.stickers.cache.map(s => [s.name.toLowerCase(), s]));

  const roleIdMap = new Map<string, string>();
  roleIdMap.set(snap.guildId, guild.id);
  for (const r of guild.roles.cache.values()) {
    const match = snap.roles.find(sr => sr.name.toLowerCase() === r.name.toLowerCase());
    if (match) roleIdMap.set(match.id, r.id);
  }

  // Step 1: Roles
  const rolesToCreate = snap.roles
    .filter(r => !r.isEveryone && !r.managed)
    .sort((a, b) => a.position - b.position);

  for (const r of rolesToCreate) {
    const existing = existingRoles.get(r.name.toLowerCase());
    if (existing) { roleIdMap.set(r.id, existing.id); rolesSkipped++; continue; }
    try {
      let icon: Buffer | undefined;
      if (r.iconURL) { try { icon = await downloadBuffer(r.iconURL); } catch { /* optional */ } }
      const created = await guild.roles.create({
        name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable,
        permissions: BigInt(r.permissions), reason: "Anti-Nuke auto-restore (?copy snapshot)",
        ...(icon ? { icon } : {}), ...(r.unicodeEmoji ? { unicodeEmoji: r.unicodeEmoji } : {}),
      });
      roleIdMap.set(r.id, created.id);
      existingRoles.set(r.name.toLowerCase(), created);
      rolesCreated++;
      await sleep(DELAY);
    } catch (e) { errors.push(`Role "${r.name}": ${(e as Error).message}`); }
  }

  // Step 2: Categories
  const categoryIdMap = new Map<string, string>();
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildCategory) continue;
    const match = snap.channels.find(sc => sc.type === ChannelType.GuildCategory && sc.name.toLowerCase() === ch.name.toLowerCase());
    if (match) categoryIdMap.set(match.id, ch.id);
  }

  const snapCats = snap.channels.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  for (const cat of snapCats) {
    const key = `${cat.name.toLowerCase()}:${cat.type}`;
    const existing = existingChannels.get(key);
    if (existing) { categoryIdMap.set(cat.id, existing.id); catsSkipped++; continue; }
    try {
      const created = await guild.channels.create({
        name: cat.name, type: ChannelType.GuildCategory, position: cat.position,
        permissionOverwrites: remapOverwrites(cat.permissionOverwrites, roleIdMap),
        reason: "Anti-Nuke auto-restore (?copy snapshot)",
      });
      categoryIdMap.set(cat.id, created.id);
      existingChannels.set(key, created);
      catsCreated++;
      await sleep(DELAY);
    } catch (e) { errors.push(`Category "${cat.name}": ${(e as Error).message}`); }
  }

  // Step 3: Channels
  const snapChannels = snap.channels.filter(c => c.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  for (const ch of snapChannels) {
    const key = `${ch.name.toLowerCase()}:${ch.type}`;
    if (existingChannels.has(key)) { chSkipped++; continue; }
    try {
      const parentId = ch.parentId ? (categoryIdMap.get(ch.parentId) ?? null) : null;
      const opts: Parameters<typeof guild.channels.create>[0] = {
        name: ch.name, type: ch.type as ChannelType.GuildText, position: ch.position,
        permissionOverwrites: remapOverwrites(ch.permissionOverwrites, roleIdMap),
        reason: "Anti-Nuke auto-restore (?copy snapshot)",
        ...(parentId ? { parent: parentId } : {}),
        ...(ch.topic ? { topic: ch.topic } : {}),
        ...(ch.nsfw ? { nsfw: true } : {}),
        ...(ch.rateLimitPerUser ? { rateLimitPerUser: ch.rateLimitPerUser } : {}),
        ...(ch.bitrate !== null ? { bitrate: ch.bitrate } : {}),
        ...(ch.userLimit !== null && ch.userLimit > 0 ? { userLimit: ch.userLimit } : {}),
        ...(ch.defaultAutoArchiveDuration !== null ? { defaultAutoArchiveDuration: ch.defaultAutoArchiveDuration } : {}),
      };
      const created = await guild.channels.create(opts);
      existingChannels.set(key, created);
      chCreated++;
      await sleep(DELAY);
    } catch (e) { errors.push(`Channel #${ch.name}: ${(e as Error).message}`); }
  }

  // Step 4: Emojis
  for (const emoji of snap.emojis) {
    if (existingEmojis.has(emoji.name.toLowerCase())) { emojisSkipped++; continue; }
    try {
      const image = await downloadBuffer(emoji.imageURL);
      const roles = emoji.roleIds.map(id => roleIdMap.get(id) ?? id).filter(Boolean);
      await guild.emojis.create({
        attachment: image, name: emoji.name, reason: "Anti-Nuke auto-restore (?copy snapshot)",
        ...(roles.length > 0 ? { roles } : {}),
      });
      emojisCreated++;
      await sleep(DELAY);
    } catch (e) { errors.push(`Emoji :${emoji.name}:: ${(e as Error).message}`); }
  }

  // Step 5: Stickers
  for (const sticker of snap.stickers) {
    if (existingStickers.has(sticker.name.toLowerCase())) { stickersSkipped++; continue; }
    try {
      const ext  = sticker.format === 3 ? "json" : "png";
      const file = await downloadBuffer(sticker.url);
      await guild.stickers.create({
        file: { attachment: file, name: `sticker.${ext}` }, name: sticker.name,
        tags: sticker.tags, description: sticker.description ?? "",
        reason: "Anti-Nuke auto-restore (?copy snapshot)",
      });
      stickersCreated++;
      await sleep(DELAY);
    } catch (e) { errors.push(`Sticker "${sticker.name}": ${(e as Error).message}`); }
  }

  // Step 6: Soundboard
  try {
    const currentSounds  = await guild.soundboardSounds.fetch();
    const existingSounds = new Map(currentSounds.map(s => [s.name.toLowerCase(), s]));
    for (const sound of snap.soundboard) {
      if (existingSounds.has(sound.name.toLowerCase())) { soundsSkipped++; continue; }
      try {
        const file   = await downloadBuffer(sound.url);
        const base64 = `data:audio/ogg;base64,${file.toString("base64")}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (guild.soundboardSounds as any).create({
          name: sound.name, sound: base64, volume: sound.volume,
          ...(sound.emojiId   ? { emojiId: sound.emojiId }     : {}),
          ...(sound.emojiName ? { emojiName: sound.emojiName } : {}),
        });
        soundsCreated++;
        await sleep(DELAY);
      } catch (e) { errors.push(`Sound "${sound.name}": ${(e as Error).message}`); }
    }
  } catch { /* soundboard optional */ }

  const embed = new EmbedBuilder()
    .setColor(errors.length === 0 ? 0x00FF99 : 0xFFAA00)
    .setTitle(errors.length === 0 ? "✅ Auto-Restore Complete" : "⚠️ Auto-Restore Complete (with errors)")
    .setDescription(`Automatically restored from \`?copy\` snapshot taken **${takenAt}**.`)
    .addFields(
      { name: "🎭 Roles",      value: `✅ ${rolesCreated} created\n⏭️ ${rolesSkipped} existed`,    inline: true },
      { name: "📁 Categories", value: `✅ ${catsCreated} created\n⏭️ ${catsSkipped} existed`,     inline: true },
      { name: "💬 Channels",   value: `✅ ${chCreated} created\n⏭️ ${chSkipped} existed`,         inline: true },
      { name: "😀 Emojis",    value: `✅ ${emojisCreated} created\n⏭️ ${emojisSkipped} existed`,  inline: true },
      { name: "🎨 Stickers",  value: `✅ ${stickersCreated} created\n⏭️ ${stickersSkipped} existed`, inline: true },
      { name: "🔊 Soundboard", value: `✅ ${soundsCreated} created\n⏭️ ${soundsSkipped} existed`, inline: true },
    );

  if (errors.length > 0) {
    const errText = errors.slice(0, 8).join("\n") + (errors.length > 8 ? `\n…and ${errors.length - 8} more` : "");
    embed.addFields({ name: `❌ Errors (${errors.length})`, value: `\`\`\`\n${errText}\n\`\`\``, inline: false });
  }

  return { found: true, embed };
}

// ── ?paste int — remove duplicates + channels not in snapshot ────────────────
//
// Deletes any channel or role that either:
//   (a) appears more than once with the same name+type (duplicates)
//   (b) does not exist in the saved ?copy snapshot at all (nuke spam)

export async function handlePasteIntCommand(message: Message, _client: Client): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setDescription("❌ You need **Administrator** to use `?paste int`.")]});
    return;
  }

  const status = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00)
    .setTitle("⏳ Running integrity cleanup…")
    .setDescription("Comparing server against snapshot — removing duplicates and unrecognised channels…")]});

  try {
    const guild = message.guild;
    const snap  = await loadSnapshot(guild.id);

    if (!snap) {
      await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
        .setTitle("❌ No Snapshot Found")
        .setDescription("Run `?copy` first to save a snapshot of this server.")]});
      return;
    }

    await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);

    const toDelete: { id: string; name: string; kind: string }[] = [];

    // ── Channels & categories ─────────────────────────────────────────────────
    // Build a set of snapshot names+types for fast lookup
    const snapChannelKeys = new Set(snap.channels.map(c => `${c.name.toLowerCase()}:${c.type}`));

    // Track which names we've already decided to keep (first occurrence wins)
    const kept = new Set<string>();

    // Sort so categories come first, then by position, to keep the right ones
    const allChannels = [...guild.channels.cache.values()].sort((a, b) => {
      const pa = "position" in a ? (a.position as number) : 0;
      const pb = "position" in b ? (b.position as number) : 0;
      return pa - pb;
    });

    for (const ch of allChannels) {
      const key = `${ch.name.toLowerCase()}:${ch.type}`;

      // Not in snapshot at all → nuke spam, delete it
      if (!snapChannelKeys.has(key)) {
        toDelete.push({ id: ch.id, name: ch.name, kind: "channel" });
        continue;
      }

      // In snapshot but we've already kept one with this name+type → duplicate
      if (kept.has(key)) {
        toDelete.push({ id: ch.id, name: ch.name, kind: "channel" });
        continue;
      }

      kept.add(key);
    }

    // ── Delete collected items ────────────────────────────────────────────────
    let deleted = 0;
    let failed  = 0;

    for (const item of toDelete) {
      try {
        const ch = guild.channels.cache.get(item.id);
        if (ch) {
          await ch.delete("?paste int — duplicate or unrecognised channel");
          deleted++;
          await sleep(400);
        }
      } catch {
        failed++;
      }
    }

    const takenAt = new Date(snap.takenAt).toLocaleString();

    await status.edit({ embeds: [new EmbedBuilder()
      .setColor(failed === 0 ? 0x00FFFF : 0xFFAA00)
      .setTitle(failed === 0 ? "✅ Cleanup Done" : "⚠️ Cleanup Done (some failed)")
      .setDescription(`Compared against snapshot from **${takenAt}**.`)
      .addFields(
        { name: "Removed",  value: `**${deleted}** channel(s) deleted`,                                              inline: true },
        { name: "Failed",   value: failed > 0 ? `**${failed}** couldn't be deleted (check permissions)` : "None",   inline: true },
        { name: "What was removed", value:
            toDelete.length === 0
              ? "*Nothing — server already matches the snapshot.*"
              : toDelete.map(i => `• #${i.name}`).slice(0, 20).join("\n") +
                (toDelete.length > 20 ? `\n…and ${toDelete.length - 20} more` : ""),
          inline: false,
        },
      )
      .setFooter({ text: "Only channels not in the ?copy snapshot were removed." })]});

  } catch (err) {
    console.error("[PASTE INT]", err);
    await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setTitle("❌ Cleanup Failed").setDescription(`${(err as Error).message}`)]});
  }
}

// ── ?paste max — wipe everything and rebuild fully from snapshot ──────────────
//
// Deletes ALL channels and non-managed roles, then runs a full ?paste restore.
// This is the nuclear option — use when the server is too damaged to clean up.

export async function handlePasteMaxCommand(message: Message, client: Client): Promise<void> {
  if (!message.guild) return;
  const lowoOwnerId = process.env.LOWO_OWNER_ID ?? "";
  const isAllowed   = message.author.id === message.guild.ownerId || (lowoOwnerId && message.author.id === lowoOwnerId);
  if (!isAllowed) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setDescription("❌ Only the **server owner** can run `?paste max`.")]});
    return;
  }

  const snap = await loadSnapshot(message.guild.id);
  if (!snap) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setTitle("❌ No Snapshot Found")
      .setDescription("Run `?copy` first to save a snapshot of this server.")]});
    return;
  }

  const status = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000)
    .setTitle("💣 Paste Max — Wiping & Rebuilding")
    .setDescription("Deleting all channels and roles, then rebuilding from snapshot.\n**This will take a while — do not interrupt.**")]});

  const guild = message.guild;
  let chDeleted = 0, roleDeleted = 0, failed = 0;

  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);

  // ── 1. Delete all channels ─────────────────────────────────────────────────
  // Delete non-category channels first, then categories (avoids parent issues)
  const nonCats = [...guild.channels.cache.values()].filter(c => c.type !== 4); // 4 = GuildCategory
  const cats    = [...guild.channels.cache.values()].filter(c => c.type === 4);

  for (const ch of [...nonCats, ...cats]) {
    // Skip the channel we just replied in — we need it to post updates
    if (ch.id === message.channelId) continue;
    try {
      await ch.delete("?paste max — full wipe");
      chDeleted++;
      await sleep(300);
    } catch { failed++; }
  }

  // ── 2. Delete all non-managed, non-everyone roles ──────────────────────────
  const rolesToDel = [...guild.roles.cache.values()]
    .filter(r => !r.managed && r.id !== guild.id && r.id !== client.user!.id)
    .sort((a, b) => b.position - a.position); // highest first (safer hierarchy)

  for (const role of rolesToDel) {
    try {
      await role.delete("?paste max — full wipe");
      roleDeleted++;
      await sleep(300);
    } catch { failed++; }
  }

  await status.edit({ embeds: [new EmbedBuilder().setColor(0xFFAA00)
    .setTitle("🔄 Wipe done — rebuilding from snapshot…")
    .setDescription(`Deleted **${chDeleted}** channel(s) and **${roleDeleted}** role(s).\nNow recreating everything from the \`?copy\` snapshot…`)]});

  // ── 3. Full paste restore ──────────────────────────────────────────────────
  const { embed: restoreEmbed } = await runPasteRestore(guild, client);
  restoreEmbed
    .setTitle("✅ Paste Max Complete")
    .addFields({ name: "Wipe", value: `${chDeleted} channels + ${roleDeleted} roles deleted${failed > 0 ? ` (${failed} failed)` : ""}`, inline: false });

  await status.edit({ embeds: [restoreEmbed] });
}

// ── ?copy e — snapshot non-animated emojis from this server ──────────────────

const EMOJI_SNAPSHOT_KEY = (guildId: string) => `emoji_snapshot:${guildId}`;

interface EmojiOnlySnapshot {
  takenAt: number;
  guildId: string;
  guildName: string;
  emojis: EmojiSnap[];
}

async function saveEmojiSnapshot(guildId: string, snap: EmojiOnlySnapshot): Promise<void> {
  await getPool().query(
    `INSERT INTO bot_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [EMOJI_SNAPSHOT_KEY(guildId), JSON.stringify(snap)],
  );
}

async function loadEmojiSnapshot(guildId: string): Promise<EmojiOnlySnapshot | null> {
  const res = await getPool().query<{ value: EmojiOnlySnapshot }>(
    "SELECT value FROM bot_kv WHERE key = $1",
    [EMOJI_SNAPSHOT_KEY(guildId)],
  );
  return res.rows[0]?.value ?? null;
}

export async function handleCopyEmojisCommand(message: Message, _client: Client): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setDescription("❌ You need **Administrator** to use `?copy e`.")]});
    return;
  }

  const status = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00)
    .setTitle("⏳ Copying Emojis")
    .setDescription("Reading all non-animated emojis…")]});

  try {
    const guild = message.guild;
    await guild.emojis.fetch();

    const emojis: EmojiSnap[] = guild.emojis.cache
      .filter(e => !e.animated && !e.managed)
      .map(e => ({
        id: e.id,
        name: e.name ?? "unknown",
        imageURL: e.imageURL({ size: 128, extension: "png" }),
        animated: false,
        managed: false,
        roleIds: [...e.roles.cache.keys()],
      }));

    const snap: EmojiOnlySnapshot = {
      takenAt: Date.now(),
      guildId: guild.id,
      guildName: guild.name,
      emojis,
    };

    await saveEmojiSnapshot(guild.id, snap);

    await status.edit({ embeds: [new EmbedBuilder()
      .setColor(0x00FFFF)
      .setTitle("✅ Emoji Snapshot Saved")
      .setDescription(
        `Captured **${emojis.length}** non-animated emoji${emojis.length === 1 ? "" : "s"} from **${guild.name}**.\n\n` +
        `To paste them into another server, use:\n\`?paste e ${guild.id}\``,
      )
      .setFooter({ text: "Stored in DB — survives bot restarts" })]});

  } catch (err) {
    console.error("[COPY E]", err);
    await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setTitle("❌ Copy Failed").setDescription(`${(err as Error).message}`)]});
  }
}

// ── ?paste e <sourceGuildId> — paste emojis with no duplicates ───────────────

export async function handlePasteEmojisCommand(message: Message, _client: Client, args: string[]): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setDescription("❌ You need **Administrator** to use `?paste e`.")]});
    return;
  }

  const sourceGuildId = args[0]?.trim();
  if (!sourceGuildId || !/^\d{17,20}$/.test(sourceGuildId)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setTitle("❌ Missing Server ID")
      .setDescription("Usage: `?paste e <server id of server you ran ?copy e in>`\nExample: `?paste e 123456789012345678`")]});
    return;
  }

  const status = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFAA00)
    .setTitle("⏳ Pasting Emojis")
    .setDescription(`Loading emoji snapshot from server \`${sourceGuildId}\`…`)]});

  try {
    const guild = message.guild;
    const snap  = await loadEmojiSnapshot(sourceGuildId);

    if (!snap) {
      await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
        .setTitle("❌ No Snapshot Found")
        .setDescription(`No emoji snapshot found for server ID \`${sourceGuildId}\`.\nRun \`?copy e\` in that server first.`)]});
      return;
    }

    await guild.emojis.fetch();
    const existingNames = new Set(guild.emojis.cache.map(e => e.name?.toLowerCase() ?? ""));

    let created = 0, skipped = 0;
    const errors: string[] = [];

    for (const emoji of snap.emojis) {
      if (existingNames.has(emoji.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        const image = await downloadBuffer(emoji.imageURL);
        await guild.emojis.create({ attachment: image, name: emoji.name, reason: `?paste e from ${snap.guildName}` });
        existingNames.add(emoji.name.toLowerCase());
        created++;
        await sleep(DELAY);
      } catch (e) {
        errors.push(`:${emoji.name}: — ${(e as Error).message}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(errors.length === 0 ? 0x00FFFF : 0xFFAA00)
      .setTitle(errors.length === 0 ? "✅ Emojis Pasted" : "⚠️ Emojis Pasted (with errors)")
      .setDescription(`Source: **${snap.guildName}** · Snapshot from <t:${Math.floor(snap.takenAt / 1000)}:f>`)
      .addFields(
        { name: "✅ Created",       value: `**${created}**`,  inline: true },
        { name: "⏭️ Already Exist", value: `**${skipped}**`,  inline: true },
        { name: "❌ Failed",        value: `**${errors.length}**`, inline: true },
      );

    if (errors.length > 0) {
      const errText = errors.slice(0, 8).join("\n") + (errors.length > 8 ? `\n…and ${errors.length - 8} more` : "");
      embed.addFields({ name: "Errors", value: `\`\`\`\n${errText}\n\`\`\``, inline: false });
    }

    await status.edit({ embeds: [embed] });

  } catch (err) {
    console.error("[PASTE E]", err);
    await status.edit({ embeds: [new EmbedBuilder().setColor(0xFF4444)
      .setTitle("❌ Paste Failed").setDescription(`${(err as Error).message}`)]});
  }
}
