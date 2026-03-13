import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { syncLog } from "../db/schema.js";
import { loadContent } from "./content-loader.js";

const CONTENT_DIR = process.env.CONTENT_DIR || "./content";
const CONTENT_REPO = process.env.CONTENT_REPO || "";

/**
 * Sync content from upstream git repository.
 */
export async function syncContent(): Promise<{
  added: number;
  updated: number;
  error?: string;
}> {
  if (!CONTENT_REPO) {
    return { added: 0, updated: 0, error: "No CONTENT_REPO configured" };
  }

  try {
    const modulesDir = path.join(CONTENT_DIR, "modules");

    if (existsSync(path.join(modulesDir, ".git"))) {
      // Pull latest
      execSync("git pull --ff-only", { cwd: modulesDir, timeout: 30000 });
    } else {
      // Clone fresh
      mkdirSync(modulesDir, { recursive: true });
      execSync(`git clone ${CONTENT_REPO} ${modulesDir}`, { timeout: 60000 });
    }

    // Get commit hash
    let commitHash = "";
    try {
      commitHash = execSync("git rev-parse --short HEAD", { cwd: modulesDir })
        .toString()
        .trim();
    } catch {}

    // Reload content
    const stats = await loadContent(CONTENT_DIR);

    // Log sync
    await db.insert(syncLog).values({
      source: "upstream",
      commitHash,
      challengesAdded: stats.challenges,
      challengesUpdated: 0,
      status: "success",
    });

    return { added: stats.challenges, updated: 0 };
  } catch (err: any) {
    await db.insert(syncLog).values({
      source: "upstream",
      status: "error",
      details: err.message,
    });

    return { added: 0, updated: 0, error: err.message };
  }
}
