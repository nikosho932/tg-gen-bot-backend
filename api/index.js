import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import FormData from "form-data";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GENERATION_COST = 10;

// Health
app.get("/", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// --- Login: создаёт/возвращает пользователя ---
app.post("/api/user/login", async (req, res) => {
  try {
    const { id, username, first_name } = req.body;
    if (!id) return res.status(400).json({ error: "Missing user id" });

    const { data: user } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    if (!user) {
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({ id, username, first_name, tokens: 20 })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(newUser);
    }

    await supabase.from("users").update({ last_login: new Date() }).eq("id", id);
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- Get user by id ---
app.post("/api/user/get", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { data: user, error } = await supabase.from("users").select("*").eq("id", id).single();
    if (error) return res.status(404).json({ error: "User not found" });
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- Charge tokens (subtract amount) ---
app.post("/api/user/charge", async (req, res) => {
  try {
    const { id, amount } = req.body;
    if (!id || typeof amount !== "number") return res.status(400).json({ error: "Missing id or amount" });

    const { data: user } = await supabase.from("users").select("*").eq("id", id).single();
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.tokens < amount) return res.status(400).json({ error: "Insufficient tokens" });

    const { data: updated, error } = await supabase
      .from("users")
      .update({ tokens: user.tokens - amount })
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- Helper: download a remote file (returns Buffer) ---
async function downloadFileToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to download file from Telegram");
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// --- Upload face via fileUrl (from Telegram) ---
app.post("/api/user/uploadFace", async (req, res) => {
  try {
    const { userId, fileUrl } = req.body;
    if (!userId || !fileUrl) return res.status(400).json({ error: "Missing userId or fileUrl" });

    const buffer = await downloadFileToBuffer(fileUrl);
    const path = `faces/${userId}.jpg`;

    const { error: uploadErr } = await supabase.storage.from("user-photos").upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: true
    });
    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    // сохраняем путь (могем хранить public URL при необходимости)
    const { data: updated, error } = await supabase.from("users").update({ face_url: path }).eq("id", userId).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // логируем в user_images
    await supabase.from("user_images").insert({ user_id: userId, type: "face", url: path });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error("uploadFace error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- Upload body ---
app.post("/api/user/uploadBody", async (req, res) => {
  try {
    const { userId, fileUrl } = req.body;
    if (!userId || !fileUrl) return res.status(400).json({ error: "Missing userId or fileUrl" });

    const buffer = await downloadFileToBuffer(fileUrl);
    const path = `bodies/${userId}.jpg`;

    const { error: uploadErr } = await supabase.storage.from("user-photos").upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: true
    });
    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    // отметим body_url и photos_added если есть face
    const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
    const updates = { body_url: path };
    if (user?.face_url) updates.photos_added = true;

    const { data: updated, error } = await supabase.from("users").update(updates).eq("id", userId).select().single();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from("user_images").insert({ user_id: userId, type: "body", url: path });

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error("uploadBody error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Cost endpoint
app.get("/api/generation/cost", (req, res) => res.json({ cost: GENERATION_COST }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
