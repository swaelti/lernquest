import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/index.js";
import { students, progress, badges, classes } from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { getChallenge } from "../services/content-loader.js";
import { validateSubmission } from "../services/challenge-validator.js";
import { checkBadges } from "../services/gamification.js";

async function requireStudent(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.studentId) {
    return reply.status(401).send({ error: "Not logged in" });
  }
}

export const studentRoutes: FastifyPluginAsync = async (app) => {
  // ─── Eigener Fortschritt ───
  app.get("/progress", { preHandler: requireStudent }, async (request) => {
    const studentId = request.session.studentId!;
    return db.query.progress.findMany({
      where: eq(progress.studentId, studentId),
    });
  });

  // ─── Challenge-Lösung abgeben ───
  app.post<{
    Params: { id: string };
    Body: { answer: unknown; timeSpentS?: number };
  }>(
    "/challenges/:id/submit",
    { preHandler: requireStudent },
    async (request, reply) => {
      const studentId = request.session.studentId!;
      const challengeId = request.params.id;
      const { answer, timeSpentS } = request.body;

      const challenge = getChallenge(challengeId);
      if (!challenge) {
        return reply.status(404).send({ error: "Challenge not found" });
      }

      // Validate the submission
      const result = validateSubmission(challenge, answer);

      // Upsert progress
      const existing = await db.query.progress.findFirst({
        where: and(
          eq(progress.studentId, studentId),
          eq(progress.challengeId, challengeId)
        ),
      });

      if (existing) {
        await db
          .update(progress)
          .set({
            status: result.passed ? "completed" : "in_progress",
            attempts: existing.attempts + 1,
            bestScore: Math.max(existing.bestScore || 0, result.score),
            timeSpentS: (existing.timeSpentS || 0) + (timeSpentS || 0),
            completedAt: result.passed ? new Date().toISOString() : null,
            data: JSON.stringify(result),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(progress.id, existing.id));
      } else {
        await db.insert(progress).values({
          studentId,
          challengeId,
          status: result.passed ? "completed" : "in_progress",
          attempts: 1,
          bestScore: result.score,
          timeSpentS: timeSpentS || 0,
          completedAt: result.passed ? new Date().toISOString() : null,
          data: JSON.stringify(result),
        });
      }

      // Check for new badges
      if (result.passed) {
        const newBadges = await checkBadges(studentId, challenge.module);
        return { ...result, newBadges };
      }

      return result;
    }
  );

  // ─── Leaderboard ───
  app.get("/leaderboard", { preHandler: requireStudent }, async (request) => {
    const studentId = request.session.studentId!;
    const student = await db.query.students.findFirst({
      where: eq(students.id, studentId),
    });
    if (!student) return [];

    // Get class settings
    const cls = await db.query.classes.findFirst({
      where: eq(classes.id, student.classId),
    });
    const settings = JSON.parse(cls?.settings || "{}");
    if (!settings.leaderboard) return { disabled: true };

    // Get all students in class with total scores
    const classStudents = await db.query.students.findMany({
      where: and(eq(students.classId, student.classId), eq(students.active, true)),
    });

    const leaderboard = [];
    for (const s of classStudents) {
      const prog = await db.query.progress.findMany({
        where: eq(progress.studentId, s.id),
      });
      const totalScore = prog.reduce((sum, p) => sum + (p.bestScore || 0), 0);
      const completed = prog.filter((p) => p.status === "completed").length;

      leaderboard.push({
        nickname: settings.anonymousLeaderboard ? s.nickname : s.displayName,
        totalScore,
        completed,
        isMe: s.id === studentId,
      });
    }

    return leaderboard.sort((a, b) => b.totalScore - a.totalScore);
  });

  // ─── Eigene Badges ───
  app.get("/badges", { preHandler: requireStudent }, async (request) => {
    return db.query.badges.findMany({
      where: eq(badges.studentId, request.session.studentId!),
    });
  });
};
