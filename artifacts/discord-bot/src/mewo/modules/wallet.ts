import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getWallet, claimDaily, transferCoins, getWalletLeaderboard, setWalletBalance } from "../store.js";

type Handler = (msg: Message, args: string[]) => Promise<void>;

function err(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${text}`);
}

const COIN = "🪙";

export const cmdWallet: Handler = async (msg) => {
  const target = msg.mentions.users.first() ?? msg.author;
  const w = await getWallet(target.id);
  const today = new Date().toISOString().slice(0, 10);
  const canClaim = w.dailyDate !== today;
  const streak = w.streak ?? 0;
  const streakText = streak > 0
    ? `🔥 **${streak} day streak!**${streak >= 7 ? " (bonus active)" : ""}`
    : "No active streak";
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`${COIN} Wallet — ${target.username}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Balance", value: `**${w.balance.toLocaleString()} ${COIN}**`, inline: true },
        { name: "Streak", value: streakText, inline: true },
        { name: "Daily Reward", value: canClaim ? "✅ Available! Use `mewo wallet daily`" : "⏳ Already claimed today", inline: false }
      )
      .setFooter({ text: "mewo • wallet • earn coins with mewo wallet daily" })
    ],
  });
};

export const cmdWalletDaily: Handler = async (msg) => {
  const result = await claimDaily(msg.author.id);
  if (!result.claimed) {
    await msg.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle("Daily Reward")
        .setDescription(`⏳ You already claimed your daily reward today!\n\nCome back tomorrow for more ${COIN}.`)
        .addFields({ name: "Current Balance", value: `**${result.balance.toLocaleString()} ${COIN}**`, inline: true })
        .setFooter({ text: "mewo • wallet" })
      ],
    });
    return;
  }

  const streakBonus = result.bonus > 0
    ? `\n+**${result.bonus.toLocaleString()} ${COIN}** streak bonus!`
    : "";
  const streakLabel = result.streak >= 30
    ? "🏆 30-day streak! (5x bonus)"
    : result.streak >= 7
    ? "🔥 7-day streak! (2x bonus)"
    : result.streak >= 3
    ? "⚡ 3-day streak! (+50% bonus)"
    : `🔥 Day ${result.streak} streak`;

  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`${COIN} Daily Reward Claimed!`)
      .setDescription(`You received **${(result.amount - result.bonus).toLocaleString()} ${COIN}**!${streakBonus}`)
      .addFields(
        { name: "New Balance", value: `**${result.balance.toLocaleString()} ${COIN}**`, inline: true },
        { name: "Streak", value: streakLabel, inline: true }
      )
      .setFooter({ text: "mewo • wallet • come back tomorrow to keep your streak!" })
    ],
  });
};

export const cmdWalletPay: Handler = async (msg, args) => {
  const target = msg.mentions.users.first();
  const amountStr = args.find(a => !a.startsWith("<@") && !isNaN(Number(a)));
  if (!target || !amountStr) {
    await msg.reply({ embeds: [err("Usage: `mewo wallet pay @user <amount>`")] });
    return;
  }
  if (target.id === msg.author.id) {
    await msg.reply({ embeds: [err("You can't pay yourself.")] });
    return;
  }
  if (target.bot) {
    await msg.reply({ embeds: [err("You can't pay bots.")] });
    return;
  }
  const amount = Math.floor(Number(amountStr));
  if (amount <= 0 || isNaN(amount)) {
    await msg.reply({ embeds: [err("Amount must be a positive number.")] });
    return;
  }
  const senderWallet = await getWallet(msg.author.id);
  if (senderWallet.balance < amount) {
    await msg.reply({ embeds: [err(`You only have **${senderWallet.balance.toLocaleString()} ${COIN}**. Not enough to pay **${amount.toLocaleString()} ${COIN}**.`)] });
    return;
  }
  await transferCoins(msg.author.id, target.id, amount);
  const newWallet = await getWallet(msg.author.id);
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`${COIN} Payment Sent`)
      .setDescription(`Sent **${amount.toLocaleString()} ${COIN}** to **${target.username}**.`)
      .addFields({ name: "Your New Balance", value: `**${newWallet.balance.toLocaleString()} ${COIN}**`, inline: true })
      .setFooter({ text: "mewo • wallet" })
    ],
  });
};

export const cmdWalletLeaderboard: Handler = async (msg) => {
  const top = await getWalletLeaderboard(10);
  if (!top.length) {
    await msg.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`${COIN} Leaderboard`).setDescription("No wallets yet. Use `mewo wallet daily` to get started!").setFooter({ text: "mewo • wallet" })] });
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const rows = top.map((entry, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} <@${entry.userId}> — **${entry.balance.toLocaleString()} ${COIN}**`;
  });
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`${COIN} Wallet Leaderboard`)
      .setDescription(rows.join("\n"))
      .setFooter({ text: "mewo • wallet • top 10 richest users" })
    ],
  });
};

export const cmdWalletGamble: Handler = async (msg, args) => {
  const amountStr = args[0];
  if (!amountStr) {
    await msg.reply({ embeds: [err("Usage: `mewo wallet gamble <amount|all>`")] });
    return;
  }
  const w = await getWallet(msg.author.id);
  const amount = amountStr.toLowerCase() === "all" ? w.balance : Math.floor(Number(amountStr));
  if (isNaN(amount) || amount <= 0) {
    await msg.reply({ embeds: [err("Provide a valid amount or `all`.")] });
    return;
  }
  if (w.balance < amount) {
    await msg.reply({ embeds: [err(`You only have **${w.balance.toLocaleString()} ${COIN}**.`)] });
    return;
  }
  const roll = Math.random();
  const win = roll > 0.45;
  const multiplier = roll > 0.9 ? 3 : roll > 0.7 ? 2 : 1.5;
  const gain = win ? Math.floor(amount * multiplier) : 0;
  const newBalance = win ? w.balance - amount + gain : w.balance - amount;
  await setWalletBalance(msg.author.id, Math.max(0, newBalance));
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(win ? 0x57F287 : 0xED4245)
      .setTitle(win ? `${COIN} You Won!` : `${COIN} You Lost!`)
      .setDescription(win
        ? `🎰 You gambled **${amount.toLocaleString()} ${COIN}** and won **${gain.toLocaleString()} ${COIN}**! (${multiplier}x)`
        : `🎰 You gambled **${amount.toLocaleString()} ${COIN}** and lost it all.`
      )
      .addFields({ name: "New Balance", value: `**${Math.max(0, newBalance).toLocaleString()} ${COIN}**`, inline: true })
      .setFooter({ text: "mewo • wallet • 55% win rate • luck-based" })
    ],
  });
};
