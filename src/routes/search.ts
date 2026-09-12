import type { FastifyPluginAsync } from "fastify";

import {
  searchProductOffers,
  type SearchSort,
} from "../services/product-search.service.js";
import { resolveRadiusKm } from "../services/offer-quality.js";

type SearchQuery = {
  q?: string;
  lat?: string;
  lng?: string;
  sort?: string;
  radiusKm?: string;
};

type ValidSearchQuery = {
  query: string;
  latitude: number;
  longitude: number;
  sort: SearchSort;
  radiusKm: number | null;
};

export const parseSearchQuery = (
  input: SearchQuery,
): { value: ValidSearchQuery } | { error: string } => {
  const query = input.q?.trim();
  if (!query) return { error: "El parámetro q es obligatorio" };
  if (input.lat === undefined || input.lat.trim() === "") {
    return { error: "El parámetro lat es obligatorio" };
  }
  if (input.lng === undefined || input.lng.trim() === "") {
    return { error: "El parámetro lng es obligatorio" };
  }

  const latitude = Number(input.lat);
  const longitude = Number(input.lng);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: "lat debe ser un número entre -90 y 90" };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: "lng debe ser un número entre -180 y 180" };
  }
  if (input.sort !== undefined && !["distance", "price", "recommended"].includes(input.sort)) {
    return { error: "sort debe ser distance, price o recommended" };
  }
  let radiusKm: number | null;
  try {
    if (input.radiusKm !== undefined && (typeof input.radiusKm !== "string" || !input.radiusKm.trim())) throw new Error("radiusKm no puede estar vacío ni repetido.");
    radiusKm = resolveRadiusKm(input.radiusKm === undefined ? undefined : ["unlimited", "null"].includes(input.radiusKm) ? null : Number(input.radiusKm));
  } catch (error) { return { error: error instanceof Error ? error.message : "radiusKm inválido" }; }

  return {
    value: {
      query,
      latitude,
      longitude,
      sort: (input.sort ?? "distance") as SearchSort,
      radiusKm,
    },
  };
};

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: SearchQuery }>("/search", async (request, reply) => {
    const parsed = parseSearchQuery(request.query);

    if ("error" in parsed) {
      return reply.status(400).send({ error: "INVALID_QUERY", message: parsed.error });
    }

    const { query, latitude, longitude, sort, radiusKm } = parsed.value;
    const result = await searchProductOffers(query, latitude, longitude, sort, radiusKm);

    if (!result) {
      return reply.status(404).send({
        error: "PRODUCT_NOT_FOUND",
        message: "No encontramos un producto compatible con la búsqueda.",
      });
    }

    return { query, ...result };
  });
};
