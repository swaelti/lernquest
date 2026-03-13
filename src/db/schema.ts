import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Lehrpersonen ───
export const teachers = sqliteTable("teachers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "teacher"] })
    .notNull()
    .default("teacher"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Klassen ───
export const classes = sqliteTable("classes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id),
  schoolYear: text("school_year"),
  // JSON-Array der aktivierten Modul-IDs: ["m347", "m293"]
  modules: text("modules").notNull().default("[]"),
  // JSON-Objekt: Gamification-Settings, Sichtbarkeit etc.
  settings: text("settings").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

// ─── Schüler ───
export const students = sqliteTable("students", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  displayName: text("display_name").notNull(),
  nickname: text("nickname"),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id),
  pinHash: text("pin_hash"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// ─── Fortschritt ───
export const progress = sqliteTable("progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  challengeId: text("challenge_id").notNull(),
  status: text("status", {
    enum: ["not_started", "in_progress", "completed", "skipped"],
  })
    .notNull()
    .default("not_started"),
  attempts: integer("attempts").notNull().default(0),
  bestScore: integer("best_score").default(0),
  timeSpentS: integer("time_spent_s").default(0),
  completedAt: text("completed_at"),
  // JSON: letzte Antworten, genutzte Hints etc.
  data: text("data").default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Badges ───
export const badges = sqliteTable("badges", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  badgeType: text("badge_type").notNull(),
  module: text("module"),
  earnedAt: text("earned_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Content-Sync Log ───
export const syncLog = sqliteTable("sync_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  timestamp: text("timestamp")
    .notNull()
    .default(sql`(datetime('now'))`),
  source: text("source", { enum: ["upstream", "manual"] }).notNull(),
  commitHash: text("commit_hash"),
  challengesAdded: integer("challenges_added").default(0),
  challengesUpdated: integer("challenges_updated").default(0),
  status: text("status", { enum: ["success", "error"] }).notNull(),
  details: text("details"),
});

// ─── Instanz-Einstellungen ───
export const instanceSettings = sqliteTable("instance_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
