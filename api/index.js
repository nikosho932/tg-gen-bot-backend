import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// инициализация базы
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// тестовый маршрут
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Backend is running!" });
});

// логин юзера из Telegram
app.post("/api/user/login", async (req, res) => {
  try {
    const { id, username, first_name } = req.body;

    if (!id) return res.status(400).json({ error: "Missing user ID" });

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (!user) {
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({
          id,
          username,
          first_name,
          tokens: 20
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      return res.json(newUser);
    }

    await supabase
      .from("users")
      .update({ last_login: new Date() })
      .eq("id", id);

    return res.json(user);

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// запуск
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
