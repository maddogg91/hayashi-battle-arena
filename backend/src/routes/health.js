import express from "express";
const router = express.Router();

router.get("/", (_, res) => res.json({ status: "ok" }));

export default router;
