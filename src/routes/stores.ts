import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma.js";

export const storeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/stores", async () => {
    return prisma.store.findMany({
      orderBy: [{ chain: "asc" }, { name: "asc" }],
    });
  });
};
