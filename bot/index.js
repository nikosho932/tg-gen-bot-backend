import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;

if (!BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is missing in .env");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log("🤖 Bot started...");

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const userData = {
    id: msg.from.id,
    username: msg.from.username,
    first_name: msg.from.first_name
  };

  try {
    const res = await axios.post(`${API_URL}/api/user/login`, userData);
    const user = res.data;

    bot.sendMessage(
      chatId,
      `👋 Привет, ${user.first_name || "друг"}!\n\n` +
      `Твой аккаунт активирован.\n` +
      `💰 Баланс токенов: *${user.tokens}*\n`,
      { parse_mode: "Markdown" }
    );

  } catch (err) {
    console.log("Login error:", err.response?.data || err.message);
    bot.sendMessage(chatId, "❌ Ошибка входа. Попробуйте позже.");
  }
});
