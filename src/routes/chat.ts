import type { FastifyPluginAsync } from "fastify";

import { runProductAgent } from "../ai/agent.js";
import {safeErrorLog,redactLogText} from '../lib/safe-logging.js';
import {
  MissingOpenAIApiKeyError,
  MissingOpenAIModelError,
} from "../config/openai.js";

type ChatBody = {
  message?: string;
  latitude?: number;
  longitude?: number;
};

type ChatAgent = typeof runProductAgent;

const invalidCoordinate = (value: unknown, minimum: number, maximum: number) =>
  typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum;

export const createChatRoutes = (agent: ChatAgent = runProductAgent): FastifyPluginAsync => {
  return async (fastify) => {
    fastify.post<{ Body: ChatBody }>("/chat", async (request, reply) => {
      const startedAt = performance.now();
      const message = request.body?.message?.trim();

      request.log.info(
        { event: "chat.message_received", messageLength: message?.length ?? 0 },
        "Mensaje recibido",
      );

      if (!message) {
        return reply.status(400).send({
          error: "INVALID_MESSAGE",
          message: "El campo message es obligatorio",
        });
      }

      const { latitude, longitude } = request.body;
      const hasLatitude = latitude !== undefined;
      const hasLongitude = longitude !== undefined;

      if (hasLatitude !== hasLongitude) {
        return reply.status(400).send({
          error: "INVALID_COORDINATES",
          message: "latitude y longitude deben enviarse juntas",
        });
      }
      if (hasLatitude && invalidCoordinate(latitude, -90, 90)) {
        return reply.status(400).send({
          error: "INVALID_COORDINATES",
          message: "latitude debe estar entre -90 y 90",
        });
      }
      if (hasLongitude && invalidCoordinate(longitude, -180, 180)) {
        return reply.status(400).send({
          error: "INVALID_COORDINATES",
          message: "longitude debe estar entre -180 y 180",
        });
      }

      try {
        const result = await agent(
          hasLatitude && hasLongitude
            ? {
                message,
                latitude: latitude!,
                longitude: longitude!,
                onEvent: (agentEvent) => {
                  request.log.info(
                    { event: `chat.${agentEvent.type}`, ...(agentEvent.type === "tool_completed" ? { totalResults: agentEvent.totalResults } : {}) },
                    `Agente: ${agentEvent.type}`,
                  );
                },
              }
            : { message },
        );
        request.log.info(
          {
            event: result.toolUsed ? "chat.tool_executed" : "chat.completed",
            tool: result.toolUsed ? "findProductOffers" : undefined,
            usage: result.usage,
            durationMs: Math.round(performance.now() - startedAt),
            result: "ok",
          },
          result.toolUsed ? "Tool ejecutada" : "Chat completado",
        );
        return { message: result.message, toolUsed: result.toolUsed };
      } catch (error) {
        request.log.error(
          {
            event: "chat.error",
            durationMs: Math.round(performance.now() - startedAt),
            err: safeErrorLog(error), intent: 'SEARCH_PRODUCT', query: redactLogText(message??''), stage: 'chat.agent',
          },
          "Error en chat",
        );

        if (
          error instanceof MissingOpenAIApiKeyError ||
          error instanceof MissingOpenAIModelError
        ) {
          return reply.status(503).send({
            error: "OPENAI_NOT_CONFIGURED",
            message: "El agente conversacional todavía no está configurado",
          });
        }

        throw error;
      }
    });
  };
};

export const chatRoutes = createChatRoutes();
