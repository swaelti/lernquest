import { FastifyPluginAsync } from "fastify";
import { db, isSetupComplete } from "../db/index.js";
import { teachers, students, classes } from "../db/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

declare module "fastify" {
  interface Session {
    teacherId?: string;
    studentId?: string;
    role?: "admin" | "teacher" | "student";
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ─── Setup: Ersten Admin anlegen ───
  app.post<{
    Body: { username: string; password: string; displayName: string; instanceName: string };
  }>("/setup", async (request, reply) => {
    if (isSetupComplete()) {
      return reply.status(400).send({ error: "Setup already completed" });
    }

    const { username, password, displayName, instanceName } = request.body;

    if (!username || !password || password.length < 8) {
      return reply
        .status(400)
        .send({ error: "Username and password (min 8 chars) required" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [teacher] = await db
      .insert(teachers)
      .values({
        username,
        displayName,
        passwordHash,
        role: "admin",
      })
      .returning();

    // Save instance name
    db.run(
      `INSERT OR REPLACE INTO instance_settings (key, value) VALUES ('instance_name', '${instanceName || "LernQuest"}')`
    );

    request.session.teacherId = teacher.id;
    request.session.role = "admin";

    return { success: true, teacher: { id: teacher.id, displayName, role: "admin" } };
  });

  // ─── Lehrer-Login ───
  app.post<{
    Body: { username: string; password: string };
  }>("/login", async (request, reply) => {
    const { username, password } = request.body;

    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.username, username),
    });

    if (!teacher || !(await bcrypt.compare(password, teacher.passwordHash))) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    request.session.teacherId = teacher.id;
    request.session.role = teacher.role as "admin" | "teacher";

    return {
      success: true,
      teacher: {
        id: teacher.id,
        displayName: teacher.displayName,
        role: teacher.role,
      },
    };
  });

  // ─── Logout ───
  app.post("/logout", async (request) => {
    request.session.destroy();
    return { success: true };
  });

  // ─── Aktueller User ───
  app.get("/me", async (request, reply) => {
    if (request.session.teacherId) {
      const teacher = await db.query.teachers.findFirst({
        where: eq(teachers.id, request.session.teacherId),
      });
      if (teacher) {
        return {
          type: "teacher",
          id: teacher.id,
          displayName: teacher.displayName,
          role: teacher.role,
        };
      }
    }

    if (request.session.studentId) {
      const student = await db.query.students.findFirst({
        where: eq(students.id, request.session.studentId),
      });
      if (student) {
        return {
          type: "student",
          id: student.id,
          displayName: student.displayName,
          nickname: student.nickname,
          classId: student.classId,
        };
      }
    }

    return reply.status(401).send({ error: "Not authenticated" });
  });

  // ─── Schüler: Klasse beitreten ───
  app.post<{
    Body: { joinCode: string; displayName: string; nickname?: string };
  }>("/join", async (request, reply) => {
    const { joinCode, displayName, nickname } = request.body;

    if (!joinCode || !displayName) {
      return reply
        .status(400)
        .send({ error: "Join code and name required" });
    }

    const cls = await db.query.classes.findFirst({
      where: eq(classes.joinCode, joinCode.trim().toLowerCase()),
    });

    if (!cls || cls.archived) {
      return reply.status(404).send({ error: "Class not found" });
    }

    const [student] = await db
      .insert(students)
      .values({
        displayName,
        nickname: nickname || displayName,
        classId: cls.id,
      })
      .returning();

    request.session.studentId = student.id;
    request.session.role = "student";

    return {
      success: true,
      student: {
        id: student.id,
        displayName: student.displayName,
        className: cls.name,
      },
    };
  });
};
