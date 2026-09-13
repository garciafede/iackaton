import "dotenv/config";

import Fastify, { type FastifyError } from "fastify";

import { prisma } from "./lib/prisma.js";
import { chatRoutes } from "./routes/chat.js";
import { productRoutes } from "./routes/products.js";
import { searchRoutes } from "./routes/search.js";
import { storeRoutes } from "./routes/stores.js";
import { whatsappWebhookRoutes } from "./whatsapp/webhook.js";
import { safeErrorLog, safeRequestLog } from "./lib/safe-logging.js";

const fastify = Fastify({ logger: { serializers: {
  req: safeRequestLog,
  err: (error) => ({ ...safeErrorLog(error), type: "Error", message: "Detalles privados omitidos", stack: "" }),
} } });

fastify.get("/", async () => {
  return { message: "API IACKATÓN funcionando 🚀" };
});

fastify.get("/health", async () => {
  return { status: "ok" };
});

await fastify.register(productRoutes);
await fastify.register(searchRoutes);
await fastify.register(storeRoutes);
await fastify.register(chatRoutes);
await fastify.register(whatsappWebhookRoutes);

fastify.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error({ event: "request.error", error: safeErrorLog(error) });

  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  return reply.status(500).send({ message: "Error interno del servidor" });
});

const shutdown = async () => {
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Puerto inválido");
  await fastify.listen({ port, host: "0.0.0.0" });
} catch (error) {
  fastify.log.error({ event: "startup.error", error: safeErrorLog(error) });
  await prisma.$disconnect();
  process.exit(1);
}
