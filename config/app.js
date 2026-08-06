import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getApp() {
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(express.static(path.join(__dirname, "..", "public", "app"), { index: false }));
  return app;
}
