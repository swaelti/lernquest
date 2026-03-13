import { FastifyPluginAsync } from "fastify";
import {
  getAllModules,
  getModule,
  getTracksByModule,
  getChallenge,
  getChallengesByModule,
  getChallengesByTrack,
} from "../services/content-loader.js";

export const contentRoutes: FastifyPluginAsync = async (app) => {
  // ─── Module ───
  app.get("/modules", async () => {
    return getAllModules().map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      icon: m.icon,
      color: m.color,
      estimatedHours: m.estimatedHours,
      trackCount: m.tracks.length,
    }));
  });

  app.get<{ Params: { id: string } }>("/modules/:id", async (request, reply) => {
    const mod = getModule(request.params.id);
    if (!mod) return reply.status(404).send({ error: "Module not found" });
    return mod;
  });

  // ─── Tracks ───
  app.get<{ Params: { id: string } }>(
    "/modules/:id/tracks",
    async (request, reply) => {
      const tracks = getTracksByModule(request.params.id);
      return tracks;
    }
  );

  // ─── Challenges ───
  app.get<{ Params: { id: string } }>(
    "/challenges/:id",
    async (request, reply) => {
      const challenge = getChallenge(request.params.id);
      if (!challenge) {
        return reply.status(404).send({ error: "Challenge not found" });
      }

      // Don't send solutions to the client
      const { config, ...rest } = challenge;
      const safeConfig = { ...config };
      delete (safeConfig as any).solution;
      delete (safeConfig as any).conclusions;

      // Strip correct answers for MC
      if (challenge.type === "multiple-choice" && safeConfig.options) {
        (safeConfig as any).options = (safeConfig.options as any[]).map(
          (o: any) => ({
            id: o.id,
            text: o.text,
          })
        );
      }

      return { ...rest, config: safeConfig };
    }
  );

  // ─── Challenge-Lösung anzeigen (nach Abschluss) ───
  app.get<{ Params: { id: string } }>(
    "/challenges/:id/solution",
    async (request, reply) => {
      if (!request.session.studentId) {
        return reply.status(401).send({ error: "Not authenticated" });
      }

      const challenge = getChallenge(request.params.id);
      if (!challenge) {
        return reply.status(404).send({ error: "Challenge not found" });
      }

      // Only show solution if student has completed or attempted 3+ times
      // (checked via progress in a real implementation)

      return {
        solution: (challenge.config as any).solution,
        explanation: (challenge.config as any).explanation,
      };
    }
  );
};
