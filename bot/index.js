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

// временное состояние
const userStates = {};

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
      [{ text: "🛟 Служба поддержки", url: "https://t.me/dmitrycalm" }]
    ]
  }
};

// START
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const res = await axios.post(`${API_URL}/api/user/login`, {
      id: msg.from.id,
      username: msg.from.username,
      first_name: msg.from.first_name
    });

    const welcome = `👋 Привет, ${msg.from.first_name}!\n\nДобро пожаловать!`;
    bot.sendMessage(chatId, welcome, mainMenuOptions);
  } catch (err) {
    bot.sendMessage(chatId, "Ошибка авторизации");
  }
});

// MAIN MESSAGE HANDLER
bot.on("message", async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  if (!text || text.startsWith("/")) return;

  if (text === "👤 Личный кабинет") {
    const res = await axios.post(`${API_URL}/api/user/get`, { id: msg.from.id });
    const user = res.data;

    const created = user.created_at
      ? new Date(user.created_at).toLocaleDateString()
      : "—";

    const photos = user.photos_added ? "загружены" : "не загружены";

    bot.sendMessage(
      chatId,
      `🗓 Вы с нами с: *${created}*\n` +
      `💰 Баланс: *${user.tokens}*\n` +
      `📸 Исходники: ${photos}`,
      {
        parse_mode: "Markdown",
        ...cabinetInline
      }
    );
    return;
  }

  if (text === "👥 Пригласить друзей") {
    return bot.sendMessage(
      chatId,
      "Функция в разработке!",
      mainMenuOptions
    );
  }

  // GENERATION
  if (text === "🎨 Генерировать изображения") {
    try {
      const res = await axios.post(`${API_URL}/api/user/get`, { id: msg.from.id });
      const user = res.data;

      if (!user.photos_added) {
        return bot.sendMessage(
          chatId,
          "📸 У вас НЕ загружены FACE и BODY.\nЗайдите в Личный кабинет → Загрузить исходники."
        );
      }

      const costRes = await axios.get(`${API_URL}/api/generation/cost`);
      const cost = costRes.data.cost;

      if (user.tokens < cost) {
        return bot.sendMessage(
          chatId,
          `❌ Недостаточно токенов!\nСтоимость: ${cost}\nВаш баланс: ${user.tokens}`
        );
      }

      userStates[msg.from.id] = "confirm_generation";

      return bot.sendMessage(chatId,
        `💠 *Стоимость генерации: ${cost} токенов*\n` +
        `💰 *Ваш баланс: ${user.tokens}*\n\n` +
        `Продолжаем?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚀 Да, погнали!", callback_data: "gen_confirm" }],
              [{ text: "↩️ Назад", callback_data: "back_to_menu" }]
            ]
          }
        }
      );
    } catch (err) {
      bot.sendMessage(chatId, "Ошибка генерации.");
    }
  }
});

// INLINE BUTTONS
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === "back_to_menu") {
    userStates[userId] = null;
    bot.sendMessage(chatId, "Вы в главном меню", mainMenuOptions);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === "gen_confirm") {
    userStates[userId] = "waiting_generation_face";
    bot.answerCallbackQuery(query.id);
    return bot.sendMessage(
      chatId,
      "📸 Отправьте *фото лица* для этой генерации.",
      { parse_mode: "Markdown" }
    );
  }

  if (data === "upload_sources") {
    userStates[userId] = "waiting_face";
    bot.answerCallbackQuery(query.id);
    return bot.sendMessage(
      chatId,
      "📸 Отправьте фото FACE (лицо)"
    );
  }
});

// PHOTO HANDLER
bot.on("photo", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = userStates[userId];

  try {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const fileUrl = await bot.getFileLink(fileId);

    if (state === "waiting_face") {
      await axios.post(`${API_URL}/api/user/uploadFace`, { userId, fileUrl });
      userStates[userId] = "waiting_body";
      return bot.sendMessage(chatId, "Теперь отправьте фото BODY.");
    }

    if (state === "waiting_body") {
      await axios.post(`${API_URL}/api/user/uploadBody`, { userId, fileUrl });
      userStates[userId] = null;
      return bot.sendMessage(chatId, "Исходники успешно загружены!");
    }

    if (state === "waiting_generation_face") {
      userStates[userId] = null;

      bot.sendMessage(chatId, "⏳ Обрабатываю фото… (заглушка)");

      setTimeout(() => {
        bot.sendMessage(chatId, "✨ Генерация завершена! (пока заглушка)");
      }, 3000);

      return;
    }
  } catch (err) {
    bot.sendMessage(chatId, "Ошибка загрузки фото");
  }
});
