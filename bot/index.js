import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is missing");
  process.exit(1);
}
if (!API_URL) {
  console.error("API_URL is missing");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 Bot started...");

// временное состояние (in-memory). Для продакшн лучше хранить в Redis/DB.
const userStates = {}; // userStates[userId] = "waiting_face" | "waiting_body" | null

const mainMenuOptions = {
  reply_markup: {
    keyboard: [
      ["🎨 Генерировать изображения"],
      ["👤 Личный кабинет", "👥 Пригласить друзей"]
    ],
    resize_keyboard: true
  }
};

const cabinetInline = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "📸 Загрузить исходники", callback_data: "upload_sources" }],
      [{ text: "💳 Пополнить баланс", callback_data: "pay" }],
      [{ text: "🛟 Служба поддержки", callback_data: "support" }]
    ]
  }
};

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const payload = { id: msg.from.id, username: msg.from.username, first_name: msg.from.first_name };

  try {
    const res = await axios.post(`${API_URL}/api/user/login`, payload);
    const user = res.data;

    const welcome = `👋 Привет, ${user.first_name || "друг"}!\n\n` +
                    `Добро пожаловать.\n\n` +
                    `Ниже меню — выбери действие.`;
    bot.sendMessage(chatId, welcome, mainMenuOptions);
  } catch (err) {
    console.error("Start/login error:", err.response?.data || err.message);
    bot.sendMessage(chatId, "Ошибка при авторизации. Попробуйте позже.");
  }
});

// обработка текстовых кнопок
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith("/")) return; // игнор команд и нетекста

  // Личный кабинет
  if (text === "👤 Личный кабинет") {
    try {
      const res = await axios.post(`${API_URL}/api/user/get`, { id: msg.from.id });
      const user = res.data;

      const created = user.created_at ? new Date(user.created_at).toLocaleDateString() : "—";
      const photosText = user.photos_added ? "загружены" : "не загружены";

      const msgText = `🗓 Вы с нами с: *${created}*\n` +
                      `💰 Баланс токенов: *${user.tokens}*\n` +
                      `📸 Исходники: ${photosText}\n\n` +
                      `Выберите действие:`;
      await bot.sendMessage(chatId, msgText, { parse_mode: "Markdown", ...cabinetInline });
    } catch (err) {
      console.error("Cabinet error:", err.response?.data || err.message);
      bot.sendMessage(chatId, "Ошибка получения данных. Попробуйте позже.");
    }
    return;
  }

  // Пригласить друзей (пока заглушка)
  if (text === "👥 Пригласить друзей") {
    const invite = "Пригласи друзей и получи бонус! Получить реферальную ссылку можете здесь: ";
    bot.sendMessage(chatId, invite, mainMenuOptions);
    return;
  }

  // Генерация
  if (text === "🎨 Генерировать изображения") {
    try {
      const res = await axios.post(`${API_URL}/api/user/get`, { id: msg.from.id });
      const user = res.data;

      if (!user.photos_added) {
        return bot.sendMessage(chatId, "📸 Cначала вам необхоимо добавить исходники ТЕЛА и ЛИЦА в личном кабинете (кнопка «Загрузить исходники»).");
      }

      const costRes = await axios.get(`${API_URL}/api/generation/cost`);
      const cost = costRes.data.cost;

      if (user.tokens < cost) {
        return bot.sendMessage(chatId, `❌ У вас недостаточно токенов. Стоимость генерации — ${cost} токенов. Пополнить баланс токенов можете в личном кабинете`);
      }

      // списываем токены
      const chargeRes = await axios.post(`${API_URL}/api/user/charge`, { id: msg.from.id, amount: cost });
      const updatedUser = chargeRes.data;

      bot.sendMessage(chatId, "⏳ Генерация запущена. Когда будет готово — пришлём результат.");
      // Здесь вызывать реальный генератор асинхронно и по готовности отправлять фото.
    } catch (err) {
      console.error("Generation error:", err.response?.data || err.message);
      bot.sendMessage(chatId, "Ошибка при запуске генерации. Попробуйте позже.");
    }
    return;
  }
});

// Обработка inline-кнопок (callback_query)
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === "upload_sources") {
    userStates[userId] = "waiting_face";
    await bot.sendMessage(chatId, "📸 Отлично! Сначала отправьте фото *FACE* (лицо).", { parse_mode: "Markdown" });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === "pay") {
    await bot.answerCallbackQuery(query.id, { text: "Оплата пока в разработке" });
    return;
  }

  if (data === "support") {
    await bot.answerCallbackQuery(query.id, { text: "Связаться с поддержкой: support@example.com", url: "https://t.me/dmitrycalm"});
    return;
  }
});

// Приём фото (FACE / BODY)
bot.on("photo", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = userStates[userId];

  if (!state) return; // фото вне контекста

  try {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const fileUrl = await bot.getFileLink(fileId); // ссылка на файл Telegram

    if (state === "waiting_face") {
      await axios.post(`${API_URL}/api/user/uploadFace`, { userId, fileUrl });
      userStates[userId] = "waiting_body";
      return bot.sendMessage(chatId, "✅ FACE загружен. Теперь отправьте фото BODY (весь рост).");
    }

    if (state === "waiting_body") {
      await axios.post(`${API_URL}/api/user/uploadBody`, { userId, fileUrl });
      userStates[userId] = null;
      return bot.sendMessage(chatId, "✅ BODY загружен. Исходники успешно сохранены в личном кабинете.");
    }
  } catch (err) {
    console.error("Photo upload error:", err.response?.data || err.message);
    bot.sendMessage(chatId, "Ошибка при загрузке фото. Попробуйте ещё раз.");
  }
});
