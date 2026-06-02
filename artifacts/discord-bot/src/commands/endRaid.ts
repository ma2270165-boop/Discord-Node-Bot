import { Message } from "discord.js";

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
  "https://tenor.com/view/konata-happy-lucky-star-yay-cute-gif-5972203048884378616",
  "https://tenor.com/view/lucky-star-konata-tsk-tsk-tsk-tsk-tsk-anime-tsk-tsk-gif-11078715580433791793",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function handleEndCommand(message: Message): Promise<void> {
  const line = pick(MESSAGES);
  const gif = pick(GIFS);

  await message.reply(`# ${line}\n${gif}`);
}
