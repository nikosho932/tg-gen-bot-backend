import express from "express";
import prisma from "../prisma/client.js";

const router = express.Router();

// LOGIN or REGISTER
router.post("/login", async (req, res) => {
  const { id, username, first_name } = req.body;

  let user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        id,
        username: username || "",
        first_name: first_name || "",
      }
    });
  }

  res.json(user);
});

// GET USER
router.post("/get", async (req, res) => {
  const { id } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json(user);
});

// CHARGE TOKENS
router.post("/charge", async (req, res) => {
  const { id, amount } = req.body;

  const user = await prisma.user.update({
    where: { id },
    data: { tokens: { decrement: amount } },
  });

  res.json(user);
});

// FACE UPLOAD (FAKE)
router.post("/uploadFace", async (req, res) => {
  const { userId, fileUrl } = req.body;

  await prisma.user.update({
    where: { id: userId },
    data: { face_url: fileUrl, photos_added: true },
  });

  res.json({ ok: true });
});

// BODY UPLOAD (FAKE)
router.post("/uploadBody", async (req, res) => {
  const { userId, fileUrl } = req.body;

  await prisma.user.update({
    where: { id: userId },
    data: { body_url: fileUrl, photos_added: true },
  });

  res.json({ ok: true });
});

export default router;
