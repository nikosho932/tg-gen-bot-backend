import express from "express";
const router = express.Router();

router.get("/cost", (req, res) => {
  res.json({ cost: 5 });
});

export default router;
