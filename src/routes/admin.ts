import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/index.js";
import { teachers, classes, students, progress } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

/** Auth guard: only teachers/admins */
async function requireTeacher(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.teacherId) {
    return reply.status(401).send({ error: "Authentication required" });
  }
}

function generateJoinCode(): string {
  return nanoid(8).toLowerCase();
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // All admin routes require teacher auth
  app.addHook("onRequest", requireTeacher);

  // ═══════════════════════════════════════
  // KLASSEN
  // ═══════════════════════════════════════

  app.get("/classes", async (request) => {
    const teacherId = request.session.teacherId!;
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, teacherId),
    });

    // Admins sehen alle Klassen, Lehrer nur ihre
    if (teacher?.role === "admin") {
      return db.query.classes.findMany({ where: eq(classes.archived, false) });
    }
    return db.query.classes.findMany({
      where: and(eq(classes.teacherId, teacherId), eq(classes.archived, false)),
    });
  });

  app.post<{
    Body: { name: string; schoolYear?: string; modules?: string[] };
  }>("/classes", async (request) => {
    const { name, schoolYear, modules: mods } = request.body;
    const [cls] = await db
      .insert(classes)
      .values({
        name,
        joinCode: generateJoinCode(),
        teacherId: request.session.teacherId!,
        schoolYear,
        modules: JSON.stringify(mods || ["m347"]),
        settings: JSON.stringify({
          leaderboard: true,
          badges: true,
          anonymousLeaderboard: true,
        }),
      })
      .returning();
    return cls;
  });

  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      schoolYear?: string;
      modules?: string[];
      settings?: Record<string, unknown>;
    };
  }>("/classes/:id", async (request, reply) => {
    const { id } = request.params;
    const updates: Record<string, unknown> = {};
    const body = request.body;

    if (body.name) updates.name = body.name;
    if (body.schoolYear) updates.schoolYear = body.schoolYear;
    if (body.modules) updates.modules = JSON.stringify(body.modules);
    if (body.settings) updates.settings = JSON.stringify(body.settings);

    const [cls] = await db
      .update(classes)
      .set(updates)
      .where(eq(classes.id, id))
      .returning();

    return cls || reply.status(404).send({ error: "Class not found" });
  });

  app.delete<{ Params: { id: string } }>("/classes/:id", async (request) => {
    await db
      .update(classes)
      .set({ archived: true })
      .where(eq(classes.id, request.params.id));
    return { success: true };
  });

  app.post<{ Params: { id: string } }>(
    "/classes/:id/regenerate-code",
    async (request) => {
      const newCode = generateJoinCode();
      const [cls] = await db
        .update(classes)
        .set({ joinCode: newCode })
        .where(eq(classes.id, request.params.id))
        .returning();
      return { joinCode: cls?.joinCode };
    }
  );

  // ═══════════════════════════════════════
  // SCHÜLER
  // ═══════════════════════════════════════

  app.get<{ Params: { id: string } }>(
    "/classes/:id/students",
    async (request) => {
      return db.query.students.findMany({
        where: and(
          eq(students.classId, request.params.id),
          eq(students.active, true)
        ),
      });
    }
  );

  app.post<{
    Params: { id: string };
    Body: { displayName: string; nickname?: string };
  }>("/classes/:id/students", async (request) => {
    const { displayName, nickname } = request.body;
    const [student] = await db
      .insert(students)
      .values({
        displayName,
        nickname: nickname || displayName,
        classId: request.params.id,
      })
      .returning();
    return student;
  });

  app.delete<{ Params: { id: string } }>(
    "/students/:id",
    async (request) => {
      await db
        .update(students)
        .set({ active: false })
        .where(eq(students.id, request.params.id));
      return { success: true };
    }
  );

  // ═══════════════════════════════════════
  // FORTSCHRITT
  // ═══════════════════════════════════════

  app.get<{ Params: { id: string } }>(
    "/classes/:id/progress",
    async (request) => {
      // Get all students in class
      const classStudents = await db.query.students.findMany({
        where: and(
          eq(students.classId, request.params.id),
          eq(students.active, true)
        ),
      });

      // Get progress for all students
      const studentIds = classStudents.map((s) => s.id);
      const allProgress = [];

      for (const sid of studentIds) {
        const prog = await db.query.progress.findMany({
          where: eq(progress.studentId, sid),
        });
        allProgress.push(...prog);
      }

      return {
        students: classStudents.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          nickname: s.nickname,
        })),
        progress: allProgress,
      };
    }
  );

  // ═══════════════════════════════════════
  // LEHRPERSONEN (nur Admin)
  // ═══════════════════════════════════════

  app.post<{
    Body: { username: string; password: string; displayName: string };
  }>("/teachers", async (request, reply) => {
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, request.session.teacherId!),
    });

    if (teacher?.role !== "admin") {
      return reply.status(403).send({ error: "Admin required" });
    }

    const { username, password, displayName } = request.body;
    const passwordHash = await bcrypt.hash(password, 12);

    const [newTeacher] = await db
      .insert(teachers)
      .values({ username, displayName, passwordHash })
      .returning();

    return {
      id: newTeacher.id,
      username: newTeacher.username,
      displayName: newTeacher.displayName,
    };
  });

  // ═══════════════════════════════════════
  // INSTANZ-EINSTELLUNGEN
  // ═══════════════════════════════════════

  app.get("/settings", async () => {
    const rows = db.all(
      `SELECT key, value FROM instance_settings`
    ) as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    return settings;
  });

  app.put<{
    Body: Record<string, string>;
  }>("/settings", async (request) => {
    for (const [key, value] of Object.entries(request.body)) {
      db.run(
        `INSERT OR REPLACE INTO instance_settings (key, value, updated_at) 
         VALUES (?, ?, datetime('now'))`,
        [key, value]
      );
    }
    return { success: true };
  });
};
