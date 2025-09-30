import Database from "better-sqlite3";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || "./data/db/assistant.sqlite";
let db: Database.Database;

export function initDb() {
  fs.mkdirSync("./data/db", { recursive: true });
  db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY,
      user_text TEXT, model_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function logInteraction(user_text: string, model_text: string) {
  const stmt = db.prepare(
    `INSERT INTO interactions(user_text, model_text) VALUES (?, ?)`
  );
  const info = stmt.run(user_text, model_text);
  return info.lastInsertRowid as number;
}