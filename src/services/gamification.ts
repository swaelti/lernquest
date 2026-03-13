import { db } from "../db/index.js";
import { badges, progress, students } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { getAllChallenges } from "./content-loader.js";

interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (ctx: BadgeContext) => boolean;
  perModule?: boolean;
}

interface BadgeContext {
  studentId: string;
  module: string;
  completedCount: number;
  totalAttempts: number;
  firstTryCount: number;
  streakDays: number;
  fastestTime: number;
  moduleChallengeCount: number;
  moduleCompletedCount: number;
}

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "first_challenge",
    title: "Erster Schritt",
    description: "Erste Challenge abgeschlossen",
    icon: "rocket",
    check: (ctx) => ctx.completedCount >= 1,
  },
  {
    id: "five_completed",
    title: "Auf Kurs",
    description: "5 Challenges abgeschlossen",
    icon: "target",
    check: (ctx) => ctx.completedCount >= 5,
  },
  {
    id: "perfectionist",
    title: "Perfektionist",
    description: "5 Challenges beim ersten Versuch gelöst",
    icon: "star",
    check: (ctx) => ctx.firstTryCount >= 5,
  },
  {
    id: "speed_demon",
    title: "Speed Demon",
    description: "Eine Challenge in unter 2 Minuten gelöst",
    icon: "zap",
    check: (ctx) => ctx.fastestTime > 0 && ctx.fastestTime < 120,
  },
  {
    id: "module_complete",
    title: "Modul Komplett",
    description: "Alle Challenges eines Moduls bestanden",
    icon: "award",
    perModule: true,
    check: (ctx) =>
      ctx.moduleChallengeCount > 0 &&
      ctx.moduleCompletedCount >= ctx.moduleChallengeCount,
  },
  {
    id: "ten_completed",
    title: "Routinier",
    description: "10 Challenges abgeschlossen",
    icon: "medal",
    check: (ctx) => ctx.completedCount >= 10,
  },
];

/**
 * Check if student has earned any new badges after completing a challenge.
 * Returns array of newly earned badge types.
 */
export async function checkBadges(
  studentId: string,
  module: string
): Promise<string[]> {
  // Gather context
  const allProgress = await db.query.progress.findMany({
    where: eq(progress.studentId, studentId),
  });

  const completed = allProgress.filter((p) => p.status === "completed");
  const moduleChallenges = getAllChallenges().filter((c) => c.module === module);
  const moduleCompleted = completed.filter((p) =>
    moduleChallenges.some((c) => c.id === p.challengeId)
  );

  const ctx: BadgeContext = {
    studentId,
    module,
    completedCount: completed.length,
    totalAttempts: allProgress.reduce((sum, p) => sum + p.attempts, 0),
    firstTryCount: completed.filter((p) => p.attempts === 1).length,
    streakDays: 0, // TODO: calculate from timestamps
    fastestTime: Math.min(
      ...completed.map((p) => p.timeSpentS || Infinity)
    ),
    moduleChallengeCount: moduleChallenges.length,
    moduleCompletedCount: moduleCompleted.length,
  };

  const existingBadges = await db.query.badges.findMany({
    where: eq(badges.studentId, studentId),
  });
  const existingTypes = new Set(
    existingBadges.map((b) => `${b.badgeType}:${b.module || ""}`)
  );

  const newBadges: string[] = [];

  for (const def of BADGE_DEFINITIONS) {
    const badgeModule = def.perModule ? module : null;
    const key = `${def.id}:${badgeModule || ""}`;

    if (existingTypes.has(key)) continue;
    if (!def.check(ctx)) continue;

    await db.insert(badges).values({
      studentId,
      badgeType: def.id,
      module: badgeModule,
    });

    newBadges.push(def.id);
  }

  return newBadges;
}
