import { Message, EmbedBuilder } from "discord.js";

const MESSAGES = [
  "Raid completed. We live to lag another day.",
  "Mission accomplished. Somehow.",
  "Nobody knows what happened, but we won.",
  "Raid over. Go touch grass.",
  "Another raid, another questionable decision.",
  "We came. We saw. We spammed M1.",
  "The raid has ended. The brain cells have not recovered.",
  "Good job everyone. Pretend it was all skill.",
  "Raid complete. Compensation: 0 robux.",
  "The raid is over. The yap continues.",
];

const GIFS = [
  "https://media.tenor.com/vqRpSNAMdH8AAAAC/konata-happy.gif",
  "https://media.tenor.com/Uv6Q0zqxEN4AAAAC/lucky-star-konata.gif",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function handleEndCommand(message: Message): Promise<void> {
  const line = pick(MESSAGES);
  const gif = pick(GIFS);

  const embed = new EmbedBuilder()
    .setDescription(`# ${line}`)
    .setImage(gif);

  await message.reply({ embeds: [embed] });
}
