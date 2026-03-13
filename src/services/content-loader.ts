import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface ChallengeData {
  id: string;
  module: string;
  track: string;
  title: string;
  difficulty: number;
  type: string;
  competencies: string[];
  tags: string[];
  prerequisites: string[];
  estimatedMinutes: number;
  description: string;
  hints: string[];
  config: Record<string, unknown>;
  author?: string;
  version?: string;
}

export interface TrackData {
  id: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  challenges: string[];
  unlockRule: string;
  thresholdPercent?: number;
}

export interface ModuleData {
  id: string;
  title: string;
  description: string;
  version: string;
  icon: string;
  color: string;
  estimatedHours: number;
  competencies: Array<{ id: string; title: string; description: string }>;
  tracks: string[];
  authors: Array<{ name: string; role: string }>;
}

// In-memory content store
const contentStore = {
  modules: new Map<string, ModuleData>(),
  tracks: new Map<string, TrackData>(),
  challenges: new Map<string, ChallengeData>(),
};

export function getModule(id: string) {
  return contentStore.modules.get(id);
}

export function getAllModules() {
  return Array.from(contentStore.modules.values());
}

export function getTrack(id: string) {
  return contentStore.tracks.get(id);
}

export function getTracksByModule(moduleId: string) {
  return Array.from(contentStore.tracks.values())
    .filter((t) => t.id.startsWith(moduleId))
    .sort((a, b) => a.order - b.order);
}

export function getChallenge(id: string) {
  return contentStore.challenges.get(id);
}

export function getChallengesByModule(moduleId: string) {
  return Array.from(contentStore.challenges.values()).filter(
    (c) => c.module === moduleId
  );
}

export function getChallengesByTrack(trackId: string) {
  const track = contentStore.tracks.get(trackId);
  if (!track) return [];
  return track.challenges
    .map((id) => contentStore.challenges.get(id))
    .filter(Boolean) as ChallengeData[];
}

export function getAllChallenges() {
  return Array.from(contentStore.challenges.values());
}

/**
 * Load all content from the content directory.
 * Reads _module.yaml, tracks/*.yaml, challenges/*.yaml
 */
export async function loadContent(contentDir: string) {
  const modulesDir = path.join(contentDir, "modules");

  // Also load custom content
  const customDir = path.join(contentDir, "custom");

  let moduleCount = 0;
  let challengeCount = 0;

  // Clear existing
  contentStore.modules.clear();
  contentStore.tracks.clear();
  contentStore.challenges.clear();

  // Load each module
  if (fs.existsSync(modulesDir)) {
    for (const moduleDir of fs.readdirSync(modulesDir)) {
      const modulePath = path.join(modulesDir, moduleDir);
      if (!fs.statSync(modulePath).isDirectory()) continue;

      // Load module metadata
      const moduleFile = path.join(modulePath, "_module.yaml");
      if (fs.existsSync(moduleFile)) {
        const raw = fs.readFileSync(moduleFile, "utf-8");
        const data = YAML.parse(raw) as ModuleData;
        contentStore.modules.set(data.id, data);
        moduleCount++;
      }

      // Load tracks
      const tracksDir = path.join(modulePath, "tracks");
      if (fs.existsSync(tracksDir)) {
        for (const file of fs.readdirSync(tracksDir)) {
          if (!file.endsWith(".yaml")) continue;
          const raw = fs.readFileSync(path.join(tracksDir, file), "utf-8");
          const data = YAML.parse(raw) as TrackData;
          contentStore.tracks.set(data.id, data);
        }
      }

      // Load challenges
      const challengesDir = path.join(modulePath, "challenges");
      if (fs.existsSync(challengesDir)) {
        for (const file of fs.readdirSync(challengesDir)) {
          if (!file.endsWith(".yaml")) continue;
          try {
            const raw = fs.readFileSync(
              path.join(challengesDir, file),
              "utf-8"
            );
            const data = YAML.parse(raw) as ChallengeData;
            contentStore.challenges.set(data.id, data);
            challengeCount++;
          } catch (err) {
            console.warn(`⚠ Skipping invalid challenge: ${file}`, err);
          }
        }
      }
    }
  }

  // Load custom challenges
  if (fs.existsSync(customDir)) {
    for (const file of walkYaml(customDir)) {
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const data = YAML.parse(raw) as ChallengeData;
        if (data.id && data.type) {
          contentStore.challenges.set(data.id, data);
          challengeCount++;
        }
      } catch (err) {
        console.warn(`⚠ Skipping custom file: ${file}`, err);
      }
    }
  }

  return { modules: moduleCount, challenges: challengeCount };
}

/** Recursively find all .yaml files */
function* walkYaml(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkYaml(full);
    else if (entry.name.endsWith(".yaml")) yield full;
  }
}
