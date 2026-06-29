import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getTag, createTag, deleteTag, listTags, editTag, type MewoTag } from "../store.js";

type Handler = (msg: Message, args: string[]) => Promise<void>;

function err(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${text}`);
}

export const cmdTagCreate: Handler = async (msg, args) => {
  if (args.length < 2) {
    await msg.reply({ embeds: [err("Usage: `mewo tags create <name> <content>`")] });
    return;
  }
  if (!msg.guildId) { await msg.reply({ embeds: [err("Tags are server-only.")] }); return; }
  const name = args[0].toLowerCase();
  const content = args.slice(1).join(" ");
  if (name.length > 32) {
    await msg.reply({ embeds: [err("Tag name must be 32 characters or fewer.")] });
    return;
  }
  if (content.length > 2000) {
    await msg.reply({ embeds: [err("Tag content must be 2000 characters or fewer.")] });
    return;
  }
  const tag: MewoTag = {
    name,
    content,
    createdBy: msg.author.id,
    createdByTag: msg.author.tag,
    createdAt: new Date().toISOString(),
  };
  const ok = await createTag(msg.guildId, tag);
  if (!ok) {
    await msg.reply({ embeds: [err(`Tag \`${name}\` already exists. Use \`mewo tags edit ${name} <content>\` to update it.`)] });
    return;
  }
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("Tag Created")
      .addFields(
        { name: "Name", value: `\`${name}\``, inline: true },
        { name: "Content", value: content.slice(0, 1024), inline: false }
      )
      .setFooter({ text: `mewo • tags • by ${msg.author.username}` })
    ],
  });
};

export const cmdTagDelete: Handler = async (msg, args) => {
  if (!args[0]) {
    await msg.reply({ embeds: [err("Usage: `mewo tags delete <name>`")] });
    return;
  }
  if (!msg.guildId) { await msg.reply({ embeds: [err("Server-only.")] }); return; }
  const name = args[0].toLowerCase();
  const tag = await getTag(msg.guildId, name);
  if (!tag) {
    await msg.reply({ embeds: [err(`Tag \`${name}\` not found. Use \`mewo tags list\` to see all tags.`)] });
    return;
  }
  const isOwner = tag.createdBy === msg.author.id;
  const isMod = msg.member?.permissions.has(8n);
  if (!isOwner && !isMod) {
    await msg.reply({ embeds: [err("You can only delete your own tags. Admins can delete any tag.")] });
    return;
  }
  await deleteTag(msg.guildId, name);
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setDescription(`Tag \`${name}\` has been deleted.`)
      .setFooter({ text: "mewo • tags" })
    ],
  });
};

export const cmdTagEdit: Handler = async (msg, args) => {
  if (args.length < 2) {
    await msg.reply({ embeds: [err("Usage: `mewo tags edit <name> <new content>`")] });
    return;
  }
  if (!msg.guildId) { await msg.reply({ embeds: [err("Server-only.")] }); return; }
  const name = args[0].toLowerCase();
  const content = args.slice(1).join(" ");
  const tag = await getTag(msg.guildId, name);
  if (!tag) {
    await msg.reply({ embeds: [err(`Tag \`${name}\` not found.`)] });
    return;
  }
  const isOwner = tag.createdBy === msg.author.id;
  const isMod = msg.member?.permissions.has(8n);
  if (!isOwner && !isMod) {
    await msg.reply({ embeds: [err("You can only edit your own tags. Admins can edit any tag.")] });
    return;
  }
  await editTag(msg.guildId, name, content);
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("Tag Updated")
      .addFields(
        { name: "Name", value: `\`${name}\``, inline: true },
        { name: "New Content", value: content.slice(0, 1024), inline: false }
      )
      .setFooter({ text: "mewo • tags" })
    ],
  });
};

export const cmdTagList: Handler = async (msg) => {
  if (!msg.guildId) { await msg.reply({ embeds: [err("Server-only.")] }); return; }
  const tags = await listTags(msg.guildId);
  if (!tags.length) {
    await msg.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setDescription("No tags yet. Create one with `mewo tags create <name> <content>`")
        .setFooter({ text: "mewo • tags" })
      ],
    });
    return;
  }
  const list = tags.map(t => `\`${t.name}\` — <@${t.createdBy}>`).join("\n").slice(0, 2048);
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Tags — ${msg.guild?.name ?? "Server"}`)
      .setDescription(list)
      .setFooter({ text: `mewo • tags • ${tags.length} tag(s)` })
    ],
  });
};

export const cmdTagSend: Handler = async (msg, args) => {
  if (!args[0]) {
    await msg.reply({ embeds: [err("Usage: `mewo tags send <name>`")] });
    return;
  }
  if (!msg.guildId) { await msg.reply({ embeds: [err("Server-only.")] }); return; }
  const name = args[0].toLowerCase();
  const tag = await getTag(msg.guildId, name);
  if (!tag) {
    await msg.reply({ embeds: [err(`Tag \`${name}\` not found. Use \`mewo tags list\` to see all tags.`)] });
    return;
  }
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Tag — ${tag.name}`)
      .setDescription(tag.content)
      .setFooter({ text: `mewo • tags • by ${tag.createdByTag}` })
    ],
  });
};
