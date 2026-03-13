import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "./data";
const DB_PATH = path.join(DATA_DIR, "lernquest.db");

// Ensure data directory exists
import { mkdirSync } from "node:fs";
mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);

// Performance & safety pragmas
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });

/**
 * Run all migrations (create tables if not exist).
 * Uses raw SQL so we don't need drizzle-kit in production.
 */
export function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      email         TEXT,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'teacher',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      join_code     TEXT NOT NULL UNIQUE,
      teacher_id    TEXT NOT NULL REFERENCES teachers(id),
      school_year   TEXT,
      modules       TEXT NOT NULL DEFAULT '[]',
      settings      TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      archived      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS students (
      id            TEXT PRIMARY KEY,
      display_name  TEXT NOT NULL,
      nickname      TEXT,
      class_id      TEXT NOT NULL REFERENCES classes(id),
      pin_hash      TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      active        INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS progress (
      id            TEXT PRIMARY KEY,
      student_id    TEXT NOT NULL REFERENCES students(id),
      challenge_id  TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'not_started',
      attempts      INTEGER NOT NULL DEFAULT 0,
      best_score    INTEGER DEFAULT 0,
      time_spent_s  INTEGER DEFAULT 0,
      completed_at  TEXT,
      data          TEXT DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, challenge_id)
    );

    CREATE TABLE IF NOT EXISTS badges (
      id            TEXT PRIMARY KEY,
      student_id    TEXT NOT NULL REFERENCES students(id),
      badge_type    TEXT NOT NULL,
      module        TEXT,
      earned_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, badge_type, module)
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id                  TEXT PRIMARY KEY,
      timestamp           TEXT NOT NULL DEFAULT (datetime('now')),
      source              TEXT NOT NULL,
      commit_hash         TEXT,
      challenges_added    INTEGER DEFAULT 0,
      challenges_updated  INTEGER DEFAULT 0,
      status              TEXT NOT NULL,
      details             TEXT
    );

    CREATE TABLE IF NOT EXISTS instance_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indices for common queries
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
    CREATE INDEX IF NOT EXISTS idx_progress_student ON progress(student_id);
    CREATE INDEX IF NOT EXISTS idx_progress_challenge ON progress(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_badges_student ON badges(student_id);
  `);

  console.log("✓ Database migrated");
}

/**
 * Check if initial setup has been completed (admin exists)
 */
export function isSetupComplete(): boolean {
  const result = sqlite
    .prepare("SELECT COUNT(*) as count FROM teachers WHERE role = 'admin'")
    .get() as { count: number };
  return result.count > 0;
}
