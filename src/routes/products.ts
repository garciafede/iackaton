import type { FastifyPluginAsync } from "fastify";

import { prisma } from "../lib/prisma.js";

type ProductParams = { id: string };
type SearchQuery = { q?: string };

const parseProductId = (value: string): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const productRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/products", async () => {
    return prisma.product.findMany({ orderBy: { name: "asc" } });
  });

  fastify.get<{ Querystring: SearchQuery }>("/products/search", async (request, reply) => {
    const query = request.query.q?.trim();

    if (!query) {
      return reply.status(400).send({ message: "El parámetro q es obligatorio" });
    }

    return prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { brand: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
    });
  });

  fastify.get<{ Params: ProductParams }>("/products/:id", async (request, reply) => {
    const id = parseProductId(request.params.id);

    if (id === null) {
      return reply.status(400).send({ message: "El id del producto debe ser un entero positivo" });
    }

    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      return reply.status(404).send({ message: "Producto no encontrado" });
    }

    return product;
  });

  fastify.get<{ Params: ProductParams }>("/products/:id/offers", async (request, reply) => {
    const id = parseProductId(request.params.id);

    if (id === null) {
      return reply.status(400).send({ message: "El id del producto debe ser un entero positivo" });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      return reply.status(404).send({ message: "Producto no encontrado" });
    }

    return prisma.offer.findMany({
      where: { productId: id },
      include: { store: true },
      orderBy: { price: "asc" },
    });
  });
};
