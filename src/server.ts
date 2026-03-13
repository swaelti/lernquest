import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db, migrate, isSetupComplete } from "./db/index.js";
import { loadContent } from "./services/content-loader.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { studentRoutes } from "./routes/student.js";
import { contentRoutes } from "./routes/content.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || "8080");
const SECRET_KEY = process.env.SECRET_KEY || "change-me-to-a-random-string";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const app = Fastify({
  logger: {
    level: LOG_LEVEL,
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
  trustProxy: TRUST_PROXY,
});

// ─── Plugins ───
await app.register(cors, { origin: true, credentials: true });
await app.register(formbody);
await app.register(cookie);
await app.register(session, {
  secret: SECRET_KEY.padEnd(32, "0"), // Min 32 chars
  cookie: {
    secure: process.env.NODE_ENV === "production" && TRUST_PROXY,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Tage
  },
});

// Static files (Frontend)
await app.register(fastifyStatic, {
  root: path.join(__dirname, "../frontend"),
  prefix: "/",
});

// ─── Health Check ───
app.get("/api/health", async () => ({
  status: "ok",
  setupComplete: isSetupComplete(),
  timestamp: new Date().toISOString(),
}));

// ─── Routes ───
await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(studentRoutes, { prefix: "/api" });
await app.register(contentRoutes, { prefix: "/api" });

// ─── Startup ───
async function start() {
  try {
    // 1. Migrate database
    migrate();

    // 2. Load content from YAML files
    const contentDir = process.env.CONTENT_DIR || "./content";
    const stats = await loadContent(contentDir);
    console.log(
      `✓ Content loaded: ${stats.modules} modules, ${stats.challenges} challenges`
    );

    // 3. Start server
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`\n🚀 LernQuest läuft auf http://localhost:${PORT}`);

    if (!isSetupComplete()) {
      console.log(`\n👉 Erst-Einrichtung: http://localhost:${PORT}/admin/setup\n`);
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
